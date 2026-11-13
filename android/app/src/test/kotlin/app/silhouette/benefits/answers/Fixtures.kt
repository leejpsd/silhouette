package app.silhouette.benefits.answers

import app.silhouette.benefits.TestContent
import app.silhouette.benefits.ai.ExplainSettings
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.quickcheck.AnswerValue
import app.silhouette.benefits.quickcheck.INCOME_STEP
import app.silhouette.benefits.quickcheck.QuickCheckAnswers

/** Two people with the same silhouette (household 3, renter, income range C) and different results. */
internal object People {
    val content = TestContent.content
    val programs = ProgramContext(content)

    /** Exact income under the food-help limit for 3 people, eligible residency: food-help is likely. */
    val first: QuickCheckAnswers = answers(30524.0, "eligible")

    /** Exact income over that limit in the same range, residency not eligible: food-help is unlikely. */
    val second: QuickCheckAnswers = answers(44117.0, "not-eligible")

    val canaries = listOf("30524", "30,524", "30.524", "44117", "44,117", "not-eligible", "residentStatus")

    fun answers(income: Double, resident: String): QuickCheckAnswers = QuickCheckAnswers()
        .with("householdSize", AnswerValue.Count(3))
        .with("housing", AnswerValue.Choice("renter"))
        .with("hasEarnedIncome", AnswerValue.Choice("yes"))
        .with("numChildren", AnswerValue.Count(0))
        .with("residentStatus", AnswerValue.Choice(resident))
        .with(INCOME_STEP, AnswerValue.ExactIncome(income))

    fun strings(language: AppLanguage = AppLanguage.EN): Strings = content.strings(language)

    fun silhouette(answers: QuickCheckAnswers): Silhouette = programs.silhouette(content.steps, answers)!!

    class Settings(override val shortTextMaxWords: Int = 60, override val onDeviceLocales: Set<String> = setOf("en")) : ExplainSettings
}
