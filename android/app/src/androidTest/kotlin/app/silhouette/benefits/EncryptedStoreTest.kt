package app.silhouette.benefits

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import app.silhouette.benefits.data.EncryptedStore
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.security.KeyStore

@RunWith(AndroidJUnit4::class)
class EncryptedStoreTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val dir = File(context.noBackupFilesDir, "store-test")
    private val alias = "silhouette.store.test"
    private val store = EncryptedStore(dir, alias)
    private val secret = "Zyxwanda Quillfeather 9917734".toByteArray()

    @After
    fun cleanUp() = store.deleteEverything()

    @Test
    fun recordsRoundTripAndAreNotPlaintextOnDisk() {
        store.write("answers", secret)
        assertArrayEquals(secret, store.read("answers"))
        val onDisk = File(dir, "answers.bin").readBytes()
        assertFalse(String(onDisk, Charsets.ISO_8859_1).contains("Zyxwanda"))
        assertFalse(String(onDisk, Charsets.ISO_8859_1).contains("9917734"))
    }

    @Test
    fun theKeyLivesInTheKeystoreAndCannotBeExported() {
        store.write("answers", secret)
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val key = ks.getKey(alias, null)
        assertTrue(ks.containsAlias(alias))
        // Keystore keys expose no key material.
        assertNull(key.encoded)
    }

    @Test
    fun deleteEverythingRemovesRecordsAndKey() {
        store.write("answers", secret)
        store.deleteEverything()
        assertFalse(store.exists("answers"))
        assertFalse(store.hasKey())
        assertNull(store.read("answers"))
    }

    @Test
    fun aTamperedOrRenamedRecordDoesNotDecrypt() {
        store.write("answers", secret)
        val file = File(dir, "answers.bin")
        val bytes = file.readBytes()
        bytes[bytes.size - 1] = (bytes[bytes.size - 1].toInt() xor 1).toByte()
        file.writeBytes(bytes)
        assertNull(store.read("answers"))
        store.write("answers", secret)
        File(dir, "answers.bin").renameTo(File(dir, "other.bin"))
        assertNull(store.read("other"))
    }

    @Test
    fun aRecordWithoutItsKeyReadsAsAbsent() {
        store.write("answers", secret)
        KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(alias)
        assertNull(store.read("answers"))
        assertFalse(store.exists("answers"))
    }
}
