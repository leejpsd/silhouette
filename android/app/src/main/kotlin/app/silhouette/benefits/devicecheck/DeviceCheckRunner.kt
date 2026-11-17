package app.silhouette.benefits.devicecheck

import app.silhouette.benefits.ai.AnswerBlocked
import app.silhouette.benefits.ai.CloudRetryFailed
import app.silhouette.benefits.ai.DocType
import app.silhouette.benefits.ai.ExplainLength
import app.silhouette.benefits.ai.ExtractOptions
import app.silhouette.benefits.ai.FailureClassifier
import app.silhouette.benefits.ai.ModelFailure
import app.silhouette.benefits.ai.OnDeviceUnreliable
import app.silhouette.benefits.ai.PersonalTasks
import app.silhouette.benefits.ai.PointerRequest
import app.silhouette.benefits.ai.PointerResult
import app.silhouette.benefits.ai.TextTasks
import app.silhouette.benefits.answers.ProgramContext
import app.silhouette.benefits.content.AppContent
import app.silhouette.benefits.core.DeviceCheck
import app.silhouette.benefits.core.DeviceOutcome
import app.silhouette.benefits.core.DevicePart
import app.silhouette.benefits.core.DeviceReadingResult
import app.silhouette.benefits.core.FieldScore
import app.silhouette.benefits.core.FieldStatus
import app.silhouette.benefits.core.Public
import app.silhouette.benefits.core.Raw
import app.silhouette.benefits.core.SkeletonResult
import app.silhouette.benefits.core.criterionReasons
import app.silhouette.benefits.core.skeletonize
import app.silhouette.benefits.core.verdicts
import app.silhouette.benefits.i18n.AppLanguage
import app.silhouette.benefits.quickcheck.preparedAnswers
import app.silhouette.benefits.quickcheck.toEngineAnswers
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

// The on-device check (shared/validation/DEVICE_CHECK.md): the 14 fixed synthetic cases of
// shared/fixtures/device-check/cases.json, run through the app's own task functions, recording where
// each one was answered, scored by value, saved as a run file (version 3). Placeholder ids and field
// names only, never document values.

/** One of the five check documents: synthetic text and its right answer. */
class CheckDocument(val caseId: String, val text: Raw<String>, val gold: (SkeletonResult) -> Raw<JsonObject>)

/** Who ran the check, for the run file's header (`browser`, `platform`, `userAgent`, `device`). */
class CheckEnvironment(val browser: String, val platform: String, val userAgent: String, val device: JsonObject?)

/** A photo case: reads the sample drawn as a picture on this device, or says why it cannot run here. */
interface PhotoCase {
    /** Null when it can run; otherwise the note recorded with `not-run`. */
    fun unsupported(): String?

    /** Reads the picture; returns where it ran and the routing reason. */
    suspend fun read(): Pair<String, String>
}

class DeviceCheckRunner(
    private val content: AppContent,
    private val documents: List<CheckDocument>,
    private val extract: suspend (PointerRequest, ExtractOptions) -> PointerResult,
    private val text: TextTasks?,
    private val personal: PersonalTasks?,
    private val photo: PhotoCase?,
    private val availability: () -> Map<String, String>,
    private val clock: () -> Long = System::currentTimeMillis,
    private val now: () -> String = { java.time.Instant.ofEpochMilli(System.currentTimeMillis()).toString() },
) {
    private val schema: JsonObject get() = content.pointerSchemas.getValue(DocType.PAYSTUB.schemaFile)
    private val programs = ProgramContext(content)

    /** Every case, in order; with [repetitions] the extraction cases run that many times first. */
    fun cases(repetitions: Int): List<suspend () -> JsonObject> {
        val extractions = (1..maxOf(1, repetitions)).flatMap { r -> documents.map { d -> suspend { extraction(d, if (repetitions > 1) r else null) } } }
        return extractions + listOf(
            suspend { explanation(AppLanguage.EN) },
            suspend { explanation(AppLanguage.ES) },
            suspend { question(AppLanguage.EN, "apply") },
            suspend { question(AppLanguage.EN, "change") },
            suspend { question(AppLanguage.ES, "apply") },
            suspend { question(AppLanguage.ES, "change") },
            suspend { personal(explain = true) },
            suspend { personal(explain = false) },
            suspend { photoCase() },
        )
    }

    /** Runs every case and returns the run file; [onCase] sees each case as soon as it finishes. */
    suspend fun run(repetitions: Int, env: CheckEnvironment, onCase: (JsonObject, Int) -> Unit = { _, _ -> }): JsonObject {
        val header = header(repetitions, env)
        val cases = ArrayList<JsonObject>()
        val all = cases(repetitions)
        for ((i, case) in all.withIndex()) {
            cases += case()
            onCase(runFile(header, cases), i + 1)
        }
        return runFile(header, cases)
    }

    fun header(repetitions: Int, env: CheckEnvironment): JsonObject {
        val out = LinkedHashMap<String, JsonElement>()
        out["kind"] = JsonPrimitive(DeviceCheck.KIND)
        out["version"] = JsonPrimitive(DeviceCheck.VERSION)
        out["date"] = JsonPrimitive(now())
        out["browser"] = JsonPrimitive(env.browser)
        out["platform"] = JsonPrimitive(env.platform)
        out["userAgent"] = JsonPrimitive(env.userAgent)
        out["availability"] = JsonObject(availability().mapValues { JsonPrimitive(it.value) })
        out["jurisdiction"] = JsonPrimitive(content.pack.jurisdiction)
        out["repetitions"] = JsonPrimitive(maxOf(1, repetitions))
        env.device?.let { out["device"] = it }
        return JsonObject(out)
    }

    private fun runFile(header: JsonObject, cases: List<JsonObject>) = JsonObject(LinkedHashMap(header).apply { put("cases", JsonArray(cases)) })

    // ---------- Extraction ----------

    private suspend fun extraction(doc: CheckDocument, repetition: Int?): JsonObject {
        val started = clock()
        val base = base(doc.caseId, "document.pointer.extract", "PREFER_ON_DEVICE", repetition)
        val skeleton = skeletonize(doc.text, content.allowlist("en"))
        val gold = doc.gold(skeleton)
        fun statuses(answer: JsonObject?): Map<String, FieldStatus> =
            if (answer == null) emptyMap() else DeviceCheck.fieldStatuses(schema, answer, skeleton, gold)
        fun score(answer: JsonObject?): FieldScore {
            val s = DeviceCheck.scoreFields(statuses(answer), gold)
            return if (answer == null) FieldScore(0, s.total) else s
        }
        return try {
            val result = extract(PointerRequest(skeleton.skeleton, DocType.PAYSTUB, "en"), ExtractOptions(document = skeleton, jurisdiction = content.pack.jurisdiction))
            val final = statuses(result.pointers)
            val attempt = result.deviceAttempt
            val answer = attempt?.let(::deviceAnswer)
            val first = if (attempt != null) score(answer) else DeviceCheck.scoreFields(final, gold)
            val ran = result.inferenceSource.name
            obj(base) {
                put("ran", JsonPrimitive(ran))
                put("latencyMs", JsonPrimitive(clock() - started))
                put("outputCheck", JsonNull)
                put("first", JsonObject(linkedMapOf("ran" to JsonPrimitive(if (attempt != null) "ON_DEVICE" else ran), "fields" to first.toJson())))
                val income = DeviceCheck.incomeInputs(final)
                put(
                    "final",
                    JsonObject(
                        linkedMapOf(
                            "ran" to JsonPrimitive(ran),
                            "fields" to DeviceCheck.scoreFields(final, gold).toJson(),
                            "retried" to JsonPrimitive(result.reason == "on-device-failed"),
                            "deductionsNotRead" to JsonPrimitive(result.deductionsNotRead),
                            "notRead" to JsonArray(result.notRead.map { JsonPrimitive(it) }),
                            "incomeInputsCorrect" to JsonPrimitive(income.notFound.isEmpty() && income.wrong.isEmpty()),
                            "incomeInputs" to income.toJson(),
                            "wrongFields" to JsonArray(DeviceCheck.wrongFields(final).map { JsonPrimitive(it) }),
                        ),
                    ),
                )
                attempt?.let { put("device", diagnosis(it, skeleton, gold)) }
                put("note", JsonPrimitive(result.reason))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            val attempt = when (e) {
                is OnDeviceUnreliable -> e.attempt
                is CloudRetryFailed -> e.attempt
                else -> null
            }
            obj(base) {
                put("ran", JsonPrimitive("not-run"))
                put("latencyMs", JsonPrimitive(clock() - started))
                put("outputCheck", JsonNull)
                put("error", JsonPrimitive(describe(e)))
                attempt?.let {
                    put("first", JsonObject(linkedMapOf("ran" to JsonPrimitive("ON_DEVICE"), "fields" to score(deviceAnswer(it)).toJson())))
                    put("device", diagnosis(it, skeleton, gold))
                }
            }
        }
    }

    /** Everything the device answered, including deductions that were then left out as not read. */
    private fun deviceAnswer(attempt: DeviceReadingResult): JsonObject? {
        val parts = attempt.passes.mapNotNull { it.value }
        if (parts.isEmpty()) return null
        return JsonObject(LinkedHashMap<String, JsonElement>().apply { parts.forEach { putAll(it) } })
    }

    private fun diagnosis(attempt: DeviceReadingResult, skeleton: SkeletonResult, gold: Raw<JsonObject>): JsonObject {
        val answer = deviceAnswer(attempt)
        val statuses = if (answer == null) emptyMap() else DeviceCheck.fieldStatuses(schema, answer, skeleton, gold)
        val goldIds = DeviceCheck.goldPlaceholderIds(gold, skeleton)
        val coreGold = goldWithout(gold, "deductions")
        val core = if (answer == null) FieldScore(0, DeviceCheck.scoreFields(emptyMap(), coreGold).total) else DeviceCheck.scoreFields(DeviceCheck.fieldStatuses(schema, answer, skeleton, coreGold), coreGold)
        val failed = attempt.outcome as? DeviceOutcome.Failed
        val deductionsAsked = attempt.passes.any { it.part == DevicePart.DEDUCTIONS }
        val notRead = (attempt.outcome as? DeviceOutcome.OnDevice)?.notRead.orEmpty()
        val goldHasDeductions = goldIds["deductions"].orEmpty().isNotEmpty()
        val corePass = attempt.passes.first()
        return JsonObject(
            linkedMapOf(
                "scoredBy" to JsonPrimitive("value"),
                "rawText" to JsonPrimitive(corePass.rawText.take(MAX_TEXT)),
                "parsed" to JsonPrimitive(corePass.parsed),
                "problems" to JsonArray(failed?.problems.orEmpty().map { JsonPrimitive(it) }),
                "passed" to JsonPrimitive(failed == null),
                "fields" to JsonArray(
                    (schema["properties"] as JsonObject).keys.map { field ->
                        JsonObject(
                            linkedMapOf(
                                "field" to JsonPrimitive(field),
                                "gold" to JsonArray(goldIds[field].orEmpty().map { JsonPrimitive(it) }),
                                "answered" to JsonArray(answeredIds(answer?.get(field)).map { JsonPrimitive(it) }),
                                "status" to JsonPrimitive((statuses[field] ?: if (goldIds.containsKey(field)) FieldStatus.MISSING else FieldStatus.ABSENT).wire),
                            ),
                        )
                    },
                ),
                "core" to core.toJson(),
                "deductions" to JsonPrimitive(if (deductionsAsked) (statuses["deductions"]?.wire ?: if (goldHasDeductions) "missing" else "absent") else "not-asked"),
                "deductionsNotRead" to JsonPrimitive("deductions" in notRead),
                "passes" to JsonArray(
                    attempt.passes.map { p ->
                        JsonObject(
                            LinkedHashMap<String, JsonElement>().apply {
                                put("part", JsonPrimitive(p.part.wire))
                                put("rawText", JsonPrimitive(p.rawText.take(MAX_TEXT)))
                                put("parsed", JsonPrimitive(p.parsed))
                                p.value?.let { put("parsedValue", it) }
                                put("problems", JsonArray(p.problems.map { JsonPrimitive(it) }))
                                if (p.marked.isNotEmpty()) put("marked", JsonArray(p.marked.map { JsonPrimitive(it) }))
                                put("extraKeys", JsonArray(p.extraKeys.map { JsonPrimitive(it) }))
                                put("missingKeys", JsonArray(p.missingKeys.map { JsonPrimitive(it) }))
                                put("latencyMs", JsonPrimitive(p.latencyMs))
                            },
                        )
                    },
                ),
            ),
        )
    }

    private fun goldWithout(gold: Raw<JsonObject>, field: String): Raw<JsonObject> = DeviceCheckGold.without(gold, field)

    // ---------- Explanations, questions, the person's own result, the photo ----------

    private fun firstProgram(): String = content.pack.programInfo.first().id

    private suspend fun explanation(language: AppLanguage): JsonObject {
        val t = content.strings(language)
        val base = base("explanation (${language.tag})", "explain.short", "PREFER_ON_DEVICE", null)
        val tasks = text ?: return notRun(base, "unsupported: no model in this build")
        val plan = tasks.planExplain(programs.explainInput(t, firstProgram()), ExplainLength.SHORT)
        return textCase(obj(base) { put("task", JsonPrimitive(plan.task)); put("mode", JsonPrimitive(plan.call.mode.name)) }) { tasks.run(plan).let { it.source.name to it.reason.key } }
    }

    private suspend fun question(language: AppLanguage, chip: String): JsonObject {
        val t = content.strings(language)
        val question = t("ask.chip.$chip")
        val base = base("$question (${language.tag})", "ask.chip", "PREFER_ON_DEVICE", null)
        val tasks = text ?: return notRun(base, "unsupported: no model in this build")
        val plan = tasks.planAskChip(programs.explainInput(t, firstProgram()), Public.of(question))
        return textCase(base) { tasks.run(plan).let { it.source.name to it.reason.key } }
    }

    private suspend fun personal(explain: Boolean): JsonObject {
        val base = if (explain) base("your own result (en)", "explain.personal", "ONLY_ON_DEVICE", null) else base("typed question (en)", "ask.freeText", "ONLY_ON_DEVICE", null)
        val tasks = personal ?: return notRun(base, "unsupported: no model in this build")
        val household = content.judgesHousehold ?: return notRun(base, "no prepared household in this rule pack")
        val t = content.strings(AppLanguage.EN)
        val answers = preparedAnswers(content.steps, household["answers"] as JsonObject)
        val engine = Raw.of(toEngineAnswers(content.steps, answers))
        val program = firstProgram()
        val verdict = verdicts(content.pack, content.bands, engine).first { it.programId == program }.verdict
        val result = programs.personalResult(t, program, verdict, criterionReasons(content.pack, content.bands, engine, program))
        return textCase(base) {
            val answer = if (explain) tasks.explain(result) else tasks.ask(TYPED_QUESTION, result)
            answer.source.name to answer.reason.key
        }
    }

    private suspend fun photoCase(): JsonObject {
        val base = base("photo of the sample (en)", "document.photo.read", "ONLY_ON_DEVICE", null)
        val p = photo ?: return notRun(base, "unsupported: no model in this build")
        p.unsupported()?.let { return notRun(base, it) }
        val started = clock()
        return try {
            val (ran, reason) = p.read()
            obj(base) {
                put("ran", JsonPrimitive(ran))
                put("latencyMs", JsonPrimitive(clock() - started))
                put("outputCheck", JsonNull)
                put("note", JsonPrimitive(reason))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            obj(base) {
                put("ran", JsonPrimitive("not-run"))
                put("latencyMs", JsonPrimitive(clock() - started))
                put("outputCheck", JsonNull)
                put("error", JsonPrimitive(describe(e)))
            }
        }
    }

    private suspend fun textCase(base: JsonObject, run: suspend () -> Pair<String, String>): JsonObject {
        val started = clock()
        return try {
            val (ran, reason) = run()
            obj(base) {
                put("ran", JsonPrimitive(ran))
                put("latencyMs", JsonPrimitive(clock() - started))
                put("outputCheck", JsonPrimitive("passed"))
                put("note", JsonPrimitive(reason))
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Throwable) {
            obj(base) {
                put("ran", JsonPrimitive("not-run"))
                put("latencyMs", JsonPrimitive(clock() - started))
                put("outputCheck", if (e is AnswerBlocked) JsonPrimitive("blocked") else JsonNull)
                put("error", JsonPrimitive(describe(e)))
            }
        }
    }

    private fun base(id: String, task: String, mode: String, repetition: Int?) = JsonObject(
        LinkedHashMap<String, JsonElement>().apply {
            put("id", JsonPrimitive(id))
            put("task", JsonPrimitive(task))
            put("mode", JsonPrimitive(mode))
            repetition?.let { put("repetition", JsonPrimitive(it)) }
        },
    )

    private fun notRun(base: JsonObject, note: String) = obj(base) {
        put("ran", JsonPrimitive("not-run"))
        put("latencyMs", JsonNull)
        put("outputCheck", JsonNull)
        put("note", JsonPrimitive(note))
    }

    private fun obj(base: JsonObject, fill: LinkedHashMap<String, JsonElement>.() -> Unit): JsonObject {
        val map = LinkedHashMap<String, JsonElement>()
        // Keys in the order of the schema's case: id, task, mode, ran, latencyMs, outputCheck, …, repetition last.
        val repetition = base["repetition"]
        for ((k, v) in base) if (k != "repetition") map[k] = v
        map.fill()
        repetition?.let { map["repetition"] = it }
        return JsonObject(map)
    }

    companion object {
        const val TYPED_QUESTION: String = "What papers should I bring?"
        const val MAX_TEXT: Int = 4000

        /**
         * Where a case stopped and why, never hiding the real error: the origin (the app's guard, the
         * SDK on the device, the cloud), the error's type and its message. Placeholder ids only can
         * appear in it: the check's inputs are synthetic and requests carry silhouettes only.
         */
        fun describe(e: Throwable): String {
            val failure: ModelFailure? = when (e) {
                is CloudRetryFailed -> e.failure
                is ModelFailure -> e
                is OnDeviceUnreliable -> null
                else -> FailureClassifier.classify(e)
            }
            val origin = when {
                e is OnDeviceUnreliable -> "device-checks"
                failure?.reason?.startsWith("guard:") == true -> "guard"
                failure != null && failure.kind != app.silhouette.benefits.ai.FailureKind.CLOUD -> "sdk-on-device"
                e is CloudRetryFailed -> "cloud-after-device"
                e is AnswerBlocked -> "output-check"
                else -> "cloud"
            }
            val root = generateSequence(e) { it.cause }.last()
            val message = (root.message ?: e.message ?: "").replace(Regex("\\s+"), " ")
            return "$origin: ${failure?.reason ?: e.javaClass.simpleName}: ${root.javaClass.simpleName}${if (message.isNotEmpty()) ": $message" else ""}".take(300)
        }

        /** The answer ids a pointer answer gives for a field (strings anywhere in it). */
        fun answeredIds(value: JsonElement?): List<String> = when (value) {
            is JsonPrimitive -> if (value.isString && Regex("^[NDW][0-9]+$").matches(value.content)) listOf(value.content) else emptyList()
            is JsonArray -> value.flatMap(::answeredIds)
            is JsonObject -> value.values.flatMap(::answeredIds)
            else -> emptyList()
        }

        private val pretty = Json { prettyPrint = true }

        /** The run file as saved and shared. */
        fun encode(file: JsonObject): String = pretty.encodeToString(JsonElement.serializer(), file) + "\n"

        /** The file name of a run (shared/validation/DEVICE_CHECK.md section 4). */
        fun fileName(file: JsonObject): String = DeviceCheck.runFileName(
            (file["date"] as JsonPrimitive).content,
            (file["browser"] as JsonPrimitive).content,
            (file["platform"] as JsonPrimitive).content,
        )
    }
}

/** Gold answers without a field (the device's core fields scored apart from its deductions). */
object DeviceCheckGold {
    fun without(gold: Raw<JsonObject>, field: String): Raw<JsonObject> = app.silhouette.benefits.core.DeviceCheck.goldWithout(gold, field)
}
