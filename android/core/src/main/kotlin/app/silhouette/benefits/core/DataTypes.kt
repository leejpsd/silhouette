package app.silhouette.benefits.core

import kotlinx.serialization.json.JsonElement

// Data types and the routing rule (shared/DATA_TYPES.md).
//
// - Raw<T>          an exact personal value. Opaque: toString, equals, hashCode and serialization
//                   never reveal it. Only code inside this module can read it (reveal() is internal).
// - Skeleton        a document silhouette (shared/skeleton/SPEC.md). Produced only by skeletonize().
// - Generalized<T>  the profile silhouette (shared/rulepacks/SPEC.md section 6). Produced only by
//                   generalize() and canonical().
// - Public<T>       static content shipped with the app (program names, rule text, jurisdiction).
// - CloudSafe       Skeleton | Generalized | Public: the only input a cloud-capable call accepts.
//
// CloudSafe is a sealed interface and the constructors of Skeleton and Generalized are internal,
// so code outside this module can neither implement CloudSafe nor construct a Skeleton or a
// Generalized value. Raw is not a CloudSafe, so a function taking CloudSafe rejects it at compile
// time. src/routingProof/ holds snippets that must fail to compile for exactly these reasons.

/** The only values that may enter a PREFER_ON_DEVICE, PREFER_IN_CLOUD or ONLY_IN_CLOUD call. */
public sealed interface CloudSafe

/**
 * An exact personal value: document text, amounts, names, answers to questions.
 *
 * - [toString] returns a fixed marker, so string templates, logs and data class `toString` stay clean.
 * - [equals] and [hashCode] use identity, so comparing against a guess reveals nothing.
 * - The class is final, does not implement `java.io.Serializable` and has no kotlinx serializer.
 *
 * Only deterministic code in this module (skeletonize, rehydrate, generalize, verdicts) reads the
 * value, through the internal [reveal]. Reflection can still reach the private field; the type
 * system guards against mistakes, not against code that deliberately breaks encapsulation.
 */
public class Raw<out T> private constructor(private val value: T) {

    internal fun reveal(): T = value

    override fun toString(): String = REDACTED

    override fun equals(other: Any?): Boolean = this === other

    override fun hashCode(): Int = System.identityHashCode(this)

    public companion object {
        /** The marker every textual form of a Raw value shows. */
        public const val REDACTED: String = "[Raw]"

        /** Wraps an exact value. Wrapping is always allowed; unwrapping is not. */
        public fun <T> of(value: T): Raw<T> = Raw(value)
    }
}

/** Applies a deterministic transformation without unwrapping the result. */
internal inline fun <T, U> Raw<T>.map(transform: (T) -> U): Raw<U> = Raw.of(transform(reveal()))

/** A document silhouette: every number, date and non-allowlisted word replaced by a placeholder. */
public class Skeleton internal constructor(public val text: String) : CloudSafe {
    override fun toString(): String = text

    override fun equals(other: Any?): Boolean = other is Skeleton && other.text == text

    override fun hashCode(): Int = text.hashCode()
}

/** A generalized (banded) description of the user. */
public class Generalized<out T : Any> internal constructor(public val value: T) : CloudSafe {
    override fun toString(): String = value.toString()

    override fun equals(other: Any?): Boolean = other is Generalized<*> && other.value == value

    override fun hashCode(): Int = value.hashCode()
}

/**
 * Public, static content (rule packs, program names, copy, jurisdiction ids, prepared question
 * chips). The factories accept only plain text and JSON trees, which cannot hold a [Raw].
 * Use them only for content that ships with the app, never for something the user typed.
 */
public class Public<out T : Any> internal constructor(public val value: T) : CloudSafe {
    override fun toString(): String = value.toString()

    override fun equals(other: Any?): Boolean = other is Public<*> && other.value == value

    override fun hashCode(): Int = value.hashCode()

    public companion object {
        /** Static text shipped with the app. */
        public fun of(text: String): Public<String> = Public(text)

        /** Static JSON shipped with the app (a rule pack, a bands file, a pointer schema). */
        public fun of(json: JsonElement): Public<JsonElement> = Public(json)
    }
}
