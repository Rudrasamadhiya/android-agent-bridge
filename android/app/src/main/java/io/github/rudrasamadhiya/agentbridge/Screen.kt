package io.github.rudrasamadhiya.agentbridge

import android.accessibilityservice.AccessibilityService
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.os.Build
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo

/**
 * One thing on screen. Numbered (n > 0) when it can be acted on.
 * (x, y) is where to tap it: its centre, or another visible spot when something covers the centre.
 */
class Element(
    val n: Int,
    val node: AccessibilityNodeInfo,
    val bounds: Rect,
    val role: String,
    val label: String,
    val states: List<String>,
    val editable: Boolean,
    val scrollable: Boolean,
    val clickable: Boolean,
    val x: Int = bounds.centerX(),
    val y: Int = bounds.centerY(),
    /** in the status / navigation bar rather than the app */
    val system: Boolean = false,
)

/** What the screen looked like at one moment: numbered elements, plain text, and the grid used for cells. */
class Snapshot(
    val elements: List<Element>,
    val texts: List<Element>,
    val screenW: Int,
    val screenH: Int,
    val app: String,
    val cols: Int,
) {
    val cell = screenW.toFloat() / cols
    val rows = Math.ceil(screenH / cell.toDouble()).toInt()

    fun element(n: Int) = elements.firstOrNull { it.n == n }

    /** Readable list for the agent. */
    fun outline(): String {
        val sb = StringBuilder()
        sb.append("App: ").append(app).append(" | screen ").append(screenW).append('x').append(screenH)
            .append(" px | grid ").append(cols).append('x').append(rows).append(" (A1 = top-left, letters = columns)\n")
        val all = (elements + texts).sortedWith(compareBy({ it.bounds.top / 8 }, { it.bounds.left }))
        for (e in all) {
            val c = "@${e.x},${e.y}"
            val st = if (e.states.isEmpty()) "" else " (" + e.states.joinToString(", ") + ")"
            val label = if (e.label.isEmpty()) "" else " \"" + e.label.take(160).replace('\n', ' ') + "\""
            if (e.n > 0) sb.append('[').append(e.n).append("] ").append(e.role).append(label).append(st).append(' ').append(c).append('\n')
            else sb.append("     ").append(e.role).append(label).append(st).append(' ').append(c).append('\n')
        }
        if (all.isEmpty()) sb.append("(no readable elements: use the screenshot with mode \"grid\")\n")
        return sb.toString().trimEnd()
    }

    fun cellName(col: Int, row: Int): String {
        var c = col
        var s = ""
        do { s = ('A' + c % 26) + s; c = c / 26 - 1 } while (c >= 0)
        return s + (row + 1)
    }

    /** "C7" -> centre of that cell in screen px, or null. */
    fun cellCenter(name: String): Pair<Int, Int>? {
        val m = Regex("^([A-Za-z]{1,2})(\\d{1,3})$").find(name.trim()) ?: return null
        var col = 0
        for (ch in m.groupValues[1].uppercase()) col = col * 26 + (ch - 'A' + 1)
        col -= 1
        val row = m.groupValues[2].toInt() - 1
        if (col !in 0 until cols || row !in 0 until rows) return null
        return Pair(((col + 0.5f) * cell).toInt().coerceAtMost(screenW - 1), ((row + 0.5f) * cell).toInt().coerceAtMost(screenH - 1))
    }

    companion object {
        private const val MAX_NUMBERED = 200
        private const val MAX_TEXTS = 250

        /** A visible node in drawing order. Nodes [index, end) are it and its descendants. */
        private class Raw(val node: AccessibilityNodeInfo, val bounds: Rect, val window: Int) {
            var end = 0
            /** Area covered by its own and its descendants' visible content (labels, controls), or null. */
            var content: Rect? = null
            /** 1 = numbered candidate, 2 = text candidate */
            var kind = 0
            var label = ""
            var role = ""
            var editable = false
            var scrollable = false
            var clickable = false
        }

        private class Win(val bounds: Rect, val system: Boolean, var start: Int = 0, var end: Int = 0)

        fun take(service: AccessibilityService, screenW: Int, screenH: Int, cols: Int, hideCovered: Boolean = true): Snapshot {
            val roots = mutableListOf<Triple<AccessibilityNodeInfo, Boolean, Rect>>()
            var app = ""
            try {
                // all windows bottom-to-top: app, then keyboard, dialogs, system bars
                service.windows.sortedBy { it.layer }.forEach { w ->
                    if (w.type == AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY) return@forEach
                    val r = w.root ?: return@forEach
                    val wb = Rect().also { w.getBoundsInScreen(it) }
                    roots += Triple(r, w.type == AccessibilityWindowInfo.TYPE_SYSTEM, wb)
                    if (w.type == AccessibilityWindowInfo.TYPE_APPLICATION && w.isActive) app = r.packageName?.toString() ?: app
                }
            } catch (e: Exception) { }
            if (roots.isEmpty()) service.rootInActiveWindow?.let { roots += Triple(it, false, Rect(0, 0, screenW, screenH)) }
            if (app.isEmpty()) app = service.rootInActiveWindow?.packageName?.toString() ?: "?"

            val screen = Rect(0, 0, screenW, screenH)
            val raws = mutableListOf<Raw>()
            val wins = mutableListOf<Win>()
            for ((root, system, bounds) in roots) {
                val win = Win(bounds, system)
                win.start = raws.size
                walk(root, screen, raws, wins.size, 0, "", system)
                win.end = raws.size
                wins += win
            }

            // Keep what is not hidden under something drawn later, and tap it where it shows
            val numbered = mutableListOf<Element>()
            val texts = mutableListOf<Element>()
            for ((i, r) in raws.withIndex()) {
                if (r.kind == 0) continue
                if (r.kind == 1 && numbered.size >= MAX_NUMBERED) continue
                if (r.kind == 2 && texts.size >= MAX_TEXTS) continue
                val spot = if (hideCovered) visibleSpot(i, raws, wins) ?: continue else Pair(r.bounds.centerX(), r.bounds.centerY())
                val st = states(r.node)
                if (r.kind == 1) numbered += Element(numbered.size + 1, r.node, r.bounds, r.role, r.label, st, r.editable, r.scrollable, r.clickable, spot.first, spot.second, wins[r.window].system)
                else texts += Element(0, r.node, r.bounds, r.role, r.label, st, false, false, false, spot.first, spot.second, wins[r.window].system)
            }
            return Snapshot(numbered, texts, screenW, screenH, app, cols)
        }

        /** The centre of raws[i] if nothing covers it, else another visible point inside it, else null. */
        private fun visibleSpot(i: Int, raws: List<Raw>, wins: List<Win>): Pair<Int, Int>? {
            val b = raws[i].bounds
            val qx = b.width() / 4
            val qy = b.height() / 4
            val points = listOf(
                Pair(b.centerX(), b.centerY()),
                Pair(b.left + qx, b.centerY()), Pair(b.right - qx, b.centerY()),
                Pair(b.centerX(), b.top + qy), Pair(b.centerX(), b.bottom - qy),
                Pair(b.left + qx, b.top + qy), Pair(b.right - qx, b.top + qy),
                Pair(b.left + qx, b.bottom - qy), Pair(b.right - qx, b.bottom - qy),
            )
            return points.firstOrNull { (x, y) -> !covered(i, x, y, raws, wins) }
        }

        private fun covered(i: Int, x: Int, y: Int, raws: List<Raw>, wins: List<Win>): Boolean {
            val r = raws[i]
            // a window above (dialog, banner, keyboard, system bar)
            for (w in r.window + 1 until wins.size) if (wins[w].bounds.contains(x, y)) return true
            // something drawn later in the same window, outside this element's own subtree, with content
            // at that spot (a sheet, panel or popup). Plain text or images that sit inside this element,
            // like a label laid over a button, do not count; anything tappable on top does.
            // Needs the real drawing order (Android 7+).
            if (Build.VERSION.SDK_INT < 24) return false
            for (j in r.end until wins[r.window].end) {
                val o = raws[j]
                val c = o.content ?: continue
                if (!o.bounds.contains(x, y) || !c.contains(x, y)) continue
                if (o.kind != 1 && r.bounds.contains(c)) continue
                return true
            }
            return false
        }

        // shown: label of the numbered element this node is inside, so its texts are not listed twice.
        // system: status/navigation bar; its texts (notification icons, battery) are left out.
        // Returns the area of visible content in this subtree (for working out what covers what).
        private fun walk(node: AccessibilityNodeInfo, screen: Rect, raws: MutableList<Raw>, window: Int, depth: Int, shown: String, system: Boolean): Rect? {
            if (depth > 60 || !node.isVisibleToUser) return null
            val b = Rect()
            node.getBoundsInScreen(b)
            if (!b.intersect(screen) || b.width() <= 1 || b.height() <= 1) {
                // off screen itself, but children of a zero-size wrapper can still be visible
                var content: Rect? = null
                for (c in childrenInDrawingOrder(node)) {
                    walk(c, screen, raws, window, depth + 1, shown, system)?.let { content = union(content, it) }
                }
                return content
            }
            val r = Raw(node, b, window)
            raws += r
            r.editable = node.isEditable
            r.scrollable = node.isScrollable
            r.clickable = node.isClickable || node.isLongClickable || node.isCheckable
            val own = ownLabel(node)
            var inside = shown
            if (r.clickable || r.editable || r.scrollable) {
                r.kind = 1
                r.label = own.ifEmpty { if (r.editable) "" else childText(node, 0).ifEmpty { viewId(node) } }
                r.role = role(node, r.editable, r.scrollable)
                if (!r.scrollable) inside = r.label
            } else if (!system && own.isNotEmpty() && !shown.contains(own)) {
                r.kind = 2
                r.label = own
                r.role = role(node, false, false)
            }
            // lists are frames around content, not content themselves
            var content: Rect? = if ((r.kind != 0 && !r.scrollable) || own.isNotEmpty()) Rect(b) else null
            for (c in childrenInDrawingOrder(node)) {
                walk(c, screen, raws, window, depth + 1, inside, system)?.let { content = union(content, it) }
            }
            r.content = content
            r.end = raws.size
            return content
        }

        private fun union(a: Rect?, b: Rect): Rect = if (a == null) Rect(b) else a.apply { union(b) }

        /**
         * Children back to front. Tree order is not drawing order: a full-screen map listed after a
         * bottom sheet can still be drawn behind it (elevation). Android 7+ reports the real order.
         */
        private fun childrenInDrawingOrder(n: AccessibilityNodeInfo): List<AccessibilityNodeInfo> {
            val kids = (0 until n.childCount).mapNotNull { n.getChild(it) }
            return if (Build.VERSION.SDK_INT >= 24) kids.sortedBy { it.drawingOrder } else kids
        }

        private fun ownLabel(n: AccessibilityNodeInfo): String {
            val t = n.text?.toString()?.trim().orEmpty()
            if (t.isNotEmpty() && !(Build.VERSION.SDK_INT >= 26 && n.isShowingHintText)) return t
            val d = n.contentDescription?.toString()?.trim().orEmpty()
            if (d.isNotEmpty()) return d
            if (Build.VERSION.SDK_INT >= 26) n.hintText?.toString()?.trim()?.let { if (it.isNotEmpty()) return "hint: $it" }
            return ""
        }

        /** Label for a clickable container: the first texts inside it. */
        private fun childText(n: AccessibilityNodeInfo, depth: Int): String {
            if (depth > 6) return ""
            val parts = mutableListOf<String>()
            for (i in 0 until n.childCount) {
                val c = n.getChild(i) ?: continue
                val own = ownLabel(c)
                if (own.isNotEmpty()) parts += own else childText(c, depth + 1).let { if (it.isNotEmpty()) parts += it }
                if (parts.size >= 2) break
            }
            return parts.joinToString(" · ")
        }

        /** Last resort label: the developer's view id, e.g. "#send_button". */
        private fun viewId(n: AccessibilityNodeInfo): String {
            val id = n.viewIdResourceName?.substringAfter(":id/") ?: return ""
            return "#$id"
        }

        private fun role(n: AccessibilityNodeInfo, editable: Boolean, scrollable: Boolean): String {
            val cls = n.className?.toString()?.substringAfterLast('.') ?: ""
            return when {
                editable -> "input"
                n.isCheckable && (cls.contains("Switch") || cls.contains("Toggle")) -> "switch"
                n.isCheckable && cls.contains("Radio") -> "radio"
                n.isCheckable -> "checkbox"
                cls.contains("Button") -> "button"
                cls.contains("Image") && n.isClickable -> "image-button"
                cls.contains("Image") -> "image"
                cls.contains("Tab") -> "tab"
                cls.contains("SeekBar") -> "slider"
                cls.contains("WebView") -> "webview"
                scrollable && !n.isClickable -> "list"
                n.isClickable || n.isLongClickable -> "item"
                else -> "text"
            }
        }

        private fun states(n: AccessibilityNodeInfo): List<String> {
            val s = mutableListOf<String>()
            if (n.isCheckable) s += if (n.isChecked) "on" else "off"
            if (!n.isEnabled) s += "disabled"
            if (n.isSelected) s += "selected"
            if (n.isFocused) s += "focused"
            if (n.isScrollable) s += "scrollable"
            if (n.isPassword) s += "password"
            return s
        }
    }
}

/** Draws numbered boxes and/or the lettered grid on a screenshot for the agent. */
object Overlay {
    private val PALETTE = intArrayOf(
        Color.rgb(230, 25, 75), Color.rgb(0, 130, 200), Color.rgb(60, 160, 60), Color.rgb(245, 130, 48),
        Color.rgb(145, 30, 180), Color.rgb(0, 150, 150), Color.rgb(200, 30, 160), Color.rgb(128, 96, 0),
    )

    /** [src] is a full-resolution screenshot; returns a scaled, annotated copy. */
    fun draw(src: Bitmap, snap: Snapshot, mode: String, maxSide: Int): Bitmap {
        val scale = minOf(1f, maxSide.toFloat() / maxOf(src.width, src.height))
        // screenshot may differ from screen size (e.g. captured at another resolution)
        val sx = src.width * scale / snap.screenW
        val sy = src.height * scale / snap.screenH
        val out = Bitmap.createScaledBitmap(src, (src.width * scale).toInt(), (src.height * scale).toInt(), true)
            .let { if (it.isMutable) it else it.copy(Bitmap.Config.ARGB_8888, true) }
        val c = Canvas(out)
        if (mode == "grid" || mode == "both") grid(c, snap, sx, sy, out.width, mode == "both")
        if (mode == "marks" || mode == "both") marks(c, snap, sx, sy, out.width)
        return out
    }

    private fun grid(c: Canvas, snap: Snapshot, sx: Float, sy: Float, w: Int, faint: Boolean) {
        val line = Paint().apply { color = Color.argb(if (faint) 70 else 120, 255, 0, 80); strokeWidth = 1f }
        val cw = snap.cell * sx
        val ch = snap.cell * sy
        for (i in 1 until snap.cols) c.drawLine(i * cw, 0f, i * cw, snap.screenH * sy, line)
        for (j in 1 until snap.rows) c.drawLine(0f, j * ch, w.toFloat(), j * ch, line)
        if (faint) return
        val size = maxOf(9f, minOf(cw, ch) * 0.3f)
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = size; isFakeBoldText = true }
        val bg = Paint().apply { color = Color.argb(150, 200, 0, 60) }
        for (j in 0 until snap.rows) for (i in 0 until snap.cols) {
            val name = snap.cellName(i, j)
            val x = i * cw + 1
            val y = j * ch + 1
            c.drawRect(x, y, x + text.measureText(name) + 4, y + size + 3, bg)
            c.drawText(name, x + 2, y + size, text)
        }
    }

    private fun marks(c: Canvas, snap: Snapshot, sx: Float, sy: Float, w: Int) {
        val size = maxOf(12f, w / 45f)
        val stroke = Paint().apply { style = Paint.Style.STROKE; strokeWidth = maxOf(2f, w / 400f) }
        val fill = Paint()
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; textSize = size; isFakeBoldText = true }
        for (e in snap.elements) {
            val color = PALETTE[e.n % PALETTE.size]
            val r = RectF(e.bounds.left * sx, e.bounds.top * sy, e.bounds.right * sx, e.bounds.bottom * sy)
            stroke.color = color
            c.drawRect(r, stroke)
            val label = e.n.toString()
            val lw = text.measureText(label) + 6
            // label inside the top-left corner, or above it when the box is tiny
            val top = if (r.height() < size * 2 && r.top > size + 4) r.top - size - 4 else r.top
            fill.color = color
            c.drawRect(r.left, top, r.left + lw, top + size + 4, fill)
            c.drawText(label, r.left + 3, top + size, text)
        }
    }
}
