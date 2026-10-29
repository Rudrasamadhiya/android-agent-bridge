package io.github.rudrasamadhiya.agentbridge

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.annotation.TargetApi
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.DisplayMetrics
import android.view.Display
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * The part that sees and acts. Runs while its accessibility switch is on,
 * holds the connection to the computer and answers its commands.
 *
 * Android versions:
 *   5.0+  element list, typing, clicking elements, scrolling lists, back/home/recents
 *   7.0+  taps and swipes anywhere (gestures): grid cells and coordinates
 *   11+   screenshots without the screen-capture prompt, Enter key
 * What a version lacks is returned as `needsAdb` and done over USB by the computer.
 */
class AgentService : AccessibilityService() {
    companion object {
        @Volatile var instance: AgentService? = null
            private set
    }

    var connection: Connection? = null
        private set
    private var last: Snapshot? = null
    private var gridCols = 12
    private val main = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        instance = this
        connection = Connection(this, ::handle).also { it.start() }
    }

    @Volatile private var lastEventAt = 0L

    private val device by lazy { DeviceControl(this, ::startAndWait) }

    /**
     * Start an activity and wait until something new is in front. For ~5 s after Home is pressed
     * Android holds back app starts, so it tries again once if nothing appeared.
     */
    private fun startAndWait(i: Intent): Boolean {
        val before = rootInActiveWindow?.packageName?.toString()
        fun changed(ms: Long): Boolean {
            val until = System.currentTimeMillis() + ms
            while (System.currentTimeMillis() < until) {
                val now = rootInActiveWindow?.packageName?.toString()
                if (now != null && now != before) return true
                Thread.sleep(150)
            }
            return false
        }
        startActivity(i)
        if (changed(2500)) return true
        startActivity(i)
        return changed(6000)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        lastEventAt = System.currentTimeMillis()
        event?.let { device.onEvent(it) }
    }

    @Volatile private var lastActionAt = 0L

    /**
     * Wait until the screen has stopped changing for [quietMs] (pages loading, animations), at most [maxMs].
     * Right after an action, first give the screen up to 1.5 s to start changing: a new page often
     * begins drawing only after a short delay, and reading before that returns the old screen.
     */
    private fun waitIdle(maxMs: Long, quietMs: Long = 400) {
        if (maxMs <= 0) return
        val start = System.currentTimeMillis()
        val deadline = start + maxMs
        val action = lastActionAt
        if (start - action < 5000) {
            val until = minOf(action + 1500, deadline)
            while (lastEventAt <= action && System.currentTimeMillis() < until) Thread.sleep(50)
        }
        while (System.currentTimeMillis() < deadline && System.currentTimeMillis() - lastEventAt < quietMs) Thread.sleep(80)
    }
    override fun onInterrupt() {}

    override fun onUnbind(intent: Intent?): Boolean {
        shutdown()
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        shutdown()
        super.onDestroy()
    }

    private fun shutdown() {
        connection?.stop()
        connection = null
        instance = null
        Status.set(Status.State.NO_SERVICE)
    }

    // ---- info ----

    private fun screenSize(): Pair<Int, Int> {
        val m = DisplayMetrics()
        @Suppress("DEPRECATION")
        (getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(m)
        return Pair(m.widthPixels, m.heightPixels)
    }

    private fun screenshotMode() = when {
        Build.VERSION.SDK_INT >= 30 -> "built-in"
        CaptureService.instance != null -> "screen capture"
        else -> "off (allow screen capture in the app, or use USB)"
    }

    fun info(): JSONObject {
        val (w, h) = screenSize()
        return JSONObject()
            .put("deviceName", Profile.name(this))
            .put("manufacturer", Build.MANUFACTURER)
            .put("model", Build.MODEL)
            .put("release", Build.VERSION.RELEASE)
            .put("sdk", Build.VERSION.SDK_INT)
            .put("screenW", w)
            .put("screenH", h)
            .put("gestures", Build.VERSION.SDK_INT >= 24)
            .put("screenshot", screenshotMode())
    }

    // ---- commands ----

    private fun handle(cmd: String, a: JSONObject): Any? {
        val actions = setOf("tap", "swipe", "scroll", "type", "key", "open_app")
        if (cmd in actions) lastActionAt = System.currentTimeMillis()
        return dispatch(cmd, a).also { if (cmd in actions) lastActionAt = System.currentTimeMillis() }
    }

    private fun dispatch(cmd: String, a: JSONObject): Any? = when (cmd) {
        "info" -> info()
        "elements" -> {
            waitIdle(a.optLong("idle", 1500))
            // all: also list elements hidden under sheets/dialogs (for debugging what covers what)
            JSONObject().put("outline", snapshot(hideCovered = !a.optBoolean("all")).outline())
        }
        "annotate" -> annotate(a)
        "ocr" -> ocr(a)
        "volume" -> device.volume(a)
        "ringer" -> device.ringer(a)
        "brightness" -> device.brightness(a)
        "rotation" -> device.rotation(a)
        "torch" -> device.torch(a)
        "dnd" -> device.dnd(a)
        "settings_page" -> device.settingsPage(a)
        "view_url" -> device.viewUrl(a)
        "dial" -> device.dial(a)
        "web_search" -> device.webSearch(a)
        "store" -> device.store(a)
        "battery" -> device.battery()
        "wake" -> device.wake()
        "clipboard" -> device.clipboard(a)
        "notifications" -> device.notifications(a)
        "permissions" -> device.permissions()
        "current_app" -> currentApp()
        "receive_file" -> JSONObject().put("saved", Transfers.receive(this, a.getString("id"), a.optString("name", "file"), a.optLong("size", -1)))
        "screen" -> screen(a)
        "tap" -> tap(a)
        "swipe" -> swipe(a)
        "scroll" -> scroll(a)
        "type" -> type(a)
        "key" -> key(a)
        "open_app" -> openApp(a)
        "apps" -> apps(a)
        "wait_text" -> waitText(a)
        else -> throw IllegalArgumentException("unknown command \"$cmd\"")
    }

    private fun snapshot(cols: Int = gridCols, hideCovered: Boolean = true): Snapshot {
        val (w, h) = screenSize()
        return Snapshot.take(this, w, h, cols, hideCovered).also { last = it }
    }

    private fun screen(a: JSONObject): JSONObject {
        val mode = a.optString("mode", "marks").ifEmpty { "marks" }
        gridCols = a.optInt("cols", gridCols).coerceIn(4, 30)
        val maxSide = a.optInt("maxSide", 1280).coerceIn(320, 4096)
        waitIdle(a.optLong("idle", 1500))
        val snap = snapshot(gridCols)
        val out = JSONObject().put("outline", snap.outline())
        val (bmp, err) = capture()
        if (bmp == null) return out.put("captureError", err)
        val img = Overlay.draw(bmp, snap, mode, maxSide)
        val bytes = ByteArrayOutputStream()
        img.compress(Bitmap.CompressFormat.JPEG, 75, bytes)
        return out.put("image", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP))
            .put("mime", "image/jpeg").put("width", img.width).put("height", img.height)
    }

    /** Draw the labels on a screenshot the computer took over USB (Android without built-in capture). */
    private fun annotate(a: JSONObject): JSONObject {
        val bytes = Base64.decode(a.getString("image"), Base64.DEFAULT)
        val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: throw IllegalArgumentException("could not decode the screenshot")
        val snap = last ?: snapshot()
        val img = Overlay.draw(bmp, snap, a.optString("mode", "marks").ifEmpty { "marks" }, a.optInt("maxSide", 1280).coerceIn(320, 4096))
        val out = ByteArrayOutputStream()
        img.compress(Bitmap.CompressFormat.JPEG, 75, out)
        return JSONObject().put("image", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)).put("mime", "image/jpeg")
    }

    /** OCR of the current screen, or of a screenshot the computer took over USB (`image`). */
    private fun ocr(a: JSONObject): JSONObject {
        waitIdle(a.optLong("idle", 1500))
        val bmp = if (a.has("image")) {
            val bytes = Base64.decode(a.getString("image"), Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: throw IllegalArgumentException("could not decode the screenshot")
        } else {
            val (b, err) = capture()
            b ?: return JSONObject().put("captureError", err)
        }
        val (w, h) = screenSize()
        return Ocr.toJson(Ocr.read(bmp, w, h))
    }

    private fun capture(): Pair<Bitmap?, String?> {
        if (Build.VERSION.SDK_INT >= 30) {
            val (b, err) = accessibilityScreenshot()
            if (b != null) return Pair(b, null)
            CaptureService.instance?.grab()?.let { return Pair(it, null) }
            return Pair(null, err)
        }
        CaptureService.instance?.grab()?.let { return Pair(it, null) }
        return Pair(null, "screen capture is not allowed yet: tap \"Allow screen capture\" in the Agent Bridge app")
    }

    @TargetApi(30)
    private fun accessibilityScreenshot(): Pair<Bitmap?, String?> {
        repeat(3) {
            val latch = CountDownLatch(1)
            var bmp: Bitmap? = null
            var code = -1
            takeScreenshot(Display.DEFAULT_DISPLAY, mainExecutor, object : TakeScreenshotCallback {
                override fun onSuccess(r: ScreenshotResult) {
                    val hb = r.hardwareBuffer
                    try {
                        bmp = Bitmap.wrapHardwareBuffer(hb, r.colorSpace)?.copy(Bitmap.Config.ARGB_8888, true)
                    } finally {
                        hb.close()
                        latch.countDown()
                    }
                }

                override fun onFailure(errorCode: Int) {
                    code = errorCode
                    latch.countDown()
                }
            })
            latch.await(5, TimeUnit.SECONDS)
            bmp?.let { return Pair(it, null) }
            // 3 = called again too soon (Android allows about 3 per second)
            if (code != 3) return Pair(null, if (code == 5) "this screen is protected by the app (e.g. banking, video streaming)" else "screenshot failed (code $code)")
            Thread.sleep(400)
        }
        return Pair(null, "screenshot failed (rate limited)")
    }

    // ---- targets ----

    private class Target(val x: Int, val y: Int, val el: Element?)

    /** allowSystem: let text match the status/navigation bar (otherwise only the app's own elements). */
    private fun resolve(target: String?, allowSystem: Boolean = false, loose: Boolean = false): Target {
        val s = target?.trim().orEmpty()
        if (s.isEmpty()) throw IllegalArgumentException("target is required")
        val snap = last ?: snapshot()
        Regex("^#?(\\d+)$").find(s)?.let { m ->
            val n = m.groupValues[1].toInt()
            val el = snap.element(n) ?: throw IllegalArgumentException("no element $n on the last screen (it had ${snap.elements.size}). Read the screen again.")
            return Target(el.x, el.y, el)
        }
        Regex("^(\\d+)\\s*,\\s*(\\d+)$").find(s)?.let { m ->
            return Target(m.groupValues[1].toInt(), m.groupValues[2].toInt(), null)
        }
        snap.cellCenter(s)?.let { return Target(it.first, it.second, null) }
        // visible text, on the current screen
        val fresh = snapshot()
        // Best match first: whole label, then one part of a "Title · subtitle" label, then any label
        // containing it. Ties go to the smallest element, and lists only win when nothing else matches,
        // so "Connections" hits the Connections row, not the list that contains it.
        val all = (fresh.elements + fresh.texts).sortedWith(compareBy({ it.role == "list" }, { it.bounds.width().toLong() * it.bounds.height() }))
        // ("Bike" must pick "Bike,Fare…" before "Parcel Bike,Fare…", so starts-with beats contains)
        // Scroll containers ("reels tray container") are never a strong text match: their labels are
        // ids or every child's text glued together, and tapping one opens whatever sits in its middle.
        fun strong(all: List<Element>) = all.filter { it.role != "list" }.let { list -> list.firstOrNull { it.label.equals(s, true) }
            ?: list.firstOrNull { e -> e.label.split(" · ").any { it.trim().equals(s, true) } }
            ?: list.firstOrNull { it.label.startsWith(s, true) }
            ?: list.firstOrNull { e -> e.label.split(" · ", ", ").any { it.trim().startsWith(s, true) } } }
        fun weak(list: List<Element>) = list.firstOrNull { it.label.contains(s, true) }
        // The app's own controls win: "Home" means the app's Home tab, not the Android Home button.
        // A match that only *contains* the text is used when asked (loose), so the computer can
        // first look for an exact match in the screen text (OCR).
        val app = all.filter { !it.system }
        val sys = all.filter { it.system }
        strong(app)?.let { return Target(it.x, it.y, it) }
        if (loose) weak(app)?.let { return Target(it.x, it.y, it) }
        if (allowSystem) (strong(sys) ?: weak(sys))?.let { return Target(it.x, it.y, it) }
        val hints = listOfNotNull(
            weak(app)?.let { "closest in the app: \"${it.label.take(60)}\", pass loose=true" },
            (strong(sys) ?: weak(sys))?.let { "only the system bar's \"${it.label}\", pass system=true" },
        )
        if (hints.isNotEmpty()) throw IllegalArgumentException("nothing on screen matches \"$s\" (${hints.joinToString("; ")}).")
        throw IllegalArgumentException("nothing on screen matches \"$s\". Use an element number, a grid cell like C7, or x,y.")
    }

    private fun clickable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        var n = node
        var depth = 0
        while (n != null && depth < 8) {
            if (n.isClickable || n.isLongClickable) return n
            n = n.parent
            depth++
        }
        return null
    }

    private fun needsAdb(op: JSONObject, reason: String, x: Int? = null, y: Int? = null): JSONObject {
        val r = JSONObject().put("needsAdb", op.put("reason", reason))
        if (x != null) r.put("x", x).put("y", y)
        return r
    }

    // ---- actions ----

    @TargetApi(24)
    private fun gesture(path: Path, ms: Long): Boolean {
        val latch = CountDownLatch(1)
        var ok = false
        val g = GestureDescription.Builder().addStroke(GestureDescription.StrokeDescription(path, 0, ms)).build()
        main.post {
            val sent = dispatchGesture(g, object : GestureResultCallback() {
                override fun onCompleted(d: GestureDescription?) { ok = true; latch.countDown() }
                override fun onCancelled(d: GestureDescription?) { latch.countDown() }
            }, null)
            if (!sent) latch.countDown()
        }
        latch.await(ms + 3000, TimeUnit.MILLISECONDS)
        return ok
    }

    private fun tap(a: JSONObject): JSONObject {
        val t = resolve(a.optString("target"), a.optBoolean("system"), a.optBoolean("loose"))
        val long = a.optBoolean("long")
        if (Build.VERSION.SDK_INT >= 24) {
            val p = Path().apply { moveTo(t.x.toFloat(), t.y.toFloat()) }
            if (!gesture(p, if (long) 800L else 60L)) throw IllegalStateException("the tap was cancelled by the system")
            return JSONObject().put("x", t.x).put("y", t.y).put("via", "gesture")
        }
        val node = clickable(t.el?.node)
        if (node != null && node.performAction(if (long) AccessibilityNodeInfo.ACTION_LONG_CLICK else AccessibilityNodeInfo.ACTION_CLICK)) {
            return JSONObject().put("x", t.x).put("y", t.y).put("via", "action")
        }
        return needsAdb(JSONObject().put("op", "tap").put("x", t.x).put("y", t.y).put("long", long),
            "Tapping a spot that is not a clickable element needs Android 7+.", t.x, t.y)
    }

    private fun swipe(a: JSONObject): JSONObject {
        val f = resolve(a.optString("from"))
        val t = resolve(a.optString("to"))
        val ms = a.optLong("ms", 300).coerceIn(50, 5000)
        if (Build.VERSION.SDK_INT >= 24) {
            val p = Path().apply { moveTo(f.x.toFloat(), f.y.toFloat()); lineTo(t.x.toFloat(), t.y.toFloat()) }
            gesture(p, ms)
            return JSONObject().put("via", "gesture")
        }
        return needsAdb(JSONObject().put("op", "swipe").put("x1", f.x).put("y1", f.y).put("x2", t.x).put("y2", t.y).put("ms", ms),
            "Swiping needs Android 7+.")
    }

    private fun scroll(a: JSONObject): JSONObject {
        val dir = a.optString("direction", "down")
        val amount = a.optDouble("amount", 0.6).coerceIn(0.1, 1.0)
        val (w, h) = screenSize()
        val el = if (a.optString("target").isNotEmpty()) resolve(a.optString("target")).el
            else snapshot().elements.filter { it.scrollable }.maxByOrNull { it.bounds.width() * it.bounds.height() }
        // stay away from the screen edges, where swipes open system panels
        val area = Rect(el?.bounds ?: Rect(0, 0, w, h))
        if (!area.intersect(Rect(0, (h * 0.12).toInt(), w, (h * 0.88).toInt()))) area.set(0, (h * 0.12).toInt(), w, (h * 0.88).toInt())
        val cx = area.centerX()
        val cy = area.centerY()
        val dy = (area.height() * amount / 2).toInt()
        val dx = (area.width() * amount / 2).toInt()
        // content moves toward `dir`, so the finger moves the other way
        val (x1, y1, x2, y2) = when (dir) {
            "down" -> listOf(cx, cy + dy, cx, cy - dy)
            "up" -> listOf(cx, cy - dy, cx, cy + dy)
            "right" -> listOf(cx + dx, cy, cx - dx, cy)
            "left" -> listOf(cx - dx, cy, cx + dx, cy)
            else -> throw IllegalArgumentException("direction must be up, down, left or right")
        }
        if (Build.VERSION.SDK_INT >= 24) {
            gesture(Path().apply { moveTo(x1.toFloat(), y1.toFloat()); lineTo(x2.toFloat(), y2.toFloat()) }, 400)
            return JSONObject().put("via", "gesture")
        }
        val action = if (dir == "down" || dir == "right") AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        if (el?.node?.performAction(action) == true) return JSONObject().put("via", "action")
        return needsAdb(JSONObject().put("op", "swipe").put("x1", x1).put("y1", y1).put("x2", x2).put("y2", y2).put("ms", 400),
            "Nothing scrollable was found to scroll without gestures (Android 7+).")
    }

    /** The text field with input focus. Only editable nodes count: keyboards report their own keys as focused. */
    private fun focusedInput(): AccessibilityNodeInfo? {
        val roots = mutableListOf<AccessibilityNodeInfo>()
        try {
            windows.filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }.sortedByDescending { it.layer }.forEach { w -> w.root?.let { roots += it } }
        } catch (e: Exception) { }
        rootInActiveWindow?.let { roots.add(0, it) }
        for (r in roots) {
            val f = r.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            if (f != null && f.isEditable) return f
        }
        for (r in roots) findFocusedEditable(r, 0)?.let { return it }
        return null
    }

    private fun findFocusedEditable(n: AccessibilityNodeInfo, depth: Int): AccessibilityNodeInfo? {
        if (depth > 40) return null
        if (n.isEditable && n.isFocused) return n
        for (i in 0 until n.childCount) n.getChild(i)?.let { c -> findFocusedEditable(c, depth + 1)?.let { return it } }
        return null
    }

    private fun findEditable(n: AccessibilityNodeInfo?, depth: Int = 0): AccessibilityNodeInfo? {
        if (n == null || depth > 8) return null
        if (n.isEditable) return n
        for (i in 0 until n.childCount) findEditable(n.getChild(i), depth + 1)?.let { return it }
        return null
    }

    private fun type(a: JSONObject): JSONObject {
        val text = a.optString("text")
        var node: AccessibilityNodeInfo? = null
        if (a.optString("target").isNotEmpty()) {
            val t = resolve(a.optString("target"))
            node = findEditable(t.el?.node)
            if (node == null) {
                // not an input itself (e.g. a search icon): tap it, then use whatever got focus
                tap(JSONObject().put("target", a.optString("target")))
                Thread.sleep(500)
                node = focusedInput()
            } else if (!node.isFocused) {
                node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
            }
        } else node = focusedInput()
        node ?: throw IllegalStateException("no text field is focused. Pass target, or tap the field first.")

        val showingHint = Build.VERSION.SDK_INT >= 26 && node.isShowingHintText
        val existing = if (a.optBoolean("append") && !showingHint) node.text?.toString().orEmpty() else ""
        val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, existing + text) }
        var ok = node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args) && hasText(node, text)
        if (!ok) ok = paste(node, text, a.optBoolean("append")) && hasText(node, text)
        if (!ok) return needsAdb(JSONObject().put("op", "text").put("text", text), "This field does not accept typed text from accessibility.")

        if (a.optBoolean("submit")) {
            if (Build.VERSION.SDK_INT >= 30) {
                node.refresh()
                if (!node.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)) {
                    throw IllegalStateException("text typed, but this field has no Enter/Send action; tap the send button instead")
                }
            } else return needsAdb(JSONObject().put("op", "key").put("key", "enter"), "Text was typed, but pressing Enter needs Android 11+.")
        }
        return JSONObject().put("via", "accessibility")
    }

    /** Some fields accept SET_TEXT but ignore it; read the field back to be sure. */
    private fun hasText(node: AccessibilityNodeInfo, text: String): Boolean {
        Thread.sleep(150)
        node.refresh()
        if (node.isPassword) return true // contents are hidden from accessibility
        val now = node.text?.toString().orEmpty()
        return now.contains(text) || (text.isNotEmpty() && now.isNotEmpty() && !(Build.VERSION.SDK_INT >= 26 && node.isShowingHintText))
    }

    /** Fallback for fields that ignore SET_TEXT: put the text on the clipboard and paste. */
    private fun paste(node: AccessibilityNodeInfo, text: String, append: Boolean): Boolean {
        val latch = CountDownLatch(1)
        main.post {
            (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("agent", text))
            latch.countDown()
        }
        latch.await(2, TimeUnit.SECONDS)
        if (!append) {
            val len = node.text?.length ?: 0
            node.performAction(AccessibilityNodeInfo.ACTION_SET_SELECTION, Bundle().apply {
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_START_INT, 0)
                putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_SELECTION_END_INT, len)
            })
        }
        return node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
    }

    private fun key(a: JSONObject): JSONObject {
        val name = a.optString("key")
        val action = when (name) {
            "back" -> GLOBAL_ACTION_BACK
            "home" -> GLOBAL_ACTION_HOME
            "recents" -> GLOBAL_ACTION_RECENTS
            "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
            "quick_settings" -> GLOBAL_ACTION_QUICK_SETTINGS
            "power_dialog" -> GLOBAL_ACTION_POWER_DIALOG
            "lock" -> if (Build.VERSION.SDK_INT >= 28) GLOBAL_ACTION_LOCK_SCREEN
                else return needsAdb(JSONObject().put("op", "key").put("key", "power"), "Locking the screen needs Android 9+.")
            "enter" -> {
                val n = focusedInput()
                if (Build.VERSION.SDK_INT >= 30 && n != null && n.performAction(AccessibilityNodeInfo.AccessibilityAction.ACTION_IME_ENTER.id)) {
                    return JSONObject().put("via", "accessibility")
                }
                return needsAdb(JSONObject().put("op", "key").put("key", "enter"), "Pressing Enter needs Android 11+ and a focused text field.")
            }
            else -> throw IllegalArgumentException("unknown key \"$name\"")
        }
        if (!performGlobalAction(action)) throw IllegalStateException("the system refused \"$name\"")
        return JSONObject().put("via", "accessibility")
    }

    private fun currentApp(): JSONObject {
        val pkg = rootInActiveWindow?.packageName?.toString() ?: return JSONObject().put("package", JSONObject.NULL)
        val label = try { packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString() } catch (e: Exception) { pkg }
        return JSONObject().put("package", pkg).put("label", label)
    }

    private fun launchable(): List<Pair<String, String>> {
        val pm = packageManager
        val i = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        return pm.queryIntentActivities(i, 0)
            .map { Pair(it.loadLabel(pm).toString(), it.activityInfo.packageName) }
            .distinctBy { it.second }
            .sortedBy { it.first.lowercase() }
    }

    private fun openApp(a: JSONObject): JSONObject {
        val name = a.optString("name").trim()
        if (name.isEmpty()) throw IllegalArgumentException("name is required")
        var pkg = name
        var label = name
        var intent = packageManager.getLaunchIntentForPackage(name)
        if (intent == null) {
            val apps = launchable()
            val hit = apps.firstOrNull { it.first.equals(name, true) }
                ?: apps.firstOrNull { it.first.startsWith(name, true) }
                ?: apps.firstOrNull { it.first.contains(name, true) || it.second.contains(name, true) }
                ?: if (a.optBoolean("store")) {
                    // not installed: show it in the Play Store so the user can install it
                    return device.store(JSONObject().put("query", name)).put("installed", false).put("label", name).put("package", JSONObject.NULL)
                } else throw IllegalArgumentException("no installed app called \"$name\" (pass store=true to open it in the Play Store)")
            label = hit.first
            pkg = hit.second
            intent = packageManager.getLaunchIntentForPackage(pkg) ?: throw IllegalStateException("$label cannot be opened")
        } else {
            label = try { packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString() } catch (e: Exception) { pkg }
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        startActivity(intent)
        // For ~5 s after Home is pressed Android holds back app starts, so check it really came up
        if (!waitForeground(pkg, 3000)) {
            startActivity(intent)
            if (!waitForeground(pkg, 6000)) throw IllegalStateException("$label did not come to the front (the phone may be locked, or another app blocked it)")
        }
        return JSONObject().put("package", pkg).put("label", label)
    }

    private fun waitForeground(pkg: String, ms: Long): Boolean {
        val deadline = System.currentTimeMillis() + ms
        while (System.currentTimeMillis() < deadline) {
            if (rootInActiveWindow?.packageName?.toString() == pkg) return true
            Thread.sleep(150)
        }
        return false
    }

    private fun apps(a: JSONObject): JSONObject {
        val f = a.optString("filter")
        val arr = JSONArray()
        launchable().filter { f.isEmpty() || it.first.contains(f, true) || it.second.contains(f, true) }
            .forEach { arr.put(JSONObject().put("label", it.first).put("package", it.second)) }
        return JSONObject().put("apps", arr)
    }

    private fun waitText(a: JSONObject): JSONObject {
        val text = a.optString("text")
        val deadline = System.currentTimeMillis() + a.optLong("timeout", 10000)
        while (true) {
            val snap = snapshot()
            val found = (snap.elements + snap.texts).any { it.label.contains(text, true) }
            if (found || System.currentTimeMillis() >= deadline) return JSONObject().put("found", found).put("outline", snap.outline())
            Thread.sleep(400)
        }
    }
}
