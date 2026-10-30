package io.github.rudrasamadhiya.agentbridge

import android.animation.ValueAnimator
import android.app.Activity
import android.app.Dialog
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.view.animation.LinearInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.DecoratedBarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory
import com.journeyapps.barcodescanner.Size

/**
 * The QR scanner as a small portrait sheet that slides up from the bottom, with the camera
 * in a rounded square, instead of a full-screen landscape camera.
 */
class ScanSheet(
    private val act: Activity,
    private val onCode: (String) -> Unit,
    private val onEnterLink: () -> Unit,
) {
    private val CARD = Color.parseColor("#15171C")
    private val LINE = Color.parseColor("#262A31")
    private val TEXT = Color.parseColor("#F2F4F7")
    private val MUTED = Color.parseColor("#9AA3AF")
    private val ACCENT = Color.parseColor("#3DDC97")
    private val RED = Color.parseColor("#F87171")

    private fun dp(v: Int) = (v * act.resources.displayMetrics.density).toInt()

    private val dialog = Dialog(act, android.R.style.Theme_Material_Dialog)
    private val camera = DecoratedBarcodeView(act)
    private lateinit var hint: TextView
    private var torch = false
    private var done = false

    fun show() {
        val frameSize = minOf(act.resources.displayMetrics.widthPixels - dp(48), dp(340))
        val box = frameSize * 62 / 100

        camera.barcodeView.decoderFactory = DefaultDecoderFactory(listOf(BarcodeFormat.QR_CODE))
        camera.barcodeView.framingRectSize = Size(box, box)
        camera.setStatusText("")
        camera.statusView?.visibility = View.GONE
        camera.viewFinder.setLaserVisibility(false)
        camera.viewFinder.setMaskColor(Color.argb(120, 0, 0, 0))
        camera.decodeContinuous(BarcodeCallback { r ->
            val text = r.text ?: return@BarcodeCallback
            if (done) return@BarcodeCallback
            if (Pairing.parse(text) == null) {
                hint.text = "That's not an Agent Bridge code. Scan the one in your terminal."
                hint.setTextColor(RED)
                return@BarcodeCallback
            }
            done = true
            camera.performHapticFeedback(HapticFeedbackConstants.VIRTUAL_KEY)
            dialog.dismiss()
            onCode(text)
        })

        val sheet = LinearLayout(act).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(20), dp(10), dp(20), dp(22))
            background = GradientDrawable().apply {
                setColor(CARD)
                val r = dp(26).toFloat()
                cornerRadii = floatArrayOf(r, r, r, r, 0f, 0f, 0f, 0f)
            }
        }
        // grab handle
        sheet.addView(View(act).apply { background = rounded(LINE, 3) }, LinearLayout.LayoutParams(dp(38), dp(5)).apply { bottomMargin = dp(14) })

        // title row with a close button
        val head = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val titles = LinearLayout(act).apply { orientation = LinearLayout.VERTICAL }
        titles.addView(text("Scan to pair", 20f, TEXT, true))
        titles.addView(text("Point the camera at the QR code on your computer", 13.5f, MUTED, false).apply { setPadding(0, dp(3), 0, 0) })
        head.addView(titles, LinearLayout.LayoutParams(0, -2, 1f))
        head.addView(iconButton(R.drawable.ic_close, "Close") { dialog.dismiss() }, LinearLayout.LayoutParams(dp(40), dp(40)))
        sheet.addView(head, LinearLayout.LayoutParams(-1, -2))

        // camera in a rounded square, with green corner marks and a moving scan line
        val frame = FrameLayout(act).apply {
            background = rounded(Color.BLACK, 22)
            clipToOutline = true
        }
        frame.addView(camera, FrameLayout.LayoutParams(-1, -1))
        frame.addView(Corners(box), FrameLayout.LayoutParams(-1, -1))
        sheet.addView(frame, LinearLayout.LayoutParams(frameSize, frameSize).apply { topMargin = dp(18) })

        hint = text("Run  npx android-agent-bridge start  on the computer to show the code", 12.5f, MUTED, false).apply {
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(14), dp(8), 0)
        }
        sheet.addView(hint, LinearLayout.LayoutParams(-1, -2))

        // actions
        val actions = LinearLayout(act).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        if (act.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_FLASH)) {
            lateinit var flash: TextView
            flash = pill(R.drawable.ic_flash, "Flash") {
                torch = !torch
                if (torch) camera.setTorchOn() else camera.setTorchOff()
                flash.setTextColor(if (torch) ACCENT else TEXT)
                flash.compoundDrawables[0]?.setTint(if (torch) ACCENT else TEXT)
            }
            actions.addView(flash, LinearLayout.LayoutParams(0, dp(46), 1f).apply { rightMargin = dp(10) })
        }
        actions.addView(pill(R.drawable.ic_link, "Enter link") { dialog.dismiss(); onEnterLink() }, LinearLayout.LayoutParams(0, dp(46), 1f))
        sheet.addView(actions, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(18) })

        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        dialog.setContentView(sheet)
        dialog.window?.apply {
            setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
            setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            setGravity(Gravity.BOTTOM)
            setWindowAnimations(android.R.style.Animation_InputMethod)
            addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)
            setDimAmount(0.6f)
            decorView.setPadding(0, 0, 0, 0)
        }
        dialog.setOnShowListener { camera.resume() }
        dialog.setOnDismissListener { if (torch) camera.setTorchOff(); camera.pause() }
        dialog.show()
    }

    fun dismiss() { if (dialog.isShowing) dialog.dismiss() }

    /** Four green corner marks around the scan area and a soft line sweeping down through it. */
    private inner class Corners(private val box: Int) : View(act) {
        private val stroke = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = ACCENT; style = Paint.Style.STROKE; strokeWidth = dp(4).toFloat(); strokeCap = Paint.Cap.ROUND
        }
        private val line = Paint(Paint.ANTI_ALIAS_FLAG)
        private var t = 0f
        private val anim = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 1800; repeatCount = ValueAnimator.INFINITE; repeatMode = ValueAnimator.REVERSE
            interpolator = LinearInterpolator()
            addUpdateListener { t = it.animatedValue as Float; invalidate() }
        }

        override fun onAttachedToWindow() { super.onAttachedToWindow(); anim.start() }
        override fun onDetachedFromWindow() { anim.cancel(); super.onDetachedFromWindow() }

        override fun onDraw(c: Canvas) {
            val l = (width - box) / 2f; val tp = (height - box) / 2f; val r = l + box; val b = tp + box
            val k = box * 0.16f
            c.drawLine(l, tp, l + k, tp, stroke); c.drawLine(l, tp, l, tp + k, stroke)
            c.drawLine(r, tp, r - k, tp, stroke); c.drawLine(r, tp, r, tp + k, stroke)
            c.drawLine(l, b, l + k, b, stroke); c.drawLine(l, b, l, b - k, stroke)
            c.drawLine(r, b, r - k, b, stroke); c.drawLine(r, b, r, b - k, stroke)
            val y = tp + box * (0.08f + 0.84f * t)
            line.shader = LinearGradient(l, y, r, y, intArrayOf(Color.TRANSPARENT, ACCENT, Color.TRANSPARENT), null, Shader.TileMode.CLAMP)
            line.strokeWidth = dp(2).toFloat()
            c.drawLine(l + dp(8), y, r - dp(8), y, line)
        }
    }

    private fun text(t: String, size: Float, color: Int, bold: Boolean) = TextView(act).apply {
        text = t; textSize = size; setTextColor(color)
        typeface = Typeface.create(if (bold) "sans-serif-medium" else "sans-serif", Typeface.NORMAL)
    }

    private fun rounded(fill: Int, radius: Int) = GradientDrawable().apply { cornerRadius = dp(radius).toFloat(); setColor(fill) }

    private fun iconButton(icon: Int, desc: String, onClick: () -> Unit) = ImageView(act).apply {
        setImageResource(icon)
        imageTintList = ColorStateList.valueOf(MUTED)
        contentDescription = desc
        setPadding(dp(10), dp(10), dp(10), dp(10))
        background = RippleDrawable(ColorStateList.valueOf(Color.argb(40, 255, 255, 255)), null, GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(Color.WHITE) })
        isClickable = true
        setOnClickListener { onClick() }
    }

    private fun pill(icon: Int, label: String, onClick: () -> Unit) = TextView(act).apply {
        text = label; textSize = 15f; setTextColor(TEXT); gravity = Gravity.CENTER
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        val d = act.getDrawable(icon)!!.mutate().apply { setBounds(0, 0, dp(18), dp(18)); setTint(TEXT) }
        setCompoundDrawables(d, null, null, null)
        compoundDrawablePadding = dp(8)
        setPadding(dp(18), 0, dp(18), 0)
        background = RippleDrawable(ColorStateList.valueOf(Color.argb(40, 255, 255, 255)),
            GradientDrawable().apply { cornerRadius = dp(23).toFloat(); setColor(Color.TRANSPARENT); setStroke(dp(1), LINE) }, null)
        isClickable = true
        setOnClickListener { onClick() }
    }
}
