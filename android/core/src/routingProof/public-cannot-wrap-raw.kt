// EXPECT: NONE_APPLICABLE
// Public accepts plain text and JSON trees only, never a Raw.
import app.silhouette.benefits.core.*

fun forge(name: Raw<String>): CloudSafe = Public.of(name)
