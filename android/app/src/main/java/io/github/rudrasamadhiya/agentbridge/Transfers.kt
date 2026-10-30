package io.github.rudrasamadhiya.agentbridge

import android.Manifest
import android.app.RecoverableSecurityException
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentSender
import android.content.pm.PackageManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
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

    /** [uri] points at the file on this phone: a content:// URI, or a file path on Android 9 and older. */
    class Item(val name: String, val size: Long, val outgoing: Boolean, val where: String, val time: Long, val ok: Boolean, val uri: String = "")

    private val main = Handler(Looper.getMainLooper())
    private val listeners = mutableSetOf<() -> Unit>()
    fun listen(l: () -> Unit) { listeners += l }
    fun unlisten(l: () -> Unit) { listeners -= l }

    fun history(ctx: Context): List<Item> {
        val arr = JSONArray(ctx.getSharedPreferences("transfers", Context.MODE_PRIVATE).getString("items", "[]"))
        return (0 until arr.length()).map { arr.getJSONObject(it) }.map {
            Item(it.getString("name"), it.getLong("size"), it.getBoolean("out"), it.optString("where"), it.getLong("time"), it.optBoolean("ok", true), it.optString("uri"))
        }
    }

    private fun json(item: Item) = JSONObject().put("name", item.name).put("size", item.size).put("out", item.outgoing)
        .put("where", item.where).put("time", item.time).put("ok", item.ok).put("uri", item.uri)

    private fun save(ctx: Context, items: List<Item>) {
        val arr = JSONArray()
        items.take(30).forEach { arr.put(json(it)) }
        ctx.getSharedPreferences("transfers", Context.MODE_PRIVATE).edit().putString("items", arr.toString()).apply()
        main.post { listeners.toList().forEach { it() } }
    }

    private fun record(ctx: Context, item: Item) = save(ctx, listOf(item) + history(ctx))

    /** Removes one entry from the list (the file itself is untouched). */
    fun forget(ctx: Context, item: Item) = save(ctx, history(ctx).filterNot { it.time == item.time && it.name == item.name })

    /** Empties the list. Files stay where they are. */
    fun clear(ctx: Context) = save(ctx, emptyList())

    // ---------- files on this phone ----------

    /** Where the file is on this phone right now, or null if it is gone. Older entries have no URI, so received files are looked up by name. */
    fun locate(ctx: Context, item: Item): Uri? {
        val u = item.uri
        if (u.startsWith("content://")) return Uri.parse(u).takeIf { exists(ctx, it) }
        if (u.startsWith("/")) return File(u).takeIf { it.exists() }?.let { fileUri(ctx, it) }
        if (item.outgoing) return null
        if (Build.VERSION.SDK_INT >= 29) {
            ctx.contentResolver.query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, arrayOf(MediaStore.Downloads._ID),
                "${MediaStore.Downloads.DISPLAY_NAME}=? AND ${MediaStore.Downloads.RELATIVE_PATH} LIKE ?",
                arrayOf(item.name, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER%"), null)?.use { c ->
                if (c.moveToFirst()) return ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, c.getLong(0))
            }
            return null
        }
        return folders(ctx).map { File(it, item.name) }.firstOrNull { it.exists() }?.let { fileUri(ctx, it) }
    }

    private fun exists(ctx: Context, uri: Uri) = try {
        ctx.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { it.moveToFirst() } ?: false
    } catch (e: Exception) { false }

    /** Other apps can't read file:// links on Android 7+, so hand them the MediaStore entry instead. */
    private fun fileUri(ctx: Context, f: File): Uri? {
        if (Build.VERSION.SDK_INT < 24) return Uri.fromFile(f)
        @Suppress("DEPRECATION")
        ctx.contentResolver.query(MediaStore.Files.getContentUri("external"), arrayOf(MediaStore.Files.FileColumns._ID),
            "${MediaStore.Files.FileColumns.DATA}=?", arrayOf(f.absolutePath), null)?.use { c ->
            if (c.moveToFirst()) return ContentUris.withAppendedId(MediaStore.Files.getContentUri("external"), c.getLong(0))
        }
        // not indexed yet (files received before indexing was added): index it now and use what comes back
        val latch = java.util.concurrent.CountDownLatch(1)
        var found: Uri? = null
        MediaScannerConnection.scanFile(ctx, arrayOf(f.absolutePath), null) { _, u -> found = u; latch.countDown() }
        latch.await(4, java.util.concurrent.TimeUnit.SECONDS)
        return found
    }

    @Suppress("DEPRECATION")
    private fun folders(ctx: Context) = listOf(
        File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER),
        File(ctx.getExternalFilesDir(null), FOLDER),
    )

    private fun mime(ctx: Context, uri: Uri, name: String): String =
        (if (uri.scheme == "content") ctx.contentResolver.getType(uri) else null)
            ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase())
            ?: "*/*"

    /** An intent that opens the file in whatever app handles it, or null if it is no longer on the phone. */
    fun openIntent(ctx: Context, item: Item): Intent? {
        val uri = locate(ctx, item) ?: return null
        return Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime(ctx, uri, item.name))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    sealed class Deleted {
        object Done : Deleted()
        object Missing : Deleted()
        /** Android wants the user to confirm (the file belongs to an older install of the app). */
        class Confirm(val sender: IntentSender) : Deleted()
    }

    /** Deletes a received file from the phone and drops it from the list. */
    fun delete(ctx: Context, item: Item): Deleted {
        val uri = locate(ctx, item)
        if (uri == null) { forget(ctx, item); return Deleted.Missing }
        try {
            if (uri.scheme == "file") File(uri.path!!).delete()
            else if (ctx.contentResolver.delete(uri, null, null) == 0 && item.uri.startsWith("/")) File(item.uri).delete()
        } catch (e: SecurityException) {
            val sender = when {
                Build.VERSION.SDK_INT >= 30 -> MediaStore.createDeleteRequest(ctx.contentResolver, listOf(uri)).intentSender
                Build.VERSION.SDK_INT == 29 && e is RecoverableSecurityException -> e.userAction.actionIntent.intentSender
                else -> throw e
            }
            return Deleted.Confirm(sender)
        }
        forget(ctx, item)
        return Deleted.Done
    }

    /**
     * Intents that show the Agent Bridge download folder, best first: Samsung's My Files at that
     * folder, the system Files app at that folder (Android 10+; older versions crash on a folder
     * link), the system file picker opened there, then the Downloads app.
     */
    fun folderIntents(ctx: Context): List<Intent> {
        val doc = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:${Environment.DIRECTORY_DOWNLOADS}/$FOLDER")
        @Suppress("DEPRECATION")
        val path = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER).absolutePath
        val list = mutableListOf<Intent>()
        val myFiles = Intent("samsung.myfiles.intent.action.LAUNCH_MY_FILES").putExtra("samsung.myfiles.intent.extra.START_PATH", path)
        if (myFiles.resolveActivity(ctx.packageManager) != null) list += myFiles
        if (Build.VERSION.SDK_INT >= 29) list += Intent(Intent.ACTION_VIEW).setDataAndType(doc, DocumentsContract.Document.MIME_TYPE_DIR)
        if (Build.VERSION.SDK_INT >= 26) list += Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            .putExtra(DocumentsContract.EXTRA_INITIAL_URI, doc)
        list += Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS)
        return list
    }

    /** Human-readable location of received files on this phone. */
    fun folderLabel(ctx: Context): String = if (canWritePublic(ctx)) "Downloads/$FOLDER" else File(ctx.getExternalFilesDir(null), FOLDER).absolutePath

    private fun conn(): Connection = AgentService.instance?.connection
        ?: throw IllegalStateException("Agent Bridge isn't running. Turn on its accessibility service.")

    /** Computer → phone: download a file the computer staged. Returns where it was saved. */
    fun receive(ctx: Context, id: String, name: String, size: Long): String {
        val c = conn()
        val base = c.base ?: throw IllegalStateException("Not connected to the computer.")
        val req = Request.Builder().url("$base/files/out/$id").header("x-aab-token", c.token ?: "").build()
        c.client.newCall(req).execute().use { res ->
            if (!res.isSuccessful) throw IllegalStateException("download failed (${res.code})")
            val saved = openOutput(ctx, name)
            saved.out.use { o -> res.body!!.byteStream().use { it.copyTo(o, 64 * 1024) } }
            // let galleries and file managers see it straight away (Android 10+ does this itself)
            if (saved.uri.startsWith("/")) MediaScannerConnection.scanFile(ctx, arrayOf(saved.uri), null, null)
            record(ctx, Item(name, size, false, saved.where, System.currentTimeMillis(), true, saved.uri))
            return saved.where
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
                record(ctx, Item(name, size, true, where, System.currentTimeMillis(), true, uri.toString()))
                return where
            }
        } catch (e: Exception) {
            record(ctx, Item(name, size, true, e.message ?: "failed", System.currentTimeMillis(), false, uri.toString()))
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

    private class Output(val out: OutputStream, val where: String, val uri: String)

    /** Downloads/Agent Bridge when allowed; otherwise the app's own folder (no permission needed). */
    private fun openOutput(ctx: Context, name: String): Output {
        if (Build.VERSION.SDK_INT >= 29) {
            val values = ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, name)
                put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER)
            }
            val uri = ctx.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                ?: throw IllegalStateException("could not create $name in Downloads")
            return Output(ctx.contentResolver.openOutputStream(uri)!!, "Downloads/$FOLDER/$name", uri.toString())
        }
        @Suppress("DEPRECATION")
        val dir = if (canWritePublic(ctx)) File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), FOLDER)
            else File(ctx.getExternalFilesDir(null), FOLDER)
        dir.mkdirs()
        var f = File(dir, name)
        var n = 2
        while (f.exists()) { f = File(dir, "${f.nameWithoutExtension.substringBefore(" (")} ($n).${f.extension}".removeSuffix(".")); n++ }
        val where = if (canWritePublic(ctx)) "Downloads/$FOLDER/${f.name}" else f.absolutePath
        return Output(f.outputStream(), where, f.absolutePath)
    }
}
