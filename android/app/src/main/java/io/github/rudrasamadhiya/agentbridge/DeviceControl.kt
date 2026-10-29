package io.github.rudrasamadhiya.agentbridge

import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Direct device commands, so an agent doesn't have to navigate Settings by hand:
 * volume, brightness, torch, rotation, do-not-disturb, system settings pages, links,
 * dialer, web search, battery, current app, recent notifications, wake, clipboard,
 * and a permissions check. Nothing here places calls, sends messages or pays.
 */
class DeviceControl(private val ctx: Context, private val launch: (Intent) -> Boolean) {
    private val main = Handler(Looper.getMainLooper())

    // ---------- volume ----------

    private val streams = linkedMapOf(
        "media" to AudioManager.STREAM_MUSIC,
        "ring" to AudioManager.STREAM_RING,
        "notification" to AudioManager.STREAM_NOTIFICATION,
        "alarm" to AudioManager.STREAM_ALARM,
        "call" to AudioManager.STREAM_VOICE_CALL,
        "system" to AudioManager.STREAM_SYSTEM,
    )

    fun volume(a: JSONObject): JSONObject {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val name = a.optString("stream", "media").ifEmpty { "media" }
        val stream = streams[name] ?: throw IllegalArgumentException("stream must be one of ${streams.keys.joinToString(", ")}")
        val action = a.optString("action", "get").ifEmpty { "get" }
        val max = am.getStreamMaxVolume(stream)
        val flags = if (a.optBoolean("show")) AudioManager.FLAG_SHOW_UI else 0
        try {
            when {
                action == "get" -> {}
                action == "up" -> am.adjustStreamVolume(stream, AudioManager.ADJUST_RAISE, flags)
                action == "down" -> am.adjustStreamVolume(stream, AudioManager.ADJUST_LOWER, flags)
                action == "max" -> am.setStreamVolume(stream, max, flags)
                action == "mute" -> if (Build.VERSION.SDK_INT >= 23) am.adjustStreamVolume(stream, AudioManager.ADJUST_MUTE, flags) else @Suppress("DEPRECATION") am.setStreamMute(stream, true)
                action == "unmute" -> if (Build.VERSION.SDK_INT >= 23) am.adjustStreamVolume(stream, AudioManager.ADJUST_UNMUTE, flags) else @Suppress("DEPRECATION") am.setStreamMute(stream, false)
                action.endsWith("%") -> am.setStreamVolume(stream, (max * (action.dropLast(1).toDouble() / 100)).toInt().coerceIn(0, max), flags)
                action.toIntOrNull() != null -> am.setStreamVolume(stream, action.toInt().coerceIn(0, max), flags)
                else -> throw IllegalArgumentException("volume action: get, up, down, mute, unmute, max, a level 0–$max, or a percentage like 50%")
            }
        } catch (e: SecurityException) {
            // changing ring/notification volume while Do Not Disturb is on needs DND access
            throw IllegalStateException("Android refused to change $name volume (Do Not Disturb is on?). Allow DND access: `permissions grant` over USB, or `dnd off` first.")
        }
        val all = JSONObject()
        for ((k, s) in streams) all.put(k, JSONObject().put("level", am.getStreamVolume(s)).put("max", am.getStreamMaxVolume(s)))
        val ringer = when (am.ringerMode) { AudioManager.RINGER_MODE_SILENT -> "silent"; AudioManager.RINGER_MODE_VIBRATE -> "vibrate"; else -> "normal" }
        return JSONObject().put("stream", name).put("level", am.getStreamVolume(stream)).put("max", max).put("ringer", ringer).put("all", all)
    }

    fun ringer(a: JSONObject): JSONObject {
        val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val mode = a.optString("mode")
        if (mode.isNotEmpty()) {
            try {
                am.ringerMode = when (mode) {
                    "normal" -> AudioManager.RINGER_MODE_NORMAL
                    "vibrate" -> AudioManager.RINGER_MODE_VIBRATE
                    "silent" -> AudioManager.RINGER_MODE_SILENT
                    else -> throw IllegalArgumentException("ringer mode: normal, vibrate or silent")
                }
            } catch (e: SecurityException) {
                throw IllegalStateException("Android needs Do Not Disturb access for that. Run `permissions grant` over USB, or allow it in the app's settings.")
            }
        }
        return JSONObject().put("ringer", when (am.ringerMode) { AudioManager.RINGER_MODE_SILENT -> "silent"; AudioManager.RINGER_MODE_VIBRATE -> "vibrate"; else -> "normal" })
    }

    // ---------- brightness & rotation (need "Modify system settings") ----------

    private fun canWrite() = Build.VERSION.SDK_INT < 23 || Settings.System.canWrite(ctx)

    private fun needWrite(): Nothing {
        if (Build.VERSION.SDK_INT >= 23) open(Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:" + ctx.packageName)))
        throw IllegalStateException("Agent Bridge needs “Modify system settings”. The settings page is open on the phone: switch it on. Or run `permissions grant` with the phone on USB.")
    }

    fun brightness(a: JSONObject): JSONObject {
        val cr = ctx.contentResolver
        val v = a.optString("value", "get").ifEmpty { "get" }
        if (v != "get") {
            if (!canWrite()) needWrite()
            when {
                v == "auto" -> Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC)
                v == "manual" -> Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
                v.trimEnd('%').toIntOrNull() != null -> {
                    val pct = v.trimEnd('%').toInt().coerceIn(0, 100)
                    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, Settings.System.SCREEN_BRIGHTNESS_MODE_MANUAL)
                    Settings.System.putInt(cr, Settings.System.SCREEN_BRIGHTNESS, Math.round(pct * 255 / 100f).coerceIn(1, 255))
                }
                else -> throw IllegalArgumentException("brightness: get, 0–100, auto or manual")
            }
        }
        val raw = Settings.System.getInt(cr, Settings.System.SCREEN_BRIGHTNESS, 0)
        val auto = Settings.System.getInt(cr, Settings.System.SCREEN_BRIGHTNESS_MODE, 0) == Settings.System.SCREEN_BRIGHTNESS_MODE_AUTOMATIC
        return JSONObject().put("percent", Math.round(raw * 100 / 255f)).put("auto", auto)
    }

    fun rotation(a: JSONObject): JSONObject {
        val cr = ctx.contentResolver
        val v = a.optString("value", "get").ifEmpty { "get" }
        if (v != "get") {
            if (!canWrite()) needWrite()
            when (v) {
                "auto" -> Settings.System.putInt(cr, Settings.System.ACCELEROMETER_ROTATION, 1)
                "portrait", "landscape" -> {
                    Settings.System.putInt(cr, Settings.System.ACCELEROMETER_ROTATION, 0)
                    Settings.System.putInt(cr, Settings.System.USER_ROTATION, if (v == "portrait") 0 else 1)
                }
                else -> throw IllegalArgumentException("rotation: get, auto, portrait or landscape")
            }
        }
        val auto = Settings.System.getInt(cr, Settings.System.ACCELEROMETER_ROTATION, 0) == 1
        val user = Settings.System.getInt(cr, Settings.System.USER_ROTATION, 0)
        return JSONObject().put("auto", auto).put("locked", if (auto) JSONObject.NULL else if (user % 2 == 0) "portrait" else "landscape")
    }

    // ---------- torch ----------

    fun torch(a: JSONObject): JSONObject {
        if (Build.VERSION.SDK_INT < 23) throw IllegalStateException("The flashlight command needs Android 6+. Use quick settings instead.")
        val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val id = cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
            ?: throw IllegalStateException("This phone has no flashlight.")
        val on = when (a.optString("state", "on")) { "on" -> true; "off" -> false; else -> throw IllegalArgumentException("flashlight: on or off") }
        cm.setTorchMode(id, on)
        return JSONObject().put("flashlight", if (on) "on" else "off")
    }

    // ---------- do not disturb ----------

    fun dnd(a: JSONObject): JSONObject {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT < 23) throw IllegalStateException("Do Not Disturb control needs Android 6+.")
        val v = a.optString("state", "get").ifEmpty { "get" }
        if (v != "get") {
            if (!nm.isNotificationPolicyAccessGranted) {
                open(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
                throw IllegalStateException("Agent Bridge needs Do Not Disturb access. The settings page is open on the phone: allow Agent Bridge. Or run `permissions grant` over USB.")
            }
            val want = when (v) {
                "on" -> NotificationManager.INTERRUPTION_FILTER_PRIORITY
                "alarms" -> NotificationManager.INTERRUPTION_FILTER_ALARMS
                "total" -> NotificationManager.INTERRUPTION_FILTER_NONE
                "off" -> NotificationManager.INTERRUPTION_FILTER_ALL
                else -> throw IllegalArgumentException("dnd: get, on (priority only), alarms, total or off")
            }
            nm.setInterruptionFilter(want)
            val until = System.currentTimeMillis() + 2000
            while (nm.currentInterruptionFilter != want && System.currentTimeMillis() < until) Thread.sleep(100)
        }
        val f = nm.currentInterruptionFilter
        return JSONObject().put("dnd", when (f) {
            NotificationManager.INTERRUPTION_FILTER_ALL -> "off"
            NotificationManager.INTERRUPTION_FILTER_PRIORITY -> "on (priority only)"
            NotificationManager.INTERRUPTION_FILTER_ALARMS -> "alarms only"
            NotificationManager.INTERRUPTION_FILTER_NONE -> "total silence"
            else -> "unknown"
        })
    }

    // ---------- opening things ----------

    private fun open(i: Intent) {
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val shown = try { launch(i) } catch (e: ActivityNotFoundException) { throw IllegalStateException("No app on this phone can open that.") }
        if (!shown) throw IllegalStateException("Android didn't bring it to the front (the phone may be locked, or it was already open).")
    }

    private val pages = linkedMapOf(
        "settings" to Settings.ACTION_SETTINGS,
        "wifi" to Settings.ACTION_WIFI_SETTINGS,
        "bluetooth" to Settings.ACTION_BLUETOOTH_SETTINGS,
        "mobile-data" to Settings.ACTION_DATA_ROAMING_SETTINGS,
        "airplane" to Settings.ACTION_AIRPLANE_MODE_SETTINGS,
        "hotspot" to Settings.ACTION_WIRELESS_SETTINGS,
        "nfc" to Settings.ACTION_NFC_SETTINGS,
        "location" to Settings.ACTION_LOCATION_SOURCE_SETTINGS,
        "display" to Settings.ACTION_DISPLAY_SETTINGS,
        "sound" to Settings.ACTION_SOUND_SETTINGS,
        "battery" to Intent.ACTION_POWER_USAGE_SUMMARY,
        "storage" to Settings.ACTION_INTERNAL_STORAGE_SETTINGS,
        "apps" to Settings.ACTION_APPLICATION_SETTINGS,
        "notifications" to "android.settings.NOTIFICATION_SETTINGS",
        "security" to Settings.ACTION_SECURITY_SETTINGS,
        "privacy" to Settings.ACTION_PRIVACY_SETTINGS,
        "accessibility" to Settings.ACTION_ACCESSIBILITY_SETTINGS,
        "date" to Settings.ACTION_DATE_SETTINGS,
        "language" to Settings.ACTION_LOCALE_SETTINGS,
        "keyboard" to Settings.ACTION_INPUT_METHOD_SETTINGS,
        "developer" to Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS,
        "about" to Settings.ACTION_DEVICE_INFO_SETTINGS,
        "dnd" to "android.settings.ZEN_MODE_SETTINGS",
        "cast" to Settings.ACTION_CAST_SETTINGS,
        "vpn" to Settings.ACTION_VPN_SETTINGS,
    )

    fun settingsPage(a: JSONObject): JSONObject {
        val page = a.optString("page")
        val app = a.optString("app")
        when {
            app.isNotEmpty() -> open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$app")))
            // Android 10+ quick panels (toggle Wi-Fi / internet / NFC / volume without leaving the app)
            page == "wifi-panel" && Build.VERSION.SDK_INT >= 29 -> open(Intent(Settings.Panel.ACTION_WIFI))
            page == "internet-panel" && Build.VERSION.SDK_INT >= 29 -> open(Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY))
            page == "volume-panel" && Build.VERSION.SDK_INT >= 29 -> open(Intent(Settings.Panel.ACTION_VOLUME))
            pages.containsKey(page) -> open(Intent(pages[page]))
            else -> throw IllegalArgumentException("settings page: ${pages.keys.joinToString(", ")} (Android 10+: wifi-panel, internet-panel, volume-panel), or app=<package> for an app's info page")
        }
        return JSONObject().put("opened", if (app.isNotEmpty()) "app info for $app" else page)
    }

    fun viewUrl(a: JSONObject): JSONObject {
        val url = a.optString("url").trim()
        if (url.isEmpty()) throw IllegalArgumentException("url is required")
        // deep links (myapp://...), web pages, geo:, mailto:, tel: all go to the app that handles them
        val uri = Uri.parse(if (Regex("^[a-zA-Z][a-zA-Z0-9+.-]*:").containsMatchIn(url)) url else "https://$url")
        val i = Intent(Intent.ACTION_VIEW, uri)
        a.optString("package").takeIf { it.isNotEmpty() }?.let { i.setPackage(it) }
        open(i)
        return JSONObject().put("opened", uri.toString())
    }

    /** Opens the dialer with the number filled in. Never places the call. */
    fun dial(a: JSONObject): JSONObject {
        val n = a.optString("number").filter { it.isDigit() || it in "+*#" }
        if (n.isEmpty()) throw IllegalArgumentException("number is required")
        open(Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(n))))
        return JSONObject().put("dialer", n).put("note", "number filled in; the call is not placed")
    }

    fun webSearch(a: JSONObject): JSONObject {
        val q = a.optString("query").trim()
        if (q.isEmpty()) throw IllegalArgumentException("query is required")
        try {
            open(Intent(Intent.ACTION_WEB_SEARCH).putExtra("query", q))
        } catch (e: IllegalStateException) {
            open(Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/search?q=" + Uri.encode(q))))
        }
        return JSONObject().put("searched", q)
    }

    /** Play Store page for an app (by package) or a store search, so the user can install it. */
    fun store(a: JSONObject): JSONObject {
        val pkg = a.optString("package")
        val q = a.optString("query")
        val uri = if (pkg.isNotEmpty()) "market://details?id=$pkg" else "market://search?q=" + Uri.encode(q)
        try {
            open(Intent(Intent.ACTION_VIEW, Uri.parse(uri)))
        } catch (e: IllegalStateException) {
            open(Intent(Intent.ACTION_VIEW, Uri.parse(uri.replace("market://", "https://play.google.com/store/apps/"))))
        }
        return JSONObject().put("opened", uri)
    }

    // ---------- status ----------

    fun battery(): JSONObject {
        val i = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return JSONObject()
        val level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        val status = i.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val plug = i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0)
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        return JSONObject()
            .put("percent", if (scale > 0) level * 100 / scale else level)
            .put("charging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL)
            .put("plugged", when (plug) { BatteryManager.BATTERY_PLUGGED_AC -> "charger"; BatteryManager.BATTERY_PLUGGED_USB -> "usb"; BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"; else -> "no" })
            .put("temperature_c", i.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0)
            .put("power_saver", pm.isPowerSaveMode)
            .put("screen_on", if (Build.VERSION.SDK_INT >= 20) pm.isInteractive else JSONObject.NULL)
    }

    /** Turns the screen on (does not unlock a PIN or pattern). */
    fun wake(): JSONObject {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as PowerManager
        @Suppress("DEPRECATION")
        val wl = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP, "agentbridge:wake")
        wl.acquire(3000)
        return JSONObject().put("screen", "on").put("note", "a lock screen with a PIN or pattern stays locked")
    }

    fun clipboard(a: JSONObject): JSONObject {
        val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val set = a.optString("set", "")
        val latch = CountDownLatch(1)
        var text: String? = null
        main.post {
            if (a.has("set")) cm.setPrimaryClip(ClipData.newPlainText("agent", set))
            // Android 10+ only lets the focused app or IME read the clipboard; this may come back empty
            text = cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(ctx)?.toString()
            latch.countDown()
        }
        latch.await(2, TimeUnit.SECONDS)
        return JSONObject().put("clipboard", text ?: JSONObject.NULL).put("set", a.has("set"))
    }

    // ---------- notifications (seen through accessibility events) ----------

    private val recent = ArrayDeque<JSONObject>()

    fun onEvent(e: AccessibilityEvent) {
        if (e.eventType != AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED) return
        val text = e.text.joinToString(" ").trim()
        if (text.isEmpty()) return
        synchronized(recent) {
            recent.addFirst(JSONObject().put("app", e.packageName?.toString() ?: "?").put("text", text).put("time", System.currentTimeMillis()))
            while (recent.size > 50) recent.removeLast()
        }
    }

    fun notifications(a: JSONObject): JSONObject {
        val limit = a.optInt("limit", 20)
        val arr = JSONArray()
        synchronized(recent) {
            recent.take(limit).forEach { arr.put(it) }
            if (a.optBoolean("clear")) recent.clear()
        }
        return JSONObject().put("notifications", arr).put("note", "notifications posted since the Agent Bridge service started")
    }

    // ---------- permissions ----------

    fun permissions(): JSONObject {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return JSONObject()
            .put("accessibility", true)
            .put("modify_system_settings", canWrite())
            .put("do_not_disturb_access", if (Build.VERSION.SDK_INT >= 23) nm.isNotificationPolicyAccessGranted else true)
            .put("screen_capture", if (Build.VERSION.SDK_INT >= 30) "built-in" else if (CaptureService.instance != null) "on" else "off (USB screenshots still work)")
            .put("gestures", Build.VERSION.SDK_INT >= 24)
            .put("flashlight", Build.VERSION.SDK_INT >= 23)
    }
}
