// EXPECT: INVISIBLE_REFERENCE
// The internal map() helper cannot be used to copy a Raw value out.
import app.silhouette.benefits.core.*

fun leak(name: Raw<String>): String {
    var copy = ""
    name.map { copy = it }
    return copy
}
