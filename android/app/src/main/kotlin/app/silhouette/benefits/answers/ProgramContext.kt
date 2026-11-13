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

    /** Rule-pack facts for one program in the UI language (static content). */
    fun facts(t: Strings, programId: String): ProgramFacts {
        val info = content.pack.programInfo.first { it.id == programId }
        val criteriaIds = content.pack.json["programs"].let { programs ->
            ((programs as kotlinx.serialization.json.JsonArray).first { ((it as JsonObject)["id"] as JsonPrimitive).content == programId } as JsonObject)["criteria"]
                .let { (it as kotlinx.serialization.json.JsonArray).map { c -> ((c as JsonObject)["id"] as JsonPrimitive).content } }
        }
        val criteria = criteriaIds.associateWith { t("criterion.$programId.$it") }
        val sentences = mutableListOf("${t("answers.facts.checks")} ${criteria.values.joinToString("; ")}.")
        info.period?.let { sentences += t("answers.facts.period", "period" to it) }
        for (key in info.caveats) t.lookup("caveat.$key")?.let { sentences += "${t("answers.facts.note")} ${t("caveat.$key")}" }
        return ProgramFacts(
            programId = programId,
            name = Public.of(t.programName(info.id, info.name)),
            facts = Public.of(sentences.joinToString(" ")),
            criteria = criteria.mapValues { (_, v) -> Public.of(v) },
        )
    }

    fun explainInput(t: Strings, silhouette: Silhouette, programId: String): ExplainInput =
        ExplainInput(silhouette.canonical, silhouette.verdicts, facts(t, programId), t.language.tag)

    /** The rule engine's reasons for one program from the current answers. */
    fun reasons(steps: List<Step>, answers: QuickCheckAnswers, programId: String): List<CriterionReason> =
        runCatching { criterionReasons(content.pack, content.bands, Raw.of(toEngineAnswers(steps, answers)), programId) }.getOrDefault(emptyList())

    /** The person's result for the on-device prompts (the prompts are in English; the answer language is [Strings.language]). */
    fun personalResult(t: Strings, programId: String, verdict: Verdict, reasons: List<CriterionReason>): PersonalResult {
        val english = t.withLanguage(app.silhouette.benefits.i18n.AppLanguage.EN)
        val lines = whyRows(english, programId, reasons).joinToString("\n") { row ->
            "- ${row.label}: ${PROMPT_STATE.getValue(row.state)}" + row.limits.joinToString("") { " (limit ${it.first}, yours ${it.second})" }
        }
        val info = content.pack.programInfo.first { it.id == programId }
        return PersonalResult(
            locale = t.language.tag,
            programName = t.programName(info.id, info.name),
            facts = facts(t, programId).facts.value,
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

        /** One "why" row: the criterion label, its state, and `limit, yours` pairs as shown. */
        class WhyRow(val id: String, val label: String, val state: CriterionState, val limits: List<Pair<String, String>>) {
            override fun toString(): String = "WhyRow($id, $state)"
        }

        fun whyRows(t: Strings, programId: String, reasons: List<CriterionReason>): List<WhyRow> = reasons.map { r ->
            WhyRow(
                id = r.id,
                label = t("criterion.$programId.${r.id}"),
                state = r.state,
                limits = r.comparisons.filter { it.limit != null }.map { c ->
                    t.number(c.limit!!.toLong()) to when (val y = c.yours) {
                        is YourValue.Number -> t.decimal(y.value)
                        is YourValue.Band -> y.band.max?.let { "${t.number(y.band.min.toLong())}–${t.number(it.toLong())}" } ?: "${t.number(y.band.min.toLong())}+"
                        YourValue.NotAnswered -> t("send.unanswered")
                    }
                },
            )
        }

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
