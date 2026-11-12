// Must not compile: only the Skeletonizer creates a Skeleton.
// expect-error: 'Skeleton' initializer is inaccessible due to 'internal' protection level
import SilhouetteCore

func forge(_ text: String) -> Skeleton {
    Skeleton(text: text)
}
