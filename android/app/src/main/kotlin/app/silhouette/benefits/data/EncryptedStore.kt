package app.silhouette.benefits.data

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Records encrypted at rest with AES-256-GCM. The key lives in the Android Keystore: it is
 * generated there, never leaves it (not exportable), and is used only through the Keystore.
 *
 * Each record is one file in [dir]: `[version][iv length][iv][ciphertext + tag]`. The record name
 * is bound as associated data, so a file renamed to another record does not decrypt. Writes go
 * to a temporary file that is renamed into place.
 *
 * [deleteEverything] removes every record and the key. A record whose key is gone (for example
 * after the app data was restored without the Keystore) reads as absent and is removed.
 */
class EncryptedStore(private val dir: File, private val keyAlias: String = DEFAULT_KEY_ALIAS) {

    fun write(name: String, plaintext: ByteArray) {
        requireName(name)
        dir.mkdirs()
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key(create = true))
        cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
        val iv = cipher.iv
        val sealed = cipher.doFinal(plaintext)
        val tmp = File(dir, "$name.tmp")
        tmp.outputStream().use { out ->
            out.write(FORMAT_VERSION)
            out.write(iv.size)
            out.write(iv)
            out.write(sealed)
        }
        if (!tmp.renameTo(file(name))) {
            tmp.delete()
            throw java.io.IOException("could not save record")
        }
    }

    /** The decrypted record, or null when it does not exist or cannot be decrypted. */
    fun read(name: String): ByteArray? {
        requireName(name)
        val file = file(name)
        if (!file.isFile) return null
        val key = key(create = false)
        if (key == null) {
            file.delete()
            return null
        }
        return try {
            val bytes = file.readBytes()
            require(bytes.size > 2 && bytes[0].toInt() == FORMAT_VERSION) { "unknown record format" }
            val ivLength = bytes[1].toInt()
            val iv = bytes.copyOfRange(2, 2 + ivLength)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, iv))
            cipher.updateAAD(name.toByteArray(Charsets.UTF_8))
            cipher.doFinal(bytes, 2 + ivLength, bytes.size - 2 - ivLength)
        } catch (_: AEADBadTagException) {
            file.delete()
            null
        } catch (_: IllegalArgumentException) {
            file.delete()
            null
        } catch (_: IndexOutOfBoundsException) {
            file.delete()
            null
        }
    }

    fun exists(name: String): Boolean = file(name).isFile

    fun hasKey(): Boolean = keyStore().containsAlias(keyAlias)

    /** Removes every record in [dir] and deletes the key from the Keystore. */
    fun deleteEverything() {
        dir.listFiles()?.forEach { it.deleteRecursively() }
        val ks = keyStore()
        if (ks.containsAlias(keyAlias)) ks.deleteEntry(keyAlias)
    }

    private fun file(name: String) = File(dir, "$name.bin")

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }

    private fun key(create: Boolean): SecretKey? {
        (keyStore().getKey(keyAlias, null) as? SecretKey)?.let { return it }
        if (!create) return null
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(keyAlias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun requireName(name: String) = require(NAME.matches(name)) { "invalid record name" }

    companion object {
        const val DEFAULT_KEY_ALIAS: String = "silhouette.store.v1"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val TAG_BITS = 128
        private const val FORMAT_VERSION = 1
        private val NAME = Regex("^[a-z0-9][a-z0-9.-]*$")
    }
}
