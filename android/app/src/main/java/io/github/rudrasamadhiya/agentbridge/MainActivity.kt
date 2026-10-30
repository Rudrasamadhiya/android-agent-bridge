package io.github.rudrasamadhiya.agentbridge

import android.Manifest
import android.animation.ObjectAnimator
import android.animation.PropertyValuesHolder
import android.animation.ValueAnimator
import android.app.Activity
import android.app.AlertDialog
import android.app.NotificationManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.text.format.DateUtils
import android.text.format.Formatter
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import android.content.ActivityNotFoundException
import android.content.pm.PackageManager
import java.util.concurrent.Executors

/**
 * Three tabs, in the grouped-list style of developer tools:
 *  Connect  — the computer, pairing and the switches the agent needs
 *  Transfer — files between this phone and the computer
 *  Device   — this phone's name, optional permissions, unpairing
 */
class MainActivity : Activity() {
    private val REQ_CAPTURE = 41
    private val REQ_PICK = 42
    private val REQ_STORAGE = 43
    private val REQ_CAMERA = 44
    private val REQ_DELETE = 45

    // palette
    private val BG = Color.parseColor("#000000")
    private val CARD = Color.parseColor("#15171C")
    private val LINE = Color.parseColor("#262A31")
    private val TEXT = Color.parseColor("#F2F4F7")
    private val MUTED = Color.parseColor("#9AA3AF")
    private val FAINT = Color.parseColor("#6B7380")
    private val ACCENT = Color.parseColor("#3DDC97")
    private val ON_ACCENT = Color.parseColor("#06140E")
    private val AMBER = Color.parseColor("#F5B841")
    private val BLUE = Color.parseColor("#7AA7FF")
    private val RED = Color.parseColor("#F87171")
    private val MONO = Typeface.MONOSPACE

    private val io = Executors.newSingleThreadExecutor()
    private lateinit var pages: List<ScrollView>
    private lateinit var tabs: List<Tab>
    private var current = 0

    // things refreshed on every state change
    private lateinit var pill: TextView
    private lateinit var computerRow: Row
    private lateinit var computerDot: View
    private lateinit var a11yRow: Row
    private lateinit var captureRow: Row
    private lateinit var storageCard: View
    private lateinit var recentList: LinearLayout
    private lateinit var clearButton: TextView
    private lateinit var folderRow: Row
    private var scanner: ScanSheet? = null
    private var pendingDelete: Transfers.Item? = null
    private lateinit var nameRow: Row
    private lateinit var writeRow: Row
    private lateinit var dndRow: Row
    private lateinit var pairedRow: Row
    private lateinit var forgetCard: View
    private var pulse: ValueAnimator? = null
    private val onChange = { refresh() }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = BG
        window.navigationBarColor = CARD

        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(BG) }
        root.addView(appBar())
        val content = FrameLayout(this)
        pages = listOf(connectPage(), transferPage(), devicePage())
        pages.forEach { content.addView(it, FrameLayout.LayoutParams(-1, -1)) }
        root.addView(content, LinearLayout.LayoutParams(-1, 0, 1f))
        root.addView(bottomBar())
        setContentView(root)

        select(savedInstanceState?.getInt("tab") ?: 0)
        handleIntent(intent)
    }

    override fun onSaveInstanceState(out: Bundle) {
        super.onSaveInstanceState(out)
        out.putInt("tab", current)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        Status.listen(onChange)
        Transfers.listen(onChange)
        refresh()
    }

    override fun onPause() {
        Status.unlisten(onChange)
        Transfers.unlisten(onChange)
        pulse?.cancel()
        scanner?.dismiss()
        super.onPause()
    }

    // ---------- frame ----------

    private fun appBar() = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(20), dp(14), dp(16), dp(14))
        addView(ImageView(context).apply { setImageResource(R.mipmap.ic_launcher) }, LinearLayout.LayoutParams(dp(30), dp(30)))
        addView(text(getString(R.string.app_name), 22f, TEXT, bold = true).apply { setPadding(dp(10), 0, 0, 0) }, LinearLayout.LayoutParams(0, -2, 1f))
        pill = text("", 13f, MUTED, bold = true).apply { setPadding(dp(14), dp(7), dp(14), dp(7)) }
        addView(pill)
    }

    private inner class Tab(val view: LinearLayout, val icon: ImageView, val label: TextView, val iconBox: FrameLayout)

    private fun bottomBar(): View {
        val bar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(CARD)
            setPadding(0, dp(8), 0, dp(10))
        }
        tabs = listOf(Triple("Connect", R.drawable.ic_tab_connect, 0), Triple("Transfer", R.drawable.ic_tab_transfer, 1), Triple("Device", R.drawable.ic_tab_device, 2)).map { (name, res, i) ->
            val box = FrameLayout(this)
            val ic = ImageView(this).apply { setImageResource(res) }
            box.addView(ic, FrameLayout.LayoutParams(dp(22), dp(22), Gravity.CENTER))
            val lab = text(name, 12f, MUTED, bold = true).apply { gravity = Gravity.CENTER; setPadding(0, dp(4), 0, 0) }
            val col = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                addView(box, LinearLayout.LayoutParams(dp(64), dp(32)))
                addView(lab)
                isClickable = true
                background = RippleDrawable(ColorStateList.valueOf(Color.argb(30, 255, 255, 255)), null, null)
                setOnClickListener { select(i) }
            }
            bar.addView(col, LinearLayout.LayoutParams(0, -2, 1f))
            Tab(col, ic, lab, box)
        }
        return bar
    }

    private fun select(i: Int) {
        current = i
        pages.forEachIndexed { k, p -> p.visibility = if (k == i) View.VISIBLE else View.GONE }
        tabs.forEachIndexed { k, t ->
            val on = k == i
            t.icon.imageTintList = ColorStateList.valueOf(if (on) ON_ACCENT else MUTED)
            t.iconBox.background = if (on) rounded(ACCENT, 16, null) else null
            t.label.setTextColor(if (on) TEXT else MUTED)
        }
    }

    // ---------- Connect ----------

    private fun connectPage(): ScrollView = page {
        section("Computer")
        computerDot = View(this@MainActivity)
        computerRow = Row(R.drawable.ic_terminal, "Not paired", "Scan the QR code from your computer to start")
        computerRow.leading.addView(computerDot, FrameLayout.LayoutParams(dp(9), dp(9), Gravity.END or Gravity.BOTTOM))
        group(computerRow,
            Row(R.drawable.ic_qr, "Scan QR code", null, chevron = true) { scan() },
            Row(R.drawable.ic_link, "Enter pairing link", null, chevron = true) { pasteLink() })

        section("Setup")
        a11yRow = Row(R.drawable.ic_access, "Accessibility service", "Lets the agent see the screen and tap") { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        captureRow = Row(R.drawable.ic_camera, "Screen capture", null) { askCapture() }
        group(a11yRow, captureRow)
        if (Build.VERSION.SDK_INT >= 33) note("Accessibility switch greyed out? App info → ⋮ → Allow restricted settings.")

        section("On your computer")
        command("npx android-agent-bridge start", "Shows the QR code to scan")
        command("npx android-agent-bridge usb", "Or plug in with USB debugging: no QR needed")
    }

    // ---------- Transfer ----------

    private fun transferPage(): ScrollView = page {
        section("Send to computer")
        group(Row(R.drawable.ic_upload, "Choose files", "Photos, videos, documents — any size", chevron = true, accent = true) { pick() })
        note("Or tap Share → Agent Bridge in any app. Files land in Downloads/Agent Bridge on the computer.")

        section("Receive from computer")
        folderRow = Row(R.drawable.ic_open, "Open folder", "Downloads/${Transfers.FOLDER}", chevron = true) { openFolder() }
        group(folderRow)
        storageCard = group(Row(R.drawable.ic_download, "Allow saving to Downloads", "Android ${Build.VERSION.RELEASE} asks once", chevron = true) {
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), REQ_STORAGE)
        })
        command("npx android-agent-bridge send photo.jpg", "Send from the terminal")
        command("http://localhost:8350/drop", "Or drag and drop in a browser on the computer")

        clearButton = sectionWithAction("Recent", "Clear") { confirmClear() }
        recentList = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.VERTICAL }
        addView(recentList)
        note("Tap a file to open it. Clearing the list doesn't delete any files.")
    }

    // ---------- Device ----------

    private fun devicePage(): ScrollView = page {
        section("This device")
        nameRow = Row(R.drawable.ic_edit, Profile.name(this@MainActivity), "Name shown on the computer", chevron = true) { rename() }
        group(nameRow,
            Row(R.drawable.ic_tab_device, "${Build.MANUFACTURER.replaceFirstChar { it.uppercase() }} ${Build.MODEL}", "Android ${Build.VERSION.RELEASE} · API ${Build.VERSION.SDK_INT}"))
        note("Nothing is stored anywhere but this phone. There is no account.")

        section("Extra controls")
        writeRow = Row(R.drawable.ic_sun, "Brightness & rotation", "Modify system settings") {
            if (Build.VERSION.SDK_INT >= 23) startActivity(Intent(Settings.ACTION_MANAGE_WRITE_SETTINGS, Uri.parse("package:$packageName")))
        }
        dndRow = Row(R.drawable.ic_moon, "Do Not Disturb", "Do Not Disturb access") {
            if (Build.VERSION.SDK_INT >= 23) startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
        }
        group(writeRow, dndRow)
        command("npx android-agent-bridge permissions grant", "Over USB, switches both on for you")

        section("Pairing")
        pairedRow = Row(R.drawable.ic_terminal, "No computer", null)
        group(pairedRow)
        forgetCard = group(Row(R.drawable.ic_unlink, "Forget this computer", "It loses access until you pair again", danger = true) { confirmForget() })

        section("About")
        group(Row(R.drawable.ic_info, "Agent Bridge ${versionName()}", "Only the computer you paired can connect. Turn off the accessibility service to cut access at once."))
    }

    // ---------- actions ----------

    private fun handleIntent(i: Intent?) {
        when (i?.action) {
            Intent.ACTION_SEND -> {
                @Suppress("DEPRECATION")
                (i.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))?.let { sendAll(listOf(it)) }
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                @Suppress("DEPRECATION")
                i.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { sendAll(it) }
            }
            else -> i?.dataString?.takeIf { it.startsWith("agentbridge:") }?.let { pair(it) }
        }
    }

    private fun pick() {
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*").putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        startActivityForResult(i, REQ_PICK)
    }

    private fun sendAll(uris: List<Uri>) {
        select(1)
        Toast.makeText(this, "Sending ${uris.size} file${if (uris.size == 1) "" else "s"} to the computer…", Toast.LENGTH_SHORT).show()
        io.execute {
            var failed: String? = null
            for (u in uris) try { Transfers.send(this, u) } catch (e: Exception) { failed = e.message }
            runOnUiThread {
                Toast.makeText(this, failed?.let { "Couldn't send: $it" } ?: "Sent to the computer", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun pair(link: String) {
        val p = Pairing.parse(link)
        if (p == null) {
            Toast.makeText(this, "That is not an Agent Bridge pairing code.", Toast.LENGTH_LONG).show()
            return
        }
        p.save(this)
        AgentService.instance?.connection?.restart()
        Toast.makeText(this, "Paired with ${p.name}", Toast.LENGTH_SHORT).show()
        refresh()
    }

    private fun scan() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), REQ_CAMERA)
            return
        }
        scanner = ScanSheet(this, { pair(it) }, { pasteLink() }).also { it.show() }
    }

    // ---------- files ----------

    private fun openItem(t: Transfers.Item) {
        io.execute {
            val intent = Transfers.openIntent(this, t)
            runOnUiThread {
                when {
                    intent == null -> Toast.makeText(this, if (t.outgoing) "The original file was moved or deleted" else "Not on this phone anymore", Toast.LENGTH_SHORT).show()
                    else -> try { startActivity(intent) } catch (e: ActivityNotFoundException) {
                        Toast.makeText(this, "No app on this phone can open ${t.name}", Toast.LENGTH_SHORT).show()
                    } catch (e: Exception) {
                        Toast.makeText(this, "Couldn't open ${t.name}", Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    /** Received files are deleted from the phone; for sent ones only the entry goes (the original is yours). */
    private fun deleteItem(t: Transfers.Item) {
        if (t.outgoing) {
            AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
                .setTitle("Remove from the list?")
                .setMessage("${t.name} stays on your phone and on the computer.")
                .setPositiveButton("Remove") { _, _ -> Transfers.forget(this, t) }
                .setNegativeButton("Cancel", null)
                .show()
            return
        }
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Delete from this phone?")
            .setMessage("${t.name} will be deleted from ${Transfers.folderLabel(this)}. The copy on the computer stays.")
            .setPositiveButton("Delete") { _, _ ->
                io.execute {
                    val r = try { Transfers.delete(this, t) } catch (e: Exception) { null }
                    runOnUiThread {
                        when (r) {
                            is Transfers.Deleted.Done -> Toast.makeText(this, "Deleted", Toast.LENGTH_SHORT).show()
                            is Transfers.Deleted.Missing -> Toast.makeText(this, "Already gone; removed from the list", Toast.LENGTH_SHORT).show()
                            is Transfers.Deleted.Confirm -> {
                                pendingDelete = t
                                startIntentSenderForResult(r.sender, REQ_DELETE, null, 0, 0, 0)
                            }
                            null -> Toast.makeText(this, "Couldn't delete ${t.name}", Toast.LENGTH_SHORT).show()
                        }
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun confirmClear() {
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Clear recent transfers?")
            .setMessage("Only the list is cleared. Files stay on this phone and on the computer.")
            .setPositiveButton("Clear") { _, _ -> Transfers.clear(this) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    /** Shows where received files are, in the phone's own file manager when it can. */
    private fun openFolder() {
        if (Transfers.canWritePublic(this)) {
            for (i in Transfers.folderIntents(this)) {
                try { startActivity(i); return } catch (e: ActivityNotFoundException) { } catch (e: SecurityException) { }
            }
        }
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Received files")
            .setMessage("They are saved in:\n\n${Transfers.folderLabel(this)}\n\nOpen your Files app and go there.")
            .setPositiveButton("Copy path") { _, _ -> copy(Transfers.folderLabel(this)) }
            .setNegativeButton("OK", null)
            .show()
    }

    private fun input(hint: String, value: String = "") = EditText(this).apply {
        this.hint = hint
        setText(value)
        setSelection(value.length)
        setTextColor(TEXT)
        setHintTextColor(FAINT)
        setPadding(dp(14), dp(12), dp(14), dp(12))
        background = rounded(BG, 10, LINE)
    }

    private fun dialog(title: String, field: EditText, ok: String, onOk: (String) -> Unit) {
        val box = FrameLayout(this).apply { setPadding(dp(20), dp(8), dp(20), 0); addView(field) }
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle(title).setView(box)
            .setPositiveButton(ok) { _, _ -> onOk(field.text.toString()) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun pasteLink() = dialog("Pairing link", input("agentbridge://pair?…"), "Pair") { pair(it) }

    private fun rename() = dialog("Device name", input(Build.MODEL, Profile.name(this)), "Save") {
        if (it.isNotBlank()) {
            Profile.setName(this, it)
            AgentService.instance?.connection?.sendInfo()
            refresh()
        }
    }

    private fun confirmForget() {
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Forget this computer?")
            .setMessage("The agent loses access until you pair again.")
            .setPositiveButton("Forget") { _, _ ->
                Pairing.clear(this)
                AgentService.instance?.connection?.restart()
                refresh()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun askCapture() {
        if (Build.VERSION.SDK_INT >= 30 || CaptureService.instance != null) return
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(mpm.createScreenCaptureIntent(), REQ_CAPTURE)
    }

    private fun copy(text: String) {
        (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("command", text))
        Toast.makeText(this, "Copied", Toast.LENGTH_SHORT).show()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_CAMERA) {
            if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) scan()
            else Toast.makeText(this, "No camera access. Use \"Enter pairing link\" instead.", Toast.LENGTH_LONG).show()
        }
        refresh()
    }

    @Deprecated("Activity result API from the platform, kept for API 21 support")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        when (requestCode) {
            REQ_CAPTURE -> {
                if (resultCode == RESULT_OK && data != null) CaptureService.start(this, resultCode, data)
                window.decorView.postDelayed({ refresh() }, 600)
                return
            }
            REQ_PICK -> {
                if (resultCode != RESULT_OK || data == null) return
                val uris = data.clipData?.let { c -> (0 until c.itemCount).map { c.getItemAt(it).uri } } ?: listOfNotNull(data.data)
                if (uris.isNotEmpty()) sendAll(uris)
                return
            }
            REQ_DELETE -> {
                val t = pendingDelete
                pendingDelete = null
                if (resultCode == RESULT_OK && t != null) {
                    Transfers.forget(this, t)
                    Toast.makeText(this, "Deleted", Toast.LENGTH_SHORT).show()
                }
                return
            }
        }
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
    }

    // ---------- state ----------

    private fun serviceEnabled(): Boolean {
        val want = ComponentName(this, AgentService::class.java).flattenToString()
        val list = Settings.Secure.getString(contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        val split = TextUtils.SimpleStringSplitter(':').apply { setString(list) }
        return split.any { it.equals(want, true) }
    }

    private fun refresh() {
        val p = Pairing.load(this)
        val on = serviceEnabled() && AgentService.instance != null
        val state = Status.state
        val connected = on && state == Status.State.CONNECTED
        val base = AgentService.instance?.connection?.base

        // app bar pill
        val (pillText, pillColor) = when {
            p == null -> "Not paired" to FAINT
            !on -> "Setup needed" to AMBER
            connected -> (if (base?.contains("127.0.0.1") == true) "USB" else "Wi-Fi") to ACCENT
            state == Status.State.REJECTED -> "Re-pair" to RED
            else -> "Connecting" to BLUE
        }
        pill.text = "●  $pillText"
        pill.setTextColor(pillColor)
        pill.background = rounded(Color.TRANSPARENT, 20, LINE)

        // computer row
        val (title, sub, dot) = when {
            p == null -> Triple("Not paired", "Scan the QR code from your computer to start", FAINT)
            !on -> Triple(p.name, "Turn on the accessibility service below", AMBER)
            connected -> Triple(Status.detail.ifEmpty { p.name }, "Connected · ${base?.removePrefix("http://") ?: ""}", ACCENT)
            state == Status.State.REJECTED -> Triple(p.name, Status.detail.ifEmpty { "Pairing expired: scan again" }, RED)
            else -> Triple(p.name, "Looking for the bridge… is it running?", BLUE)
        }
        computerRow.title.text = title
        computerRow.sub(sub)
        computerDot.background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(dot); setStroke(dp(2), CARD) }
        pulse?.cancel()
        pulse = if (connected) ObjectAnimator.ofPropertyValuesHolder(computerDot,
            PropertyValuesHolder.ofFloat(View.ALPHA, 1f, 0.4f)).apply {
            duration = 1100; repeatCount = ValueAnimator.INFINITE; repeatMode = ValueAnimator.REVERSE; start()
        } else null

        a11yRow.trailing(if (on) "On" else "Turn on", if (on) ACCENT else AMBER, chevron = !on)
        val captureOn = Build.VERSION.SDK_INT >= 30 || CaptureService.instance != null
        captureRow.trailing(when { Build.VERSION.SDK_INT >= 30 -> "Built in"; captureOn -> "On"; else -> "Allow" }, if (captureOn) ACCENT else MUTED, chevron = !captureOn)
        captureRow.sub(if (captureOn) "Screenshots work over Wi-Fi too" else "Optional · over USB screenshots work without it")

        // transfer
        storageCard.visibility = if (Transfers.canWritePublic(this)) View.GONE else View.VISIBLE
        folderRow.sub(Transfers.folderLabel(this))
        recentList.removeAllViews()
        val items = Transfers.history(this)
        clearButton.visibility = if (items.isEmpty()) View.GONE else View.VISIBLE
        if (items.isEmpty()) recentList.addView(groupOf(listOf(Row(R.drawable.ic_tab_transfer, "Nothing yet", "Files you send or receive show up here"))))
        else recentList.addView(groupOf(items.take(12).map { t ->
            Row(if (t.outgoing) R.drawable.ic_upload else R.drawable.ic_download, t.name,
                (if (t.outgoing) "To computer" else "From computer") + " · " +
                    (if (t.size >= 0) Formatter.formatShortFileSize(this, t.size) + " · " else "") +
                    DateUtils.getRelativeTimeSpanString(t.time, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS),
                onClick = if (t.ok) ({ openItem(t) }) else null).apply {
                if (!t.ok) trailing("Failed", RED, chevron = false)
                button(R.drawable.ic_trash, if (t.outgoing) "Remove from list" else "Delete from phone") { deleteItem(t) }
            }
        }))

        // device
        nameRow.title.text = Profile.name(this)
        val canWrite = Build.VERSION.SDK_INT < 23 || Settings.System.canWrite(this)
        val dnd = Build.VERSION.SDK_INT < 23 || (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).isNotificationPolicyAccessGranted
        writeRow.trailing(if (canWrite) "Allowed" else "Allow", if (canWrite) ACCENT else MUTED, chevron = !canWrite)
        dndRow.trailing(if (dnd) "Allowed" else "Allow", if (dnd) ACCENT else MUTED, chevron = !dnd)
        pairedRow.title.text = p?.name ?: "No computer"
        pairedRow.sub(p?.let { "${it.hosts.joinToString(", ")} · port ${it.port}" })
        forgetCard.visibility = if (p == null) View.GONE else View.VISIBLE
    }

    // ---------- building blocks ----------

    /** One list row: icon, title, optional subtitle, optional trailing value and chevron. */
    private inner class Row(
        icon: Int, t: String, s: String?, chevron: Boolean = false,
        accent: Boolean = false, danger: Boolean = false, val onClick: (() -> Unit)? = null,
    ) {
        val view = LinearLayout(this@MainActivity).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(13), dp(14), dp(13))
            minimumHeight = dp(56)
        }
        val leading = FrameLayout(this@MainActivity)
        val title = text(t, 16f, if (danger) RED else if (accent) ACCENT else TEXT, bold = accent || danger)
        private val subView = text(s ?: "", 13f, MUTED).apply { visibility = if (s == null) View.GONE else View.VISIBLE; setPadding(0, dp(2), 0, 0) }
        private val value = text("", 14f, MUTED, bold = true).apply { visibility = View.GONE }
        private val chev = ImageView(this@MainActivity).apply { setImageResource(R.drawable.ic_chevron); imageTintList = ColorStateList.valueOf(FAINT); visibility = if (chevron) View.VISIBLE else View.GONE }

        init {
            leading.addView(ImageView(this@MainActivity).apply {
                setImageResource(icon)
                imageTintList = ColorStateList.valueOf(if (danger) RED else if (accent) ACCENT else MUTED)
            }, FrameLayout.LayoutParams(dp(22), dp(22), Gravity.CENTER))
            view.addView(leading, LinearLayout.LayoutParams(dp(26), dp(26)))
            val c = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(14), 0, dp(8), 0) }
            c.addView(title)
            c.addView(subView)
            view.addView(c, LinearLayout.LayoutParams(0, -2, 1f))
            view.addView(value)
            view.addView(chev, LinearLayout.LayoutParams(dp(18), dp(18)).apply { leftMargin = dp(4) })
            if (onClick != null) {
                view.isClickable = true
                view.background = RippleDrawable(ColorStateList.valueOf(Color.argb(28, 255, 255, 255)), null, ColorDrawableMask())
                view.setOnClickListener { onClick.invoke() }
            }
        }

        fun sub(s: String?) {
            subView.text = s ?: ""
            subView.visibility = if (s.isNullOrEmpty()) View.GONE else View.VISIBLE
        }

        /** A small round icon button at the end of the row, separate from tapping the row itself. */
        fun button(icon: Int, desc: String, onTap: () -> Unit) {
            view.setPadding(view.paddingLeft, view.paddingTop, dp(6), view.paddingBottom)
            view.addView(ImageView(this@MainActivity).apply {
                setImageResource(icon)
                imageTintList = ColorStateList.valueOf(MUTED)
                contentDescription = desc
                setPadding(dp(10), dp(10), dp(10), dp(10))
                background = RippleDrawable(ColorStateList.valueOf(Color.argb(40, 255, 255, 255)), null,
                    GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.WHITE) })
                isClickable = true
                setOnClickListener { onTap() }
            }, LinearLayout.LayoutParams(dp(42), dp(42)))
        }

        fun trailing(v: String, color: Int, chevron: Boolean) {
            value.text = v
            value.setTextColor(color)
            value.visibility = View.VISIBLE
            chev.visibility = if (chevron) View.VISIBLE else View.GONE
        }
    }

    private fun ColorDrawableMask() = GradientDrawable().apply { setColor(Color.WHITE) }

    private fun groupOf(rows: List<Row>): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = rounded(CARD, 14, LINE)
        clipToOutline = true
        rows.forEachIndexed { k, r ->
            if (k > 0) addView(View(context).apply { setBackgroundColor(LINE) }, LinearLayout.LayoutParams(-1, 1).apply { leftMargin = dp(56) })
            addView(r.view)
        }
    }

    // page-building DSL: sections, grouped cards, notes and copyable commands
    private lateinit var building: LinearLayout

    private fun page(build: LinearLayout.() -> Unit): ScrollView {
        val col = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), 0, dp(16), dp(28)) }
        building = col
        col.build()
        return ScrollView(this).apply { setBackgroundColor(BG); addView(col) }
    }

    private fun section(t: String) = building.addView(text(t, 14f, MUTED, bold = true).apply { setPadding(dp(4), dp(22), 0, dp(10)) })

    /** A section heading with a small text action on the right, like "Recent ... Clear". */
    private fun sectionWithAction(t: String, action: String, onClick: () -> Unit): TextView {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.BOTTOM
            setPadding(dp(4), dp(22), 0, dp(6))
        }
        row.addView(text(t, 14f, MUTED, bold = true).apply { setPadding(0, 0, 0, dp(4)) }, LinearLayout.LayoutParams(0, -2, 1f))
        val a = text(action, 14f, ACCENT, bold = true).apply {
            setPadding(dp(12), dp(4), dp(8), dp(4))
            background = RippleDrawable(ColorStateList.valueOf(Color.argb(40, 255, 255, 255)), null, rounded(Color.WHITE, 12, null))
            isClickable = true
            setOnClickListener { onClick() }
        }
        row.addView(a)
        building.addView(row)
        return a
    }

    private fun group(vararg rows: Row): View = groupOf(rows.toList()).also { building.addView(it) }

    private fun note(t: String) = building.addView(text(t, 12.5f, FAINT).apply { setPadding(dp(4), dp(8), dp(4), 0); setLineSpacing(0f, 1.15f) })

    private fun command(cmd: String, caption: String) {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(12), dp(14), dp(12))
            background = RippleDrawable(ColorStateList.valueOf(Color.argb(28, 255, 255, 255)), rounded(CARD, 12, LINE), null)
            isClickable = true
            setOnClickListener { copy(cmd) }
        }
        val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        line.addView(text(if (cmd.startsWith("http")) cmd else "$ $cmd", 13f, TEXT).apply { typeface = MONO }, LinearLayout.LayoutParams(0, -2, 1f))
        line.addView(text("COPY", 11f, ACCENT, bold = true).apply { letterSpacing = 0.08f })
        box.addView(line)
        box.addView(text(caption, 12f, FAINT).apply { setPadding(0, dp(4), 0, 0) })
        building.addView(box, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(10) })
    }

    private fun text(t: String, size: Float, color: Int, bold: Boolean = false) = TextView(this).apply {
        text = t
        textSize = size
        setTextColor(color)
        typeface = Typeface.create(if (bold) "sans-serif-medium" else "sans-serif", Typeface.NORMAL)
    }

    private fun rounded(fill: Int, radius: Int, stroke: Int?) = GradientDrawable().apply {
        cornerRadius = radius * resources.displayMetrics.density
        setColor(fill)
        if (stroke != null) setStroke(dp(1), stroke)
    }

    private fun versionName() = try { packageManager.getPackageInfo(packageName, 0).versionName ?: "" } catch (e: Exception) { "" }
}
