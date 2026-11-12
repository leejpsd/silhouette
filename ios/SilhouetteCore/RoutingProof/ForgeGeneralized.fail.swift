// Must not compile: only the Generalizer creates a Generalized value.
// expect-error: initializer is inaccessible due to 'internal' protection level
import SilhouetteCore

func forge(_ text: String) -> Generalized<String> {
    Generalized(value: text, canonical: text)
}
