# Long paystubs

Eight synthetic English paystubs of 2,750 to 3,460 characters (four layouts, two each), each `ls-*.txt` with its answer key `ls-*.gold.json` in the shape of `web/eval/heldout/`. Every employer, person, address and amount is invented; each stub adds up in cents (gross = the earnings lines, net = gross minus the deductions).

They are longer than the bundled sample (853 characters) and the evaluation paystubs (at most 851), as real paystubs often are, and are used to size the on-device reading requests (`DeviceBudget`, package test `DeviceBudgetTests`) and to measure how the on-device model reads long paystubs (app test `DeviceReadingWindowTests`, run with `TEST_RUNNER_READING_RUN`).
