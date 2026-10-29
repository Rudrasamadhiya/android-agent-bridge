package io.github.rudrasamadhiya.agentbridge

import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper

/** Where the computer is and the secret it expects, from agentbridge://pair?h=ip1,ip2&p=8350&t=token&n=name */
data class Pairing(val hosts: List<String>, val port: Int, val token: String, val name: String) {
    companion object {
        private const val PREFS = "pairing"

        fun parse(link: String): Pairing? {
            val uri = try { Uri.parse(link.trim()) } catch (e: Exception) { return null }
            if (uri.scheme != "agentbridge" || uri.host != "pair") return null
            val hosts = uri.getQueryParameter("h")?.split(',')?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty()
            val port = uri.getQueryParameter("p")?.toIntOrNull() ?: return null
            val token = uri.getQueryParameter("t") ?: return null
            if (hosts.isEmpty()) return null
            return Pairing(hosts, port, token, uri.getQueryParameter("n") ?: "computer")
        }

        fun load(ctx: Context): Pairing? {
            val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val token = p.getString("token", null) ?: return null
            val hosts = p.getString("hosts", "")!!.split(',').filter { it.isNotEmpty() }
            if (hosts.isEmpty()) return null
            return Pairing(hosts, p.getInt("port", 8350), token, p.getString("name", "computer")!!)
        }

        fun clear(ctx: Context) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
        }
    }

    fun save(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("hosts", hosts.joinToString(","))
            .putInt("port", port)
            .putString("token", token)
            .putString("name", name)
            .apply()
    }
}

/** Connection state shown in the app. Listeners are called on the main thread. */
object Status {
    enum class State { NOT_PAIRED, NO_SERVICE, CONNECTING, CONNECTED, REJECTED }

    @Volatile var state = State.NOT_PAIRED
        private set
    @Volatile var detail = ""
        private set

    private val main = Handler(Looper.getMainLooper())
    private val listeners = mutableSetOf<() -> Unit>()

    fun set(s: State, d: String = "") {
        state = s
        detail = d
        main.post { listeners.toList().forEach { it() } }
    }

    fun listen(l: () -> Unit) { listeners += l }
    fun unlisten(l: () -> Unit) { listeners -= l }
}
