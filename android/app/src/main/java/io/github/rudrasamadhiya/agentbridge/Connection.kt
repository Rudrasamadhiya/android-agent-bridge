package io.github.rudrasamadhiya.agentbridge

import android.os.Handler
import android.os.Looper
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Dials the computer and keeps the line open. Tries each address from the QR
 * code in turn (127.0.0.1 first when set up over USB, then Wi-Fi addresses)
 * and reconnects with backoff. Commands run one at a time on a worker thread.
 */
class Connection(
    private val service: AgentService,
    private val handle: (cmd: String, args: JSONObject) -> Any?,
) {
    /** Where the bridge is right now (http://host:port) and its secret, for file transfer. Null while disconnected. */
    @Volatile var base: String? = null
        private set
    @Volatile var token: String? = null
        private set

    val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(15, TimeUnit.SECONDS)
        .build()
    private val worker = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())

    @Volatile private var ws: WebSocket? = null
    @Volatile private var stopped = true
    private var attempt = 0
    private var backoffMs = 1000L

    fun start() {
        stopped = false
        attempt = 0
        backoffMs = 1000L
        connect()
    }

    fun stop() {
        stopped = true
        main.removeCallbacksAndMessages(null)
        ws?.close(1000, "bye")
        ws = null
    }

    fun restart() {
        stop()
        start()
    }

    /** Tell the computer something changed (e.g. screen capture was allowed). */
    fun sendInfo() {
        ws?.send(JSONObject().put("type", "info").put("info", service.info()).toString())
    }

    private fun connect() {
        if (stopped) return
        val p = Pairing.load(service)
        if (p == null) {
            Status.set(Status.State.NOT_PAIRED)
            return
        }
        val host = p.hosts[attempt % p.hosts.size]
        Status.set(Status.State.CONNECTING, "$host:${p.port}")
        val req = Request.Builder().url("ws://$host:${p.port}/phone").build()
        ws = client.newWebSocket(req, Listener(p, host))
    }

    private fun retry() {
        if (stopped) return
        val p = Pairing.load(service) ?: return
        attempt++
        // next address right away; after a full round, back off (max 10 s)
        val delay = if (attempt % p.hosts.size != 0) 200L else backoffMs.also { backoffMs = minOf(backoffMs * 2, 10_000L) }
        main.postDelayed({ connect() }, delay)
    }

    private inner class Listener(private val p: Pairing, private val host: String) : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            webSocket.send(JSONObject().put("type", "hello").put("token", p.token).put("info", service.info()).toString())
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            if (webSocket !== ws) return
            val msg = try { JSONObject(text) } catch (e: Exception) { return }
            when (msg.optString("type")) {
                "welcome" -> {
                    backoffMs = 1000L
                    attempt %= p.hosts.size // keep using the address that worked
                    base = "http://$host:${p.port}"
                    token = p.token
                    Status.set(Status.State.CONNECTED, msg.optString("name", p.name))
                    return
                }
                "rejected" -> {
                    stopped = true
                    Status.set(Status.State.REJECTED, msg.optString("error"))
                    return
                }
            }
            if (!msg.has("id")) return
            val id = msg.get("id")
            val cmd = msg.optString("cmd")
            val args = msg.optJSONObject("args") ?: JSONObject()
            worker.execute {
                val reply = JSONObject().put("id", id)
                try {
                    reply.put("ok", true).put("result", handle(cmd, args) ?: JSONObject.NULL)
                } catch (e: Throwable) {
                    reply.put("ok", false).put("error", e.message ?: e.toString())
                }
                webSocket.send(reply.toString())
            }
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = lost(webSocket)

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = lost(webSocket)

        private fun lost(webSocket: WebSocket) {
            if (webSocket !== ws) return
            ws = null
            base = null
            if (!stopped) retry()
        }
    }
}
