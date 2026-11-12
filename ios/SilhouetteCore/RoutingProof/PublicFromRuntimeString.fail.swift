// Must not compile: Public text from source code accepts only literals (StaticString), so a
// runtime string such as typed user input cannot be relabelled as Public.
// expect-error: cannot convert value of type 'String' to expected argument type 'StaticString'
import SilhouetteCore

func relabel(_ typed: String) -> Public<String> {
    Public(typed)
}
