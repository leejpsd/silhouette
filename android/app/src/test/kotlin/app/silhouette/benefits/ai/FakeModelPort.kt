package app.silhouette.benefits.ai

/** A scripted [ModelPort]: each call takes the next step; every call is recorded. */
class FakeModelPort(private vararg val steps: (ModelCall) -> ModelReply) : ModelPort {
    val calls = mutableListOf<ModelCall>()

    override suspend fun generate(call: ModelCall): ModelReply {
        calls += call
        return steps.getOrNull(calls.size - 1)?.invoke(call) ?: error("unexpected call ${calls.size}")
    }

    companion object {
        fun reply(text: String, source: InferenceSource): (ModelCall) -> ModelReply = { ModelReply(text, source, "test-model") }

        fun fail(kind: FailureKind, reason: String = kind.name): (ModelCall) -> ModelReply = { throw ModelFailure(kind, reason) }

        const val POINTERS: String = """{"grossPay":"N12","netPay":null}"""
    }
}
