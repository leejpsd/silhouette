package app.silhouette.benefits.content

import app.silhouette.benefits.ai.PointerPrompts
import app.silhouette.benefits.ai.PromptTemplate
import app.silhouette.benefits.core.Allowlist
import app.silhouette.benefits.core.Bands
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.RulePack
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.i18n.CopyTable
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.quickcheck.Step
import app.silhouette.benefits.quickcheck.buildSteps
import app.silhouette.benefits.ui.theme.DesignTokens
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** A built-in synthetic document (shared/samples/): invented person, employer and numbers. */
data class SampleDocument(val id: String, val language: String, val labelKey: String, val text: Raw<String> = Raw.of("")) {
    companion object {
        val ALL: List<SampleDocument> = listOf(
            SampleDocument("paystub-en-01", "en", "doc.sample.enText"),
            SampleDocument("payslip-ko-01", "ko", "doc.sample.koText"),
        )
    }
}

/** Reads files of the shared contract by path relative to the shared folder. Null when absent. */
fun interface ContentSource {
    fun text(path: String): String?
}

/**
 * Static, public content the app ships with: the rule pack, its bands and copy, the app copy and
 * the design tokens. Built by the `syncSharedContract` Gradle task from ../shared.
 */
class AppContent(
    val pack: RulePack,
    val bands: Bands,
    val steps: List<Step>,
    val sharedCopy: Map<AppLanguage, CopyTable>,
    val packCopy: Map<AppLanguage, CopyTable>,
    val tokens: DesignTokens,
    /** `skeleton/allowlist/{language}.json` per language. */
    private val allowlistFiles: Map<String, kotlinx.serialization.json.JsonElement>,
    /** `schemas/pointer.paystub.json` and friends, by file name. */
    val pointerSchemas: Map<String, JsonObject>,
    /** Built-in sample documents (shared/samples/), Raw text by id. */
    val samples: List<SampleDocument>,
    /** Bundled versions of shared/prompts/pointer-extract.v{n}.md. */
    val pointerPrompts: PointerPrompts,
    /** shared/prompts/photo-read.v1.md. */
    val photoPrompt: PromptTemplate,
) {
    /** The allowlist for a document: its language ∪ `en` (shared/skeleton/SPEC.md section 4). */
    fun allowlist(language: String): Allowlist =
        Allowlist.fromFiles(listOfNotNull(allowlistFiles["en"], allowlistFiles[language].takeIf { language != "en" }))

    /** Synthetic packs used only for tests and demos; the app shows a banner while one is active. */
    val isDemoPack: Boolean get() = pack.jurisdiction in DEMO_JURISDICTIONS

    fun strings(language: AppLanguage): Strings = Strings(language, sharedCopy, packCopy)

    companion object {
        const val JURISDICTION: String = "zz-test"
        val DEMO_JURISDICTIONS: Set<String> = setOf("zz-test")

        fun load(source: ContentSource, jurisdiction: String = JURISDICTION): AppContent {
            fun required(path: String) = source.text(path) ?: error("missing shared file: $path")
            val pack = RulePack.parse(Json.parseToJsonElement(required("rulepacks/$jurisdiction/pack.json")))
            val bands = Bands.parse(Json.parseToJsonElement(required("bands/$jurisdiction.json")))
            fun tables(dir: String): Map<AppLanguage, CopyTable> = AppLanguage.entries.mapNotNull { lang ->
                source.text("$dir/${lang.tag}.json")?.let { lang to copyTable(it) }
            }.toMap().also { require(AppLanguage.EN in it) { "missing $dir/en.json" } }
            val schemaNames = listOf("pointer.paystub.json")
            return AppContent(
                allowlistFiles = AppLanguage.entries.mapNotNull { lang ->
                    source.text("skeleton/allowlist/${lang.tag}.json")?.let { lang.tag to Json.parseToJsonElement(it) }
                }.toMap().also { require("en" in it) { "missing skeleton/allowlist/en.json" } },
                pointerSchemas = schemaNames.associateWith { Json.parseToJsonElement(required("schemas/$it")) as JsonObject },
                samples = SampleDocument.ALL.map { s -> s.copy(text = Raw.of(required("samples/${s.id}.txt"))) },
                pointerPrompts = PointerPrompts(
                    PointerPrompts.BUNDLED.associateWith { v -> PromptTemplate.parse("pointer-extract.v$v", required("prompts/pointer-extract.v$v.md")) },
                ),
                photoPrompt = PromptTemplate.parse("photo-read.v1", required("prompts/photo-read.v1.md")),
                pack = pack,
                bands = bands,
                steps = buildSteps(pack, bands),
                sharedCopy = tables("copy"),
                packCopy = tables("rulepacks/$jurisdiction/copy"),
                tokens = DesignTokens.parse(required("design/tokens.json")),
            )
        }

        fun copyTable(text: String): CopyTable {
            val root = Json.parseToJsonElement(text) as? JsonObject ?: error("a copy file is a JSON object")
            return root.mapNotNull { (k, v) -> (v as? JsonPrimitive)?.takeIf { it.isString }?.let { k to it.content } }.toMap()
        }
    }
}
