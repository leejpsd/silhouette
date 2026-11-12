package app.silhouette.benefits.core

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.serializer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.ByteArrayOutputStream
import java.io.NotSerializableException
import java.io.ObjectOutputStream
import kotlin.reflect.typeOf

/** Runtime checks for the Raw wrapper: no textual or serialized form reveals the value. */
class DataTypesTest {
    private val secret = "Zyxwanda 9917734"
    private val raw = Raw.of(mapOf("name" to secret))

    private data class Holder(val label: String, val value: Raw<Map<String, String>>)

    @Test
    fun `string forms show a fixed marker`() {
        assertEquals("[Raw]", raw.toString())
        assertEquals("value=[Raw]", "value=$raw")
        val holder = Holder("x", raw).toString()
        assertFalse(holder.contains("Zyxwanda"), holder)
        assertFalse(listOf(raw, raw).toString().contains("Zyxwanda"))
    }

    @Test
    fun `equality and hashing use identity`() {
        val same = Raw.of(mapOf("name" to secret))
        assertNotEquals(raw, same)
        assertEquals(raw, raw)
        assertEquals(System.identityHashCode(raw), raw.hashCode())
    }

    @Test
    fun `no serializer exists`() {
        assertFalse(java.io.Serializable::class.java.isAssignableFrom(Raw::class.java))
        assertThrows(NotSerializableException::class.java) {
            ObjectOutputStream(ByteArrayOutputStream()).writeObject(raw)
        }
        assertThrows(SerializationException::class.java) { serializer(typeOf<Raw<String>>()) }
        assertThrows(SerializationException::class.java) {
            Json.encodeToString(serializer(typeOf<Any>()), raw)
        }
    }

    @Test
    fun `code in this module can read the value`() {
        assertEquals(secret, raw.reveal()["name"])
        assertEquals(secret.length, raw.map { it.getValue("name").length }.reveal())
    }

    @Test
    fun `skeleton and generalized values are cloud-safe and come from Raw only through the two functions`() {
        val result = skeletonize(Raw.of("Employee: Zyxwanda 9917734"), Allowlist(listOf("employee")))
        val skeleton: CloudSafe = result.skeleton
        assertEquals("Employee: ⟦W1⟧ ⟦N1⟧", skeleton.toString())
        val profile: CloudSafe = generalize(
            Raw.of(JsonObject(mapOf("jurisdiction" to JsonPrimitive("zz-test")))),
            Bands("zz-test", listOf(IncomeBand("A", 0.0, null)), 6, emptyList()),
        )
        assertTrue(profile is Generalized<*>)
        val text: CloudSafe = Public.of("Test Food Help")
        assertTrue(text is Public<*>)
    }
}
