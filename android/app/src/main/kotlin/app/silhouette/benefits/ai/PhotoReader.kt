package app.silhouette.benefits.ai

import android.graphics.Bitmap
import app.silhouette.benefits.core.Raw

/**
 * Task `document.photo.read` (shared/routing.json): `ONLY_ON_DEVICE`, input Raw (the photo),
 * reason `photo-never-leaves`, prompt shared/prompts/photo-read.v1.md. One photo per request.
 * The transcription is Raw; it becomes a Skeleton like pasted text before anything can be sent.
 */
interface PhotoReader {
    suspend fun read(photo: Bitmap, docType: DocType): PhotoText
}

/** A transcription that never left the device, and where it was produced (always on device). */
class PhotoText(val text: Raw<String>, val source: InferenceSource, val reason: String)

/** Raised when the photo was not read on this device; nothing was sent. */
class PhotoNotReadOnDevice(reason: String) : Exception(reason)
