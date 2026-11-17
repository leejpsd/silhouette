package app.silhouette.benefits.answers

import app.silhouette.benefits.ai.ExplainInput
import app.silhouette.benefits.ai.PersonalResult
import app.silhouette.benefits.ai.ProgramFacts
import app.silhouette.benefits.content.AppContent
import app.silhouette.benefits.core.CriterionReason
import app.silhouette.benefits.core.CriterionState
import app.silhouette.benefits.core.Generalized
import app.silhouette.benefits.core.GeneralizedProfile
import app.silhouette.benefits.core.HouseholdSize
import app.silhouette.benefits.core.Public
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.SilhouetteVerdict
import app.silhouette.benefits.core.Verdict
import app.silhouette.benefits.core.YourValue
import app.silhouette.benefits.core.canonical
import app.silhouette.benefits.core.criterionReasons
import app.silhouette.benefits.core.generalize
import app.silhouette.benefits.core.silhouetteVerdicts
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.quickcheck.QuickCheckAnswers
import app.silhouette.benefits.quickcheck.Step
import app.silhouette.benefits.quickcheck.toEngineAnswers
import app.silhouette.benefits.quickcheck.isMoneyVariable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** The profile silhouette of the current answers and the verdicts the engine reaches from it alone. */
class Silhouette(
    val profile: Generalized<GeneralizedProfile>,
    val canonical: Generalized<String>,
    val verdicts: Generalized<List<SilhouetteVerdict>>,
)

/**
 * Builds what the explanation features need from the app's answers. Exact values leave this file
 * only as the Generalizer's output (cloud-capable) or as [PersonalResult] and the "why" rows
 * (on screen and on-device-only).
 */
class ProgramContext(private val content: AppContent) {

    /** The exact profile for the Generalizer: only non-sensitive answers feed it (rulepacks/SPEC.md section 2). */
    private fun exactProfile(steps: List<Step>, answers: QuickCheckAnswers): JsonObject {
        val engine = toEngineAnswers(steps, answers)
        val open = content.pack.questions.filter { !it.sensitive }.map { it.id }.toSet()
        val out = LinkedHashMap<String, JsonElement>()
        out["jurisdiction"] = JsonPrimitive(content.pack.jurisdiction)
        engine["annualIncome"]?.let { out["annualIncome"] = it }
        engine["incomeBand"]?.let { out["incomeBand"] = it }
        for (key in listOf("householdSize", "housing", "county", "childAges")) {
            if (key in open) engine[key]?.let { out[key] = it }
        }
        return JsonObject(out)
    }

    /** Null when the Generalizer refuses the answers (it never says why with values). */
    fun silhouette(steps: List<Step>, answers: QuickCheckAnswers): Silhouette? = runCatching {
        val profile = generalize(Raw.of(exactProfile(steps, answers)), content.bands)
        Silhouette(profile, canonical(profile), silhouetteVerdicts(content.pack, content.bands, profile))
    }.getOrNull()

    /** The pack's optional program copy in the UI language (rulepacks/SPEC.md section 2.1), by key. */
    fun programCopy(t: Strings, programId: String): Map<String, String> =
        PROGRAM_COPY_KEYS.mapNotNull { key -> t.lookup("program.$programId.$key")?.let { key to it } }.toMap()

    /**
     * `{programFacts}` (rulepacks/SPEC.md section 2.1), one item per line, skipping what is absent:
     * the program copy, then "This program uses: …" with the labels of the answers its criteria read,
     * then "This program checks: …" with the criterion labels. Static content, so Public.
     */
    fun facts(t: Strings, programId: String): ProgramFacts {
        val info = content.pack.programInfo.first { it.id == programId }
        val copy = programCopy(t, programId)
        val lines = PROGRAM_COPY_KEYS.mapNotNull { copy[it] }.toMutableList()
        val uses = info.uses.mapNotNull { t.lookup("variable.$it") }
        if (uses.isNotEmpty()) lines += "${t("answers.facts.uses")} ${uses.joinToString("; ")}."
        lines += "${t("answers.facts.checks")} ${info.criterionIds.joinToString("; ") { t("criterion.$programId.$it") }}."
        return ProgramFacts(
            programId = programId,
            name = Public.of(t.programName(info.id, info.name)),
            facts = Public.of(lines.joinToString("\n")),
        )
    }

    /** What the general explanation and prepared questions are given: the program's public information only. */
    fun explainInput(t: Strings, programId: String): ExplainInput = ExplainInput(facts(t, programId), t.language.tag)

    /** The rule engine's reasons for one program from the current answers. */
    fun reasons(steps: List<Step>, answers: QuickCheckAnswers, programId: String): List<CriterionReason> =
        runCatching { criterionReasons(content.pack, content.bands, Raw.of(toEngineAnswers(steps, answers)), programId) }.getOrDefault(emptyList())

    /** The person's result for the on-device prompts (in English; the answer language is [Strings.language]). */
    fun personalResult(t: Strings, programId: String, verdict: Verdict, reasons: List<CriterionReason>): PersonalResult {
        val lines = whyRows(t, programId, reasons, money = false).joinToString("\n") { row ->
            val state = if (row.stateText == t("state.${row.state.wire}")) PROMPT_STATE.getValue(row.state) else row.stateText
            "- ${row.label}: $state" + row.limits.joinToString("") { " (limit ${it.first}, yours ${it.second})" } + row.notes.joinToString("") { " $it" }
        }
        val info = content.pack.programInfo.first { it.id == programId }
        return PersonalResult(
            locale = t.language.tag,
            programName = t.programName(info.id, info.name),
            facts = facts(t, programId).facts.value,
            verdict = verdict,
            verdictLabel = t("verdict.${verdict.wire}"),
            criteriaLines = lines,
        )
    }

    companion object {
        /** State words of shared/prompts/explain-personal.v1.md. */
        val PROMPT_STATE: Map<CriterionState, String> = mapOf(
            CriterionState.PASS to "met",
            CriterionState.FAIL to "not met",
            CriterionState.MIXED to "depends on your exact income",
            CriterionState.UNKNOWN to "not answered",
        )

        /** Optional program copy keys, in the order of rulepacks/SPEC.md section 2.1. */
        val PROGRAM_COPY_KEYS: List<String> = listOf("summary", "apply", "documents", "renewal", "office")

        /**
         * One "why" row: the criterion label, its state, what the state means here ([stateText]: the
         * state word, or what it depends on when that is not the income), `limit, yours` pairs for the
         * comparisons that produce the state, and notes (met another way, the household-size cap).
         */
        class WhyRow(
            val id: String,
            val label: String,
            val state: CriterionState,
            val stateText: String,
            val limits: List<Pair<String, String>>,
            val notes: List<String>,
        ) {
            override fun toString(): String = "WhyRow($id, $state)"
        }

        /**
         * The reasons as lines that never contradict the verdict: a limit is shown only for a
         * comparison that produces the state; a criterion met another way says which way; a `mixed`
         * state from `uncertainIf` says what it depends on; a capped limit says so. Limits and answers
         * that are money are shown in the pack's currency when [money]; the on-device prompt keeps plain numbers.
         */
        fun whyRows(t: Strings, programId: String, reasons: List<CriterionReason>, money: Boolean = true): List<WhyRow> = reasons.map { r ->
            fun shown(v: Double, isMoney: Boolean) = if (isMoney) t.money(v) else if (money) t.decimal(v) else plain(v)
            val notes = ArrayList<String>()
            r.metBy?.let { m ->
                val way = m.value?.let { t.lookup("option.${m.variable}.$it") } ?: t.lookup("variable.${m.variable}") ?: m.variable
                notes += t("why.metBy", "way" to way)
            }
            val decisive = r.comparisons.filter { it.limit != null && it.decisive }
            decisive.firstNotNullOfOrNull { it.capped }?.let { notes += t("why.capNote", "cap" to it) }
            WhyRow(
                id = r.id,
                label = t("criterion.$programId.${r.id}"),
                state = r.state,
                stateText = r.exception?.takeIf { it.isNotEmpty() }?.let { what ->
                    t("why.exception", "what" to what.joinToString(", ") { t.lookup("variable.$it") ?: it })
                } ?: t("state.${r.state.wire}"),
                limits = decisive.map { c ->
                    val isMoney = money && isMoneyVariable(c.variable)
                    shown(c.limit!!, isMoney) to when (val y = c.yours) {
                        is YourValue.Number -> shown(y.value, isMoney)
                        is YourValue.Band -> y.band.max?.let { "${shown(y.band.min, isMoney)}–${shown(it, isMoney)}" } ?: "${shown(y.band.min, isMoney)}+"
                        YourValue.NotAnswered -> t("send.unanswered")
                    }
                },
                notes = notes,
            )
        }

        /** A number as the English prompt writes it: grouped, no decimals when whole. */
        private fun plain(v: Double): String =
            java.text.NumberFormat.getNumberInstance(java.util.Locale.US).apply { maximumFractionDigits = 2 }.format(v)

        /** Lines describing a silhouette for the step before sending, in the UI language. */
        fun silhouetteLines(t: Strings, content: AppContent, profile: GeneralizedProfile): List<String> {
            val none = t("send.unanswered")
            val band = content.bands.annualIncome.find { it.id == profile.incomeBand }
            return listOf(
                t("send.line.jurisdiction", "value" to "${t.lookup("pack.${profile.jurisdiction}.name") ?: profile.jurisdiction} (${profile.jurisdiction})"),
                t("send.line.incomeBand", "value" to (band?.let { "${t.bandLabel(it)} (${it.id})" } ?: none)),
                t(
                    "send.line.householdSize",
                    "value" to when (val h = profile.householdSize) {
                        null -> none
                        is HouseholdSize.Count -> h.value.toString()
                        is HouseholdSize.AboveCap -> h.label
                    },
                ),
                t("send.line.housing", "value" to (profile.housing?.let { "${t.lookup("option.housing.${it.wire}") ?: it.wire} (${it.wire})" } ?: none)),
                t("send.line.childAgeBands", "value" to (profile.childAgeBands?.joinToString(", ")?.ifEmpty { "-" } ?: none)),
                t("send.line.county", "value" to (profile.county ?: none)),
            )
        }
    }
}
