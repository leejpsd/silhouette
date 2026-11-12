package app.silhouette.benefits

import android.app.Application
import app.silhouette.benefits.ai.PointerExtraction
import app.silhouette.benefits.ai.PointerExtractor
import app.silhouette.benefits.ai.SampleAnswerKeyExtractor
import app.silhouette.benefits.content.AppContent
import app.silhouette.benefits.content.AssetContentSource
import app.silhouette.benefits.core.skeletonize
import app.silhouette.benefits.data.EncryptedAnswerRepository
import app.silhouette.benefits.data.EncryptedStore
import app.silhouette.benefits.data.OutboundLog
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File

/** App-wide services. */
class SilhouetteApplication : Application() {

    val content: AppContent by lazy { AppContent.load(AssetContentSource(assets)) }

    /** Encrypted records in the no-backup folder (also excluded because the app disallows backup). */
    val store: EncryptedStore by lazy { EncryptedStore(File(noBackupFilesDir, "store")) }

    val repository: EncryptedAnswerRepository by lazy { EncryptedAnswerRepository(store) }

    /** Every store read, write and delete runs here, one at a time, so they keep their order. */
    val storeDispatcher: CoroutineDispatcher = Dispatchers.IO.limitedParallelism(1)

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** The single record of everything that leaves, or tries to leave, the device. Persisted encrypted. */
    val outbound: OutboundLog = OutboundLog { entries ->
        val json = OutboundLog.encode(entries).toString()
        appScope.launch(storeDispatcher) { runCatching { repository.saveLedger(json) } }
    }

    /**
     * Pointer extractors, tried in order. No model is configured in this build; the only extractor is
     * the fixed answer key of the built-in sample documents. For any other document the app offers
     * typing the numbers and says why.
     */
    val extractors: List<PointerExtractor> by lazy {
        listOf(
            SampleAnswerKeyExtractor(
                content.samples.map { sample ->
                    SampleAnswerKeyExtractor.Sample(
                        id = sample.id,
                        language = sample.language,
                        skeleton = skeletonize(sample.text, content.allowlist(sample.language)).skeleton,
                        pointers = SampleAnswerKeyExtractor.POINTERS.getValue(sample.id),
                    )
                },
            ),
        )
    }

    val extraction: PointerExtraction by lazy { PointerExtraction(extractors, outbound) }
}
