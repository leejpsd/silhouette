// EXPECT: INVISIBLE_REFERENCE
// Only skeletonize() creates a Skeleton.
import app.silhouette.benefits.core.*

fun forge(text: String): CloudSafe = Skeleton(text)
