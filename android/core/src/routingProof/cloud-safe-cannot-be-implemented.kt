// EXPECT: SEALED_INHERITOR_IN_DIFFERENT_MODULE
// CloudSafe is sealed: no other module can declare a new cloud-safe type.
import app.silhouette.benefits.core.*

class Smuggled(val name: Raw<String>) : CloudSafe
