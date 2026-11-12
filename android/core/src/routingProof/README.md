# Routing proof snippets

Each `.kt` file here is compiled by `RoutingProofTest` (run by `./gradlew :core:test`) against the
compiled `:core` classes, as code in a separate module would be. The first line states the outcome:

- `// EXPECT: COMPILES` — the snippet must compile. It shows the allowed path and proves the test
  setup works, so a failure elsewhere is not caused by a broken classpath.
- `// EXPECT: <DIAGNOSTIC_NAME>` — the snippet must fail to compile, and the compiler must report
  that diagnostic (internal diagnostic names, `-Xrender-internal-diagnostic-names`).

The snippets are not part of any source set.
