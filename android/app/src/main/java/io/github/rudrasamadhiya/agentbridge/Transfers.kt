package io.github.rudrasamadhiya.agentbridge

import android.Manifest
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.OpenableColumns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink
import okio.source
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.InputStream
import java.io.OutputStream

/** The name this phone shows on the computer. Kept on the phone only; there is no account. */
object Profile {
    fun name(ctx: Context): String =
        ctx.getSharedPreferences("profile", Context.MODE_PRIVATE).getString("name", null) ?: Build.MODEL

    fun setName(ctx: Context, name: String) {
        ctx.getSharedPreferences("profile", Context.MODE_PRIVATE).edit().putString("name", name.trim().take(40)).apply()
    }
}

/**
 * Files between the phone and the paired computer, over the bridge's own connection
 * (Wi-Fi or the USB tunnel). Received files go to Downloads/Agent Bridge.
 */
object Transfers {
    const val FOLDER = "Agent Bridge"

    class Item(val name: String, val size: Long, val outgoing: Boolean, val where: String, val time: Long, val ok: Boolean)

    private val main = Handler(Looper.getMainLooper())
    private val listeners = mutableSetOf<() -> Unit>()
    fun listen(l: () -> Unit) { listeners += l }
    fun unlisten(l: () -> Unit) { listeners -= l }

    fun history(ctx: Context): List<Item> {
        val arr = JSONArray(ctx.getSharedPreferences("transfers", Context.MODE_PRIVATE).getString("items", "[]"))
        return (0 until arr.length()).map { arr.getJSONObject(it) }.map {
            Item(it.getString("name"), it.getLong("size"), it.getBoolean("out"), it.optString("where"), it.getLong("time"), it.optBoolean("ok", true))
        }
    }

    private fun record(ctx: Context, item: Item) {
        val prefs = ctx.getSharedPreferences("transfers", Context.MODE_PRIVATE)
        val arr = JSONArray(prefs.getString("items", "[]"))
        val next = JSONArray().put(JSONObject().put("name", item.name).put("size", item.size).put("out", item.outgoing)
            .put("where", item.where).put("time", item.time).put("ok", item.ok))
        for (i in 0 until minOf(arr.length(), 29)) next.put(arr.get(i))
        prefs.edit().putString("items", next.toString()).apply()
        main.post { listeners.toList().forEach { it() } }
    }

    private fun conn(): Connection = AgentService.instance?.connection
        ?: throw IllegalStateException("Agent Bridge isn't running. Turn on its accessibility service.")

    /** Computer → phone: download a file the computer staged. Returns where it was saved. */
    fun receive(ctx: Context, id: String, name: String, size: Long): String {
        val c = conn()
        val base = c.base ?: throw IllegalStateException("Not connected to the computer.")
        val req = Request.Builder().url("$base/files/out/$id").header("x-aab-token", c.token ?: "").build()
        c.client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw IllegalStateException("download failed (${res.code})")
            val (out, where) = openOutput(ctx, name)
            out.use { o -> res.body!!.byteStream().use { it.copyTo(o, 64 * 1024) } }
            record(ctx, Item(name, size, false, where, System.currentTimeMillis(), true))
            return where
        }
    }

    /** Phone → computer: upload one file picked or shared on the phone. Returns the computer's path. */
    fun send(ctx: Context, uri: Uri): String {
        val c = conn()
        val base = c.base ?: throw IllegalStateException("Not connected to the computer. Open Agent Bridge and check the status.")
        val (name, size) = describe(ctx, uri)
        val body = object : RequestBody() {
            override fun contentType() = "application/octet-stream".toMediaType()
            override fun contentLength() = size
            override fun writeTo(sink: BufferedSink) {
                val input: InputStream = ctx.contentResolver.openInputStream(uri) ?: throw IllegalStateException("can't read $name")
                input.source().use { sink.writeAll(it) }
            }
        }
        val req = Request.Builder().url("$base/files/in?name=" + Uri.encode(name)).header("x-aab-token", c.token ?: "").post(body).build()
        try {
            c.client.newCall(req).execute().use { res ->
                val json = JSONObject(res.body?.string() ?: "{}")
                if (!res.isSuccessful || !json.optBoolean("ok")) throw IllegalStateException(json.optString("error", "upload failed (${res.code})"))
                val where = json.optString("path")
                record(ctx, Item(name, size, true, where, System.currentTimeMillis(), true))
                return where
            }
        } catch (e: Exception) {
            record(ctx, Item(name, size, true, e.message ?: "failed", System.currentTimeMillis(), false))
            throw e
        }
    }

    private fun describe(ctx: Context, uri: Uri): Pair<String, Long> {
        var name = uri.lastPathSegment ?: "file"
        var size = -1L
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                c.getColumnIndex(OpenableColumns.DISPLAY_NAME).takeIf { it >= 0 }?.let { c.getString(it)?.let { n -> name = n } }
                c.getColumnIndex(OpenableColumns.SIZE).takeIf { it >= 0 && !c.isNull(it) }?.let { size = c.getLong(it) }
            }
        }
        return Pair(name, size)
    }

    fun canWritePublic(ctx: Context) = Build.VERSION.SDK_INT >= 29 ||
        ctx.checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED

    /** Downloads/Agent Bridge when allowed; otherwise the app's own folder (no permission needed). */
    private fun openOutput(ctx: Context, name: String): Pair<OutputStream, String> {
        if (Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER)
            }
            val uri = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("could not create $name in Downloads")
            return Pair(ctx.contentResolver.openOutputStream(uri)!!, "Downloads/$FOLDER/$name")
        }
        @Suppress("DEPRECATION")
        val dir = if (canWritePublic(ctx)) File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER)
            else File(ctx.getExternalFilesDir(null), FOLDER)
        dir.mkdirs()
        var f = File(dir, name)
        var n = 2
        while (f.exists()) { f = File(dir, "${f.nameWithoutExtension.substringBefore(" (")} ($n).${f.extension}".removeSuffix(".")); n++ }
        val where = if (canWritePublic(ctx)) "Downloads/$FOLDER/${f.name}" else f.absolutePath
        return Pair(f.outputStream(), where)
    }
}
