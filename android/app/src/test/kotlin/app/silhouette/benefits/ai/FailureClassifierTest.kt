package app.silhouette.benefits.ai

import org.junit.Assert.assertEquals
import org.junit.Test

/** Stands in for the device model's exception, which carries a numeric error code. */
private class GenAiException(private val code: Int) : Exception("device") {
    @Suppress("unused")
    fun getErrorCode(): Int = code
}

private class FirebaseAIOnDeviceUnknownException(cause: Throwable) : Exception("on device", cause)

class FailureClassifierTest {
    @Test
    fun `device busy and battery quota are recognised from the error code`() {
        assertEquals(FailureKind.DEVICE_BUSY, FailureClassifier.classify(FirebaseAIOnDeviceUnknownException(GenAiException(9))).kind)
        assertEquals(FailureKind.DEVICE_QUOTA, FailureClassifier.classify(FirebaseAIOnDeviceUnknownException(GenAiException(27))).kind)
        val other = FailureClassifier.classify(FirebaseAIOnDeviceUnknownException(GenAiException(8)))
        assertEquals(FailureKind.DEVICE_FAILED, other.kind)
        assertEquals("device-8", other.reason)
    }

    @Test
    fun `anything else is a cloud failure named by its type`() {
        val failure = FailureClassifier.classify(java.io.IOException("x"))
        assertEquals(FailureKind.CLOUD, failure.kind)
        assertEquals("IOException", failure.reason)
    }
}
