package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.text.Normalizer
import java.util.Locale

// Checks on model text. Contract: shared/prompts/OUTPUT_CHECKS.md, phrases in
// shared/prompts/output-checks.json. A model explains; it never decides.

/** Which phrases apply: `general` (the model only knows the silhouette) also blocks hedged results. */
public enum class OutputScope(public val wire: String) { GENERAL("general"), PERSONAL("personal") }

/** The phrase lists of one language. */
public class OutputPhrases(public val allowBefore: List<String>, public val definite: List<String>, public val overall: List<String>)

/** shared/prompts/output-checks.json */
public class OutputChecks(private val locales: Map<String, OutputPhrases>) {
    public fun forLocale(locale: String): OutputPhrases = locales[locale] ?: locales.getValue("en")

    public companion object {
        public fun parse(json: JsonElement): OutputChecks {
            val locales = ((json as JsonObject)["locales"] as JsonObject).mapValues { (_, v) ->
                val o = v as JsonObject
                fun list(key: String) = (o[key] as? JsonArray)?.map { (it as JsonPrimitive).content } ?: emptyList()
                OutputPhrases(list("allowBefore"), list("definite"), list("overall"))
            }
            require("en" in locales) { "output checks need an en entry" }
            return OutputChecks(locales)
        }
    }
}

/** JavaScript's `\s`: Unicode white space and line terminators, plus U+FEFF. */
private val WHITE_SPACE = Regex("[\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+")

/**
 * True when [text] states a result that only the rules may state (OUTPUT_CHECKS.md "Matching"):
 * normalized to NFC, lowercased locale-independently, curly apostrophes made straight and white
 * space collapsed; any occurrence of a phrase blocks unless the text before it ends with one of
 * `allowBefore`.
 */
public fun modelTextIsBlocked(text: String, locale: String, scope: OutputScope, checks: OutputChecks): Boolean {
    val rules = checks.forLocale(locale)
    val haystack = Normalizer.normalize(text, Normalizer.Form.NFC).lowercase(Locale.ROOT)
        .replace('‘', '\'').replace('’', '\'')
        .replace(WHITE_SPACE, " ")
    val phrases = if (scope == OutputScope.GENERAL) rules.definite + rules.overall else rules.definite
    for (phrase in phrases) {
        var at = haystack.indexOf(phrase)
        while (at != -1) {
            val before = haystack.substring(0, at)
            if (rules.allowBefore.none { before.endsWith(it) }) return true
            at = haystack.indexOf(phrase, at + 1)
        }
    }
    return false
}
