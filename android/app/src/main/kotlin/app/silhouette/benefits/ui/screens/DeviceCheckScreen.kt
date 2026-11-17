package app.silhouette.benefits.ui.screens

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import app.silhouette.benefits.ai.DeviceModelState
import app.silhouette.benefits.core.DeviceCheck
import app.silhouette.benefits.devicecheck.CheckView
import app.silhouette.benefits.i18n.Strings
import app.silhouette.benefits.ui.AppController
import app.silhouette.benefits.ui.Lead
import app.silhouette.benefits.ui.Meta
import app.silhouette.benefits.ui.Panel
import app.silhouette.benefits.ui.PrimaryButton
import app.silhouette.benefits.ui.QuietButton
import app.silhouette.benefits.ui.Route
import app.silhouette.benefits.ui.ScreenHeading
import app.silhouette.benefits.ui.SecondaryButton
import app.silhouette.benefits.ui.SectionHeading
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * The on-device check: on a phone with the on-device model, runs the fixed synthetic cases and saves
 * the run file; without one, says so plainly and can show a bundled recording, labelled as one with
 * its date, client and platform. A recording is never shown as a run on this phone.
 */
@Composable
fun DeviceCheckContent(app: AppController) {
    val t = app.strings
    val check = app.deviceCheck
    val state by (app.deviceModel?.state ?: kotlinx.coroutines.flow.MutableStateFlow(DeviceModelState.Unavailable)).collectAsState()
    val hasModel = state == DeviceModelState.Available
    val context = LocalContext.current
    val view = check?.view
    val recording = (view as? CheckView.Recording)?.file
    ScreenHeading(if (recording != null) t("deviceCheck.titleRecording") else t("deviceCheck.title"))
    if (recording != null) {
        Text(
            t("deviceCheck.recordingMeta", "date" to str(recording, "date").take(10), "browser" to str(recording, "browser"), "platform" to str(recording, "platform")),
            style = MaterialTheme.typography.titleMedium,
            modifier = Modifier.testTag("recording-meta"),
        )
    }
    view?.let { Headline(t, if (it is CheckView.Live) it.file else (it as CheckView.Recording).file) }
    if (recording != null) Meta(t("deviceCheck.recordingNote"), Modifier.testTag("recording-note"))
    Lead(t("deviceCheck.lead"))
    Meta(t("deviceCheck.cloudNote"))
    if (!hasModel && view !is CheckView.Live) Meta(t("deviceCheck.noModel"), Modifier.testTag("no-model"))
    if (check == null) return

    view?.let { Results(t, it) }
    (view as? CheckView.Live)?.let { live ->
        Meta(
            if (live.running != null) t("deviceCheck.running", "n" to live.running, "total" to live.total) else t("deviceCheck.done"),
            Modifier.testTag("device-check-status").semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
    val finished = view is CheckView.Recording || (view as? CheckView.Live)?.running == null && view != null
    if (finished) {
        SecondaryButton(t("deviceCheck.download"), onClick = {
            val file = if (view is CheckView.Live) view.file else (view as CheckView.Recording).file
            shareRunFile(context, app.deviceCheck!!.savedName.takeIf { view is CheckView.Live }, file)
        }, modifier = Modifier.testTag("device-check-share"))
    }

    SectionHeading(t("deviceCheck.recordings"))
    if (check.recordings.isEmpty()) Meta(t("deviceCheck.noRecording"))
    for (name in check.recordings.keys.sorted()) {
        QuietButton(t("deviceCheck.showRecording", "date" to name.removeSuffix(".json")), onClick = { check.showRecording(name) }, modifier = Modifier.testTag("recording-$name"))
    }
    val open = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            val text = runCatching { context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } }.getOrNull()
            check.open(text ?: "", uri.lastPathSegment ?: "run.json")
        }
    }
    SecondaryButton(t("deviceCheck.open"), onClick = { open.launch(arrayOf("application/json", "text/plain", "*/*")) }, modifier = Modifier.testTag("device-check-open"))
    if (check.badFile) Text(t("deviceCheck.badFile"), color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })

    if (hasModel) {
        var repeat by rememberSaveable { mutableStateOf(false) }
        Row(
            Modifier.toggleable(value = repeat, role = Role.Checkbox, enabled = !check.running) { repeat = it }.testTag("device-check-repeat"),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Checkbox(checked = repeat, onCheckedChange = null)
            Text(t("deviceCheck.repeat"), style = MaterialTheme.typography.bodyLarge)
        }
        PrimaryButton(t("deviceCheck.run"), onClick = { check.run(if (repeat) 3 else 1) }, modifier = Modifier.testTag("run-device-check"))
    }
    QuietButton(t("nav.home"), onClick = { app.navigate(Route.Start) })
}

private fun str(file: JsonObject, key: String): String = (file[key] as? JsonPrimitive)?.content ?: ""

private fun JsonObject.int(key: String): Int? = (this[key] as? JsonPrimitive)?.content?.toDoubleOrNull()?.toInt()

/** A case this platform cannot run is recorded with its reason and left out of the figures shown. */
private fun unsupported(c: JsonObject): Boolean = str(c, "ran") == "not-run" && str(c, "note").startsWith("unsupported")

/** The three numbers that matter, first: cases answered on this device, income inputs all right, wrong values that reached the person. */
@Composable
private fun Headline(t: Strings, file: JsonObject) {
    val version = file.int("version") ?: 3
    val cases = (file["cases"] as? JsonArray).orEmpty().map { it as JsonObject }.filterNot(::unsupported)
    val s = DeviceCheck.summarize(cases, version)
    Panel(Modifier.testTag("device-headline")) {
        Text("${s.int("onDevice")} / ${s.int("total")}  " + t("deviceCheck.headline.onDevice"), style = MaterialTheme.typography.titleMedium, modifier = Modifier.testTag("headline-on-device"))
        val income = s["income"] as? JsonObject
        val incomeRight = income?.int("allRight") ?: s.int("incomeInputsCorrect")
        if (incomeRight != null) {
            val notFound = income?.int("notFound") ?: 0
            Text(
                "$incomeRight / ${s.int("extractionCases")}  " + t("deviceCheck.headline.incomeRight") + if (notFound > 0) " " + t("deviceCheck.headline.notFound", "count" to notFound) else "",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.testTag("headline-income-right"),
            )
        }
        val wrong = s.int("wrongReachedPerson")
        if (wrong != null) {
            Text(
                (if (wrong == 0) "✓ " else "") + "$wrong / ${s.int("extractionCases")}  " + t(if (wrong == 0) "deviceCheck.headline.wrongNone" else "deviceCheck.headline.wrong"),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.testTag("headline-wrong"),
            )
        }
    }
}

@Composable
private fun Results(t: Strings, view: CheckView) {
    val file = if (view is CheckView.Live) view.file else (view as CheckView.Recording).file
    val version = file.int("version") ?: 3
    val cases = (file["cases"] as? JsonArray).orEmpty().map { it as JsonObject }
    val s = DeviceCheck.summarize(cases, version)
    Meta(t("deviceCheck.environment", "browser" to str(file, "browser"), "platform" to str(file, "platform"), "date" to str(file, "date").replace('T', ' ').take(16)), Modifier.testTag("device-environment"))
    val availability = (file["availability"] as? JsonObject).orEmpty().entries.joinToString("; ") { (k, v) -> "$k: ${(v as? JsonPrimitive)?.content}" }
    Meta(t("deviceCheck.availability", "states" to availability))
    Text(
        t("deviceCheck.summary", "onDevice" to s.int("onDevice")!!, "total" to s.int("total")!!, "afterDevice" to s.int("inCloudAfterDevice")!!, "inCloud" to s.int("inCloud")!!, "notRun" to s.int("notRun")!!),
        style = MaterialTheme.typography.bodyLarge,
        modifier = Modifier.testTag("device-summary"),
    )
    s.int("finalCorrect")?.let { correct ->
        Text(
            t("deviceCheck.summaryFinal", "correct" to correct, "fields" to s.int("fieldsTotal")!!, "retried" to s.int("retriedInCloud")!!) +
                if (version >= 3) " " + t("deviceCheck.summaryNotRead", "count" to s.int("deductionsNotRead")!!) else "",
            style = MaterialTheme.typography.bodyLarge,
        )
    }
    (s["income"] as? JsonObject)?.let { income ->
        Text(t("deviceCheck.summaryIncomeSplit", "total" to s.int("extractionCases")!!, "right" to income.int("allRight")!!, "notFound" to income.int("notFound")!!, "wrong" to income.int("wrong")!!), style = MaterialTheme.typography.bodyLarge)
        Text(t("deviceCheck.summaryWrong", "wrong" to (s.int("wrongReachedPerson") ?: 0), "total" to s.int("extractionCases")!!), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.testTag("device-summary-wrong"))
        Meta(t("deviceCheck.wrongMustBeZero"))
    }
    if ((file.int("repetitions") ?: 1) > 1) Meta(t("deviceCheck.summaryRepetitions", "repetitions" to file.int("repetitions")!!))
    Meta(t("deviceCheck.summaryFirst", "firstOnDevice" to s.int("firstOnDevice")!!, "total" to s.int("total")!!, "correct" to s.int("fieldsCorrect")!!, "fields" to s.int("fieldsTotal")!!))
    for (c in cases) {
        val ran = DeviceCheck.finalRan(c, version) ?: "not-run"
        val afterDevice = ran == "IN_CLOUD" && DeviceCheck.firstRan(c, version) == "ON_DEVICE"
        val first = if (version >= 3) (c["first"] as? JsonObject)?.get("fields") as? JsonObject else c["fields"] as? JsonObject
        val final = c["final"] as? JsonObject
        val latency = (c["latencyMs"] as? JsonPrimitive)?.takeIf { c["latencyMs"] !is JsonNull }?.content?.toDoubleOrNull()
        Panel(Modifier.testTag("device-case")) {
            Text(
                str(c, "id") + (c.int("repetition")?.let { " · " + t("deviceCheck.repetition", "n" to it, "of" to (file.int("repetitions") ?: it)) } ?: "") + " · " + str(c, "task"),
                style = MaterialTheme.typography.titleSmall,
            )
            Meta("${t("deviceCheck.col.mode")}: ${str(c, "mode")} · ${t("deviceCheck.col.ran")}: ${if (afterDevice) t("deviceCheck.ran.afterDevice") else t("deviceCheck.ran.$ran")}")
            Meta(
                "${t("deviceCheck.col.time")}: ${latency?.let { String.format(java.util.Locale.ROOT, "%.1f s", it / 1000) } ?: "—"} · " +
                    "${t("deviceCheck.col.check")}: ${(c["outputCheck"] as? JsonPrimitive)?.takeIf { c["outputCheck"] !is JsonNull }?.content ?: "—"}",
            )
            if (first != null) {
                Meta(
                    "${t("deviceCheck.col.fields")}: ${first.int("correct")} / ${first.int("total")}" +
                        (final?.let { f -> " → ${(f["fields"] as JsonObject).int("correct")} / ${(f["fields"] as JsonObject).int("total")}" + if ((f["deductionsNotRead"] as? JsonPrimitive)?.content == "true") " (${t("deviceCheck.deductionsNotReadShort")})" else "" } ?: ""),
                )
            }
            val note = str(c, "error").ifEmpty { str(c, "note") }
            if (note.isNotEmpty()) Meta("${t("deviceCheck.col.note")}: $note")
            (c["device"] as? JsonObject)?.let { DeviceDetail(t, it) }
        }
    }
}

/** The device's answer, part by part, behind a toggle: placeholder ids and field names only. */
@Composable
private fun DeviceDetail(t: Strings, device: JsonObject) {
    var open by rememberSaveable(device.hashCode()) { mutableStateOf(false) }
    QuietButton(t("deviceCheck.fieldDetail"), onClick = { open = !open })
    if (!open) return
    Column {
        val problems = (device["problems"] as? JsonArray).orEmpty().joinToString(", ") { (it as JsonPrimitive).content }
        Meta(t("deviceCheck.parsed", "parsed" to if (str(device, "parsed") == "true") "✓" else "✗", "passed" to if (str(device, "passed") == "true") "✓" else "✗") + if (problems.isNotEmpty()) " $problems" else "")
        (device["core"] as? JsonObject)?.let { core -> Meta(t("deviceCheck.parts", "core" to "${core.int("correct")} / ${core.int("total")}", "deductions" to str(device, "deductions").ifEmpty { "—" })) }
        Meta(t("deviceCheck.scoredByValue"))
        for (f in (device["fields"] as? JsonArray).orEmpty().map { it as JsonObject }) {
            val gold = (f["gold"] as JsonArray).joinToString(" ") { (it as JsonPrimitive).content }.ifEmpty { "—" }
            val answered = (f["answered"] as JsonArray).joinToString(" ") { (it as JsonPrimitive).content }.ifEmpty { "—" }
            Meta("${str(f, "field")} ${str(f, "status")} · ${t("deviceCheck.goldIds", "ids" to gold)} · ${t("deviceCheck.answeredIds", "ids" to answered)}")
        }
        for (p in (device["passes"] as? JsonArray).orEmpty().map { it as JsonObject }) {
            val latency = (p["latencyMs"] as? JsonPrimitive)?.content?.toDoubleOrNull() ?: 0.0
            val passProblems = (p["problems"] as JsonArray).joinToString(", ") { (it as JsonPrimitive).content }
            val marked = (p["marked"] as? JsonArray).orEmpty().joinToString(", ") { (it as JsonPrimitive).content }
            Text(
                t("deviceCheck.pass", "part" to str(p, "part"), "time" to String.format(java.util.Locale.ROOT, "%.1f", latency / 1000)) +
                    (if (passProblems.isNotEmpty()) " $passProblems" else "") + (if (marked.isNotEmpty()) " · " + t("deviceCheck.marked", "problems" to marked) else ""),
                style = MaterialTheme.typography.titleSmall,
            )
            Text(str(p, "rawText"), style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace))
        }
    }
}

/** Shares a run file: the saved file of a finished run, or the shown recording written to app storage first. */
private fun shareRunFile(context: android.content.Context, savedName: String?, file: JsonObject) {
    val dir = java.io.File(context.filesDir, "device-check").apply { mkdirs() }
    val name = savedName ?: app.silhouette.benefits.devicecheck.DeviceCheckRunner.fileName(file)
    val target = java.io.File(dir, name)
    if (!target.exists()) target.writeText(app.silhouette.benefits.devicecheck.DeviceCheckRunner.encode(file))
    val uri = androidx.core.content.FileProvider.getUriForFile(context, "${context.packageName}.photos", target)
    val send = Intent(Intent.ACTION_SEND).setType("application/json").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    context.startActivity(Intent.createChooser(send, name).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
}

private fun JsonObject?.orEmpty(): JsonObject = this ?: JsonObject(emptyMap())
