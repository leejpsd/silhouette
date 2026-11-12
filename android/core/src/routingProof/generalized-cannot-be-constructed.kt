// EXPECT: INVISIBLE_REFERENCE
// Only generalize() and canonical() create a Generalized value.
import app.silhouette.benefits.core.*

fun forge(text: String): CloudSafe = Generalized(text)
