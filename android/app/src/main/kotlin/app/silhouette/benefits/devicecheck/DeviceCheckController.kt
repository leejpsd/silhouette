package app.silhouette.benefits.devicecheck

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import app.silhouette.benefits.core.DeviceCheck
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** What the check page shows: a live run on this phone, or a recording (always labelled as one). */
sealed interface CheckView {
    data class Live(val file: JsonObject, val running: Int?, val total: Int) : CheckView

    data class Recording(val file: JsonObject, val name: String) : CheckView
}

/**
 * The on-device check's page state. A run's file is saved to app storage when the run finishes
 * ([save]), and can then be shared. Bundled recordings (until this platform has its own: the Web's
 * reference run) are listed by name and shown labelled as recordings.
 */
class DeviceCheckController(
    private val scope: CoroutineScope,
    private val runner: () -> DeviceCheckRunner?,
    private val environment: () -> CheckEnvironment,
    private val save: (name: String, text: String) -> Unit,
    /** Bundled recordings by file name. */
    val recordings: Map<String, String>,
    private val runSchema: JsonObject?,
) {
    var view: CheckView? by mutableStateOf(null)
        private set

    var badFile: Boolean by mutableStateOf(false)
        private set

    /** The saved file of the last finished run, by name. */
    var savedName: String? by mutableStateOf(null)
        private set

    private var job: Job? = null

    val running: Boolean get() = (view as? CheckView.Live)?.running != null

    /** Runs every case ([repetitions] 1 or 3) unless a run is already going. */
    fun run(repetitions: Int) {
        if (running) return
        val r = runner() ?: return
        val total = r.cases(repetitions).size
        val env = environment()
        view = CheckView.Live(r.header(repetitions, env), 1, total)
        job = scope.launch {
            val file = r.run(repetitions, env) { partial, done ->
                view = CheckView.Live(partial, if (done < total) done + 1 else null, total)
            }
            view = CheckView.Live(file, null, total)
            val name = DeviceCheckRunner.fileName(file)
            runCatching { save(name, DeviceCheckRunner.encode(file)) }.onSuccess { savedName = name }
        }
    }

    fun showRecording(name: String) {
        val text = recordings[name] ?: return
        open(text, name)
    }

    /** Opens a run file chosen by the person; anything else is refused with a message. */
    fun open(text: String, name: String) {
        val file = runCatching { Json.parseToJsonElement(text) as JsonObject }.getOrNull()
        val valid = file != null && (file["kind"] as? JsonPrimitive)?.content == DeviceCheck.KIND &&
            (runSchema == null || DeviceCheck.validate(runSchema, file).isEmpty())
        badFile = !valid
        if (valid) view = CheckView.Recording(file!!, name)
    }

    fun clear() {
        job?.cancel()
        view = null
    }
}
