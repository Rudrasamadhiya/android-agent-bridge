package io.github.rudrasamadhiya.agentbridge

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Reads text from screen pixels with ML Kit (on device, offline). Used for
 * controls that apps draw but never expose to accessibility, like Uber's
 * floating tab bar or its payment row.
 */
object Ocr {
    class Line(val text: String, val bounds: Rect)

    private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

    /** Lines of text in [bmp], with bounds converted to screen px. Call off the main thread. */
    fun read(bmp: Bitmap, screenW: Int, screenH: Int): List<Line> {
        val result = Tasks.await(recognizer.process(InputImage.fromBitmap(bmp, 0)), 15, TimeUnit.SECONDS)
        val sx = screenW.toFloat() / bmp.width
        val sy = screenH.toFloat() / bmp.height
        val out = mutableListOf<Line>()
        for (block in result.textBlocks) for (line in block.lines) {
            val b = line.boundingBox ?: continue
            val text = line.text.trim()
            if (text.isEmpty()) continue
            out += Line(text, Rect((b.left * sx).toInt(), (b.top * sy).toInt(), (b.right * sx).toInt(), (b.bottom * sy).toInt()))
        }
        return out.sortedWith(compareBy({ it.bounds.top / 8 }, { it.bounds.left }))
    }

    fun toJson(lines: List<Line>): JSONObject {
        val arr = JSONArray()
        val sb = StringBuilder("Text read from the screen pixels (OCR) — tap any of these by its text or by x,y:\n")
        for (l in lines) {
            arr.put(JSONObject().put("text", l.text).put("x", l.bounds.centerX()).put("y", l.bounds.centerY())
                .put("bounds", JSONArray(listOf(l.bounds.left, l.bounds.top, l.bounds.right, l.bounds.bottom))))
            sb.append("  ocr \"").append(l.text).append("\" @").append(l.bounds.centerX()).append(',').append(l.bounds.centerY()).append('\n')
        }
        if (lines.isEmpty()) sb.append("  (no text found)\n")
        return JSONObject().put("lines", arr).put("outline", sb.toString().trimEnd())
    }
}
