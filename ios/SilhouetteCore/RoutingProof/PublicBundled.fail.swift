// Must not compile: the bundled-content initializer of Public is package-only, so outside the
// package it does not exist at all.
// expect-error: extraneous argument label 'bundled:' in call
import SilhouetteCore

func relabel(_ typed: String) -> Public<String> {
    Public(bundled: typed)
}
