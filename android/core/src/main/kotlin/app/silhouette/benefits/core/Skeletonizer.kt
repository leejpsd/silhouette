package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.Normalizer
import java.util.Locale
import java.util.regex.Pattern

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
 * Characters that are kept verbatim and never belong to a word (SPEC.md section 2), as a regex
 * character-class body. Identical, range for range, to `SAFE_CLASS` in the reference. Every code
 * point that is not listed here and is not an ASCII digit is word material and gets masked unless
 * its word is allowlisted, so nothing depends on the platform's Unicode tables.
 */
public const val SAFE_CLASS: String =
    "\\u0009\\u000A\\u0020\\u00A0\\u2000-\\u200A\\u202F\\u205F\\u3000" + // whitespace
        "\\u0021-\\u002F\\u003A-\\u003F\\u005B-\\u005E\\u0060\\u007B-\\u007E" + // ASCII punctuation and symbols except @ and _
        "\\u00A2\\u00A3\\u00A5\\u00A7\\u00B0\\u00B1\\u00B6\\u00B7\\u00D7\\u00F7" + // ¢ £ ¥ § ° ± ¶ · × ÷
        "\\u2013\\u2014\\u2018\\u2019\\u201C\\u201D\\u2022\\u2026\\u20A9\\u20AC\\u2116" + // – — ‘ ’ “ ” • … ₩ € №
        "\\u3001\\u3002\\u3008-\\u3011\\u3014\\u3015\\u30FB" + // 、。〈〉《》「」『』【】〔〕・
        "\\uFF01\\uFF05\\uFF08\\uFF09\\uFF0B-\\uFF0F\\uFF1A\\uFF1B\\uFF1D\\uFF1F\\uFF3B\\uFF3D\\uFF5E" // fullwidth ！％（）＋，－．／：；＝？［］～

/** Month names: English full and abbreviated, Spanish full. Index + 1 is the month number. */
public val MONTH_NAMES: List<List<String>> = listOf(
    listOf("january", "jan", "enero"), listOf("february", "feb", "febrero"), listOf("march", "mar", "marzo"),
    listOf("april", "apr", "abril"), listOf("may", "mayo"), listOf("june", "jun", "junio"), listOf("july", "jul", "julio"),
    listOf("august", "aug", "agosto"), listOf("september", "sept", "sep", "septiembre", "setiembre"),
    listOf("october", "oct", "octubre"), listOf("november", "nov", "noviembre"), listOf("december", "dec", "diciembre"),
)

/** Longest alternative first, so `september` wins over `sep`. */
internal val MONTH_ALTERNATION: String =
    MONTH_NAMES.flatten().sortedWith(compareByDescending<String> { it.length }.thenBy { it }).joinToString("|")

private const val WORD_CHAR = "[^0-9$SAFE_CLASS]"

/** "October 17, 2026", "Oct. 17 2026", "17 October 2026", "17 de octubre de 2026" (SPEC.md section 2). */
internal val MONTH_DATE_SOURCE: String =
    "(?:$MONTH_ALTERNATION)\\.? [0-9]{1,2}(?:st|nd|rd|th)?,? [0-9]{4}(?![0-9])" +
        "|[0-9]{1,2}(?:st|nd|rd|th)? (?:de )?(?:$MONTH_ALTERNATION)\\.?,? (?:del? )?[0-9]{4}(?![0-9])"

/**
 * The tokenizer. Groups: 1 DATE, 2 NUM, 3 WORD, 4 OTHER. java.util.regex matches a surrogate pair
 * as one code point, like the JavaScript `u` flag. `CASE_INSENSITIVE` without `UNICODE_CASE` is
 * ASCII-only, as the spec requires for month names.
 */
internal val TOKEN_SOURCE: String =
    "($MONTH_DATE_SOURCE|[0-9]{1,4}[/.\\-][0-9]{1,2}[/.\\-][0-9]{1,4})|([0-9]+(?:[.,][0-9]+)*)|($WORD_CHAR+(?:['\\u2019\\-]$WORD_CHAR+)*)|([\\s\\S])"

private val TOKEN: Pattern = Pattern.compile(TOKEN_SOURCE, Pattern.CASE_INSENSITIVE)

// ---------- 4. Allowlist ----------

/**
 * Words that survive skeletonization, and the introducers among them (SPEC.md section 4.2): the
 * union of the document language's allowlist file and `en`.
 */
public class Allowlist(words: Collection<String>, introducers: Collection<String> = emptyList()) {
    // String equality in Kotlin is exact (by UTF-16 unit, hence by code point); no normalization.
    private val words: Set<String> = words.toHashSet()
    private val introducers: Set<String> = introducers.toHashSet()

    /** Section 4.2: the whole token's lowercase form is an introducer (no hyphen rule). */
    internal fun introduces(word: String): Boolean = word.lowercase(Locale.ROOT) in introducers

    public operator fun contains(lowercaseWord: String): Boolean = lowercaseWord in words

    /** SPEC.md section 4: whole token, or every hyphen-separated part. Locale-independent lowercasing. */
    internal fun allows(word: String): Boolean {
        val lower = word.lowercase(Locale.ROOT)
        if (lower in words) return true
        if ('-' !in lower) return false
        return lower.split('-').all { it in words }
    }

    public companion object {
        /**
         * Builds the union of `skeleton/allowlist/{language}.json` files
         * (`{"words": [...], "introducers": [...]}`; `introducers` may be absent).
         */
        public fun fromFiles(files: List<JsonElement>): Allowlist {
            fun strings(file: JsonElement, key: String, required: Boolean): List<String> {
                val list = (file as? JsonObject)?.get(key) as? JsonArray
                    ?: if (required) throw IllegalArgumentException("an allowlist file needs a $key array") else return emptyList()
                return list.map { (it as? JsonPrimitive)?.takeIf { p -> p.isString }?.content ?: throw IllegalArgumentException("allowlist $key are strings") }
            }
            return Allowlist(files.flatMap { strings(it, "words", true) }, files.flatMap { strings(it, "introducers", false) })
        }
    }
}

// ---------- 3. Replacement ----------

/** A piece of the skeleton for display. Built from the skeleton only: no document values. */
public sealed interface SkeletonPiece {
    public val text: String

    /** Safe characters between tokens. */
    public data class Separator(override val text: String) : SkeletonPiece

    /** An allowlisted word that survived. The user can hide it ([skeletonize] `hide`). */
    public data class KeptWord(override val text: String) : SkeletonPiece {
        /** The form to put into `hide`. */
        public val hideKey: String get() = text.lowercase(Locale.ROOT)
    }

    /** A placeholder such as `⟦N3⟧`; [id] is `N3`. */
    public data class Placeholder(val id: String) : SkeletonPiece {
        override val text: String get() = "$PLACEHOLDER_OPEN$id$PLACEHOLDER_CLOSE"
    }
}

/**
 * @property skeleton the cloud-safe document silhouette.
 * @property map placeholder id (`D1`, `N3`, `W12`) → original token text, in document order.
 *   Raw: it never leaves the device.
 * @property pieces the skeleton split into separators, kept words and placeholders, in order.
 *   Concatenating their texts gives [skeleton].
 */
public class SkeletonResult internal constructor(
    public val skeleton: Skeleton,
    public val map: Raw<Map<String, String>>,
    public val pieces: List<SkeletonPiece>,
) {
    /** Number of `D`, `N` and `W` placeholders. */
    public val counts: Map<Char, Int> get() = pieces.filterIsInstance<SkeletonPiece.Placeholder>().groupingBy { it.id[0] }.eachCount()
}

private class Token(val kind: Char, var text: String, var keep: Boolean = false, val hidden: Boolean = false)

/** Separators that keep two words in one phrase (SPEC.md section 4.1). */
private val PHRASE_JOINERS = setOf(" ", ", ", " & ")

/**
 * Turns Raw document text into a Skeleton. One of the two functions allowed to produce a
 * cloud-safe value from Raw (shared/DATA_TYPES.md).
 *
 * [hide] holds lowercase words the user chose to hide (SPEC.md section 4.3). A word is hidden when
 * its lowercase form, or any hyphen-separated part of it, is in [hide], wherever it occurs; its
 * phrase is masked whole, introducers included. With an empty [hide] the output is that of
 * sections 3 to 4.2.
 */
public fun skeletonize(text: Raw<String>, allow: Allowlist, hide: Set<String> = emptySet()): SkeletonResult {
    val input = normalizeDocument(text.reveal())

    // Pass 1: tokens. Consecutive safe characters form one separator token ('O').
    val tokens = ArrayList<Token>()
    val m = TOKEN.matcher(input)
    while (m.find()) {
        val date = m.group(1)
        val num = m.group(2)
        val word = m.group(3)
        when {
            date != null -> tokens += Token('D', date)
            num != null -> tokens += Token('N', num)
            word != null -> {
                val lower = word.lowercase(Locale.ROOT)
                val hidden = lower in hide || lower.split('-').any { it in hide }
                tokens += Token('W', word, keep = !hidden && allow.allows(word), hidden = hidden)
            }
            tokens.isNotEmpty() && tokens.last().kind == 'O' -> tokens.last().text += m.group(4)
            else -> tokens += Token('O', m.group(4))
        }
    }

    // Pass 2: a phrase is masked as a whole when any of its words is not allowlisted (section 4.1).
    // Leading introducers ("Employee", "This Lease is made between") are labels in front of a name,
    // never part of it: while a kept word at the start is an introducer and not the last word of the
    // phrase, it keeps its own decision, and the rule applies to the rest (section 4.2).
    var i = 0
    while (i < tokens.size) {
        if (tokens[i].kind != 'W') {
            i++
            continue
        }
        var j = i
        while (j + 2 < tokens.size && tokens[j + 1].kind == 'O' && tokens[j + 1].text in PHRASE_JOINERS && tokens[j + 2].kind == 'W') j += 2
        // A phrase in which the user hid a word is masked whole, introducers included (section 4.3).
        val userHidden = (i..j step 2).any { tokens[it].hidden }
        var start = i
        while (!userHidden && start < j && tokens[start].keep && allow.introduces(tokens[start].text)) start += 2
        val keep = (start..j step 2).all { tokens[it].keep }
        for (k in start..j step 2) tokens[k].keep = keep
        i = j + 1
    }

    // Pass 3: placeholders, numbered in document order.
    val counters = HashMap<Char, Int>()
    val map = LinkedHashMap<String, String>()
    val pieces = ArrayList<SkeletonPiece>(tokens.size)
    for (t in tokens) {
        when {
            t.kind == 'O' -> pieces += SkeletonPiece.Separator(t.text)
            t.kind == 'W' && t.keep -> pieces += SkeletonPiece.KeptWord(t.text)
            else -> {
                val n = (counters[t.kind] ?: 0) + 1
                counters[t.kind] = n
                val id = "${t.kind}$n"
                map[id] = t.text
                pieces += SkeletonPiece.Placeholder(id)
            }
        }
    }
    val out = pieces.joinToString("") { it.text }
    return SkeletonResult(Skeleton(out), Raw.of(map), pieces)
}
