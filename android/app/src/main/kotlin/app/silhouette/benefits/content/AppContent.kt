package app.silhouette.benefits.content

import app.silhouette.benefits.core.Bands
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
) {
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
            return AppContent(
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
