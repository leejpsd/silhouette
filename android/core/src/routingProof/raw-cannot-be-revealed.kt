// EXPECT: INVISIBLE_REFERENCE
// Code outside :core cannot read the value inside a Raw.
import app.silhouette.benefits.core.*

fun leak(name: Raw<String>): String = name.reveal()
