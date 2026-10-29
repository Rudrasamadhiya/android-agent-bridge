package io.github.rudrasamadhiya.agentbridge

import android.app.Activity
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.util.DisplayMetrics
import android.view.WindowManager

/**
 * Screen capture for Android 5–10 (and as a fallback later), using
 * MediaProjection. Android 11+ uses the accessibility screenshot instead,
 * which needs no prompt. Mirrors the screen into an ImageReader and keeps
 * the latest frame.
 */
class CaptureService : Service() {
    companion object {
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"
        private const val CHANNEL = "capture"

        @Volatile var instance: CaptureService? = null
            private set

        fun start(ctx: Context, resultCode: Int, data: Intent) {
            val i = Intent(ctx, CaptureService::class.java).putExtra(EXTRA_CODE, resultCode).putExtra(EXTRA_DATA, data)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }
    }

    private var projection: MediaProjection? = null
    private var display: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var thread: HandlerThread? = null
    @Volatile private var last: Bitmap? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notif = notification()
        if (Build.VERSION.SDK_INT >= 29) startForeground(1, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        else startForeground(1, notif)

        val code = intent?.getIntExtra(EXTRA_CODE, Activity.RESULT_CANCELED) ?: Activity.RESULT_CANCELED
        @Suppress("DEPRECATION")
        val data: Intent? = intent?.getParcelableExtra(EXTRA_DATA)
        if (code != Activity.RESULT_OK || data == null) {
            stopSelf()
            return START_NOT_STICKY
        }
        stopCapture()
        val mpm = getSystemService(Context.MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val mp = mpm.getMediaProjection(code, data) ?: run { stopSelf(); return START_NOT_STICKY }
        val t = HandlerThread("capture").also { it.start() }
        val handler = Handler(t.looper)
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                stopCapture()
                instance = null
                AgentService.instance?.connection?.sendInfo()
                stopSelf()
            }
        }, handler)

        val m = DisplayMetrics()
        @Suppress("DEPRECATION")
        (getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.getRealMetrics(m)
        val r = ImageReader.newInstance(m.widthPixels, m.heightPixels, PixelFormat.RGBA_8888, 2)
        display = mp.createVirtualDisplay("agent-bridge", m.widthPixels, m.heightPixels, m.densityDpi,
            DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, r.surface, null, handler)
        projection = mp
        reader = r
        thread = t
        instance = this
        AgentService.instance?.connection?.sendInfo()
        return START_NOT_STICKY
    }

    /** Latest frame (full resolution), or null before the first frame arrives. */
    @Synchronized
    fun grab(): Bitmap? {
        val r = reader ?: return null
        val img = try { r.acquireLatestImage() } catch (e: Exception) { null }
        if (img != null) {
            try {
                val plane = img.planes[0]
                val pixelStride = plane.pixelStride
                val rowPadding = plane.rowStride - pixelStride * img.width
                val padded = Bitmap.createBitmap(img.width + rowPadding / pixelStride, img.height, Bitmap.Config.ARGB_8888)
                padded.copyPixelsFromBuffer(plane.buffer)
                last = if (rowPadding == 0) padded else Bitmap.createBitmap(padded, 0, 0, img.width, img.height)
            } finally {
                img.close()
            }
        }
        // no new frame means the screen has not changed since the last one
        return last
    }

    private fun stopCapture() {
        display?.release()
        reader?.close()
        thread?.quitSafely()
        display = null
        reader = null
        thread = null
        last = null
        projection?.let { p -> projection = null; try { p.stop() } catch (e: Exception) { } }
    }

    override fun onDestroy() {
        stopCapture()
        instance = null
        AgentService.instance?.connection?.sendInfo()
        super.onDestroy()
    }

    private fun notification(): Notification {
        val b = if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "Screen capture", NotificationManager.IMPORTANCE_LOW))
            Notification.Builder(this, CHANNEL)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        return b.setContentTitle("Agent Bridge can see the screen")
            .setContentText("Your paired computer can take screenshots. Open the app to stop.")
            .setSmallIcon(R.drawable.ic_stat_bridge)
            .setOngoing(true)
            .build()
    }
}
