package app.silhouette.benefits.devicecheck

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import app.silhouette.benefits.ai.DeviceModelState
import app.silhouette.benefits.ai.DocType
import app.silhouette.benefits.ai.PhotoReader
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** The check on this phone: who ran it, what the model reported, and the photo case. */
object AndroidCheck {
    /** Firebase AI Logic on Android, as the run file names it. */
    const val SDK: String = "Firebase AI Logic (firebase-ai 18.2.0, firebase-ai-ondevice 16.0.0-beta08)"

    fun environment(appVersion: String, modelState: DeviceModelState): CheckEnvironment {
        val release = Build.VERSION.RELEASE ?: "unknown"
        val device = LinkedHashMap<String, kotlinx.serialization.json.JsonElement>()
        device["platform"] = JsonPrimitive("android")
        device["os"] = JsonPrimitive("Android")
        device["osVersion"] = JsonPrimitive(release)
        device["model"] = JsonPrimitive("${Build.MANUFACTURER} ${Build.MODEL}")
        if (modelState == DeviceModelState.Available) device["onDeviceModel"] = JsonPrimitive("Gemini Nano (AICore)")
        device["sdk"] = JsonPrimitive(SDK)
        device["appVersion"] = JsonPrimitive(appVersion)
        return CheckEnvironment(
            browser = "Silhouette $appVersion",
            platform = "Android $release",
            userAgent = "Silhouette/$appVersion (${Build.MANUFACTURER} ${Build.MODEL}; Android $release; $SDK)",
            device = JsonObject(device),
        )
    }

    /** What the on-device model reported before the run. */
    fun availability(state: DeviceModelState): Map<String, String> = mapOf(
        "onDeviceModel (AICore)" to when (state) {
            DeviceModelState.Available -> "available"
            DeviceModelState.Downloadable -> "downloadable"
            is DeviceModelState.Downloading -> "downloading"
            DeviceModelState.DownloadFailed -> "download-failed"
            DeviceModelState.Checking -> "checking"
            DeviceModelState.Unavailable -> "unavailable"
        },
    )

    /** The sample drawn as a picture (white page 900 px wide, black 16 px monospace, lines 22 px apart). */
    fun drawnSample(text: String): Bitmap {
        val lines = text.split("\n")
        val bitmap = Bitmap.createBitmap(900, 40 + lines.size * 22, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.BLACK
            textSize = 16f
            typeface = Typeface.MONOSPACE
        }
        lines.forEachIndexed { i, line -> canvas.drawText(line, 20f, 30f + i * 22, paint) }
        return bitmap
    }

    fun photoCase(reader: PhotoReader, sample: () -> String, state: () -> DeviceModelState): PhotoCase = object : PhotoCase {
        override fun unsupported(): String? =
            if (state() == DeviceModelState.Available) null else "unsupported: no on-device model is available on this phone"

        override suspend fun read(): Pair<String, String> {
            val result = reader.read(drawnSample(sample()), DocType.PAYSTUB)
            return result.source.name to result.reason
        }
    }
}
