package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.Normalizer
import java.util.Locale

// Skeletonizer. Contract: shared/skeleton/SPEC.md. Must stay byte-identical with
// shared/reference/silhouette.mjs.

/** Opening placeholder bracket, U+27E6. */
public const val PLACEHOLDER_OPEN: Char = '⟦'

/** Closing placeholder bracket, U+27E7. */
public const val PLACEHOLDER_CLOSE: Char = '⟧'

// ---------- 1. Normalization ----------

private val LINE_BREAK = Regex("\r\n?")

/** NFC, `\r\n` and `\r` to `\n`, and every placeholder bracket removed. */
public fun normalizeDocument(text: String): String =
    Normalizer.normalize(text, Normalizer.Form.NFC)
        .replace(LINE_BREAK, "\n")
        .filterNot { it == PLACEHOLDER_OPEN || it == PLACEHOLDER_CLOSE }

// ---------- 2. Tokenization ----------

/**
 * The combined reference regex of shared/skeleton/SPEC.md section 2, character for character.
 * Groups: 1 DATE, 2 NUM, 3 WORD, 4 OTHER. java.util.regex treats a surrogate pair as one code
 * point in character classes, like the JavaScript `u` flag, and `\p{L}` / `\p{M}` are the Unicode
 * general categories.
 */
public const val TOKEN_PATTERN: String =
    "([0-9]{1,4}[/.\\-][0-9]{1,2}[/.\\-][0-9]{1,4})|([0-9]+(?:[.,][0-9]+)*)|([\\p{L}\\p{M}]+(?:['’\\-][\\p{L}\\p{M}]+)*)|([\\s\\S])"

private val TOKEN = java.util.regex.Pattern.compile(TOKEN_PATTERN)

// ---------- 4. Allowlist ----------

/** Words that survive skeletonization: the union of the app locale's allowlist and `en`. */
public class Allowlist(words: Collection<String>) {
    private val words: Set<String> = words.toHashSet()

    public operator fun contains(lowercaseWord: String): Boolean = lowercaseWord in words

    /** SPEC.md section 4: whole token, or every hyphen-separated part. Locale-independent lowercasing. */
    internal fun allows(word: String): Boolean {
        val lower = word.lowercase(Locale.ROOT)
        if (lower in words) return true
        if ('-' !in lower) return false
        return lower.split('-').all { it in words }
    }

    public companion object {
        /** Builds the union of `skeleton/allowlist/{locale}.json` files (`{"words": [...]}`). */
        public fun fromFiles(files: List<JsonElement>): Allowlist = Allowlist(
            files.flatMap { file ->
                val words = (file as? JsonObject)?.get("words") as? JsonArray
                    ?: throw IllegalArgumentException("an allowlist file needs a words array")
                words.map { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content ?: throw IllegalArgumentException("allowlist words are strings") }
            },
        )
    }
}

// ---------- 3. Replacement ----------

/**
 * @property skeleton the cloud-safe document silhouette.
 * @property map placeholder id (`D1`, `N3`, `W12`) → original token text, in creation order.
 *   Raw: it never leaves the device.
 */
public class SkeletonResult internal constructor(
    public val skeleton: Skeleton,
    public val map: Raw<Map<String, String>>,
)

/**
 * Turns Raw document text into a Skeleton. One of the two functions allowed to produce a
 * cloud-safe value from Raw (shared/DATA_TYPES.md).
 */
public fun skeletonize(text: Raw<String>, allow: Allowlist): SkeletonResult {
    val input = normalizeDocument(text.reveal())
    var dates = 0
    var numbers = 0
    var words = 0
    val map = LinkedHashMap<String, String>()
    val out = StringBuilder(input.length + 16)
    fun placeholder(id: String, value: String) {
        map[id] = value
        out.append(PLACEHOLDER_OPEN).append(id).append(PLACEHOLDER_CLOSE)
    }
    val m = TOKEN.matcher(input)
    while (m.find()) {
        val date = m.group(1)
        val num = m.group(2)
        val word = m.group(3)
        when {
            date != null -> placeholder("D${++dates}", date)
            num != null -> placeholder("N${++numbers}", num)
            word != null -> if (allow.allows(word)) out.append(word) else placeholder("W${++words}", word)
            else -> out.append(m.group(4))
        }
    }
    return SkeletonResult(Skeleton(out.toString()), Raw.of(map))
}
