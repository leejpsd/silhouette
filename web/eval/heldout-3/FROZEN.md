# Frozen before measuring

This set was added and committed before any document in it was read by the system it tests. The commit that adds this file is the record of that.

**What will be measured, unchanged from commit `43de4f4` (contract v1.44):**

- **On a device:** the iPhone app's held-out run on a real iPhone. Every document is read as the app reads a document: device first, the checks, and one cloud retry of the same silhouette when the device's answer fails them. The run file names this set (`"set": "heldout-3"`) and is scored by `eval/heldout-score.mjs`, both as the final answer the person is shown and as the device's first answer.

**Commitments.**

- The results are published as they come, including every miss.
- No prompt, word list, schema or check is changed because of what this set shows. A later change that is measured on this set makes it no longer held out, and the README will say so.
- The set is scored by the same rules as `../heldout/` (`eval/heldout-score.mjs`): names as printed and word for word, amounts within half a cent, dates and frequencies exactly, deductions as a multiset of amounts.

## Files (SHA-256)

| File | SHA-256 |
|---|---|
| `README.md` | `a760bb2e19b3203ad2bc4cdbf8d9ce4c7b25f45f2c23dc81d0a9ac9b16e70b97` |
| `hq-01-1.gold.json` | `e6886befe71725c9687386f26802c793ae749f110e82ce32d59665fec065328a` |
| `hq-01-1.txt` | `c4bab217c71206d8d2f41b95db83cfcb85a413393039991b7fa8a0d5edd9703e` |
| `hq-01-2.gold.json` | `3a982745257801399a5c9be546b961977d014a48941bd25ff8f6bfb7fe671d6a` |
| `hq-01-2.txt` | `9b6047faf375d9b313a4676702953518cec72a3383daa7799b0c0f3d1b4cdff3` |
| `hq-02-1.gold.json` | `450449377d293b70f6e988d984467446cbfe9a3cf1f1d809fbb81eca6c07d979` |
| `hq-02-1.txt` | `775856b1e5b8254715fcdabd9f42d21aee574f4e6888dcc218b105a7c475ff85` |
| `hq-02-2.gold.json` | `61f01ee79aa80bb723c6b3e24b3889972760d5e28a69205456a42566b0b94a49` |
| `hq-02-2.txt` | `52a47df4b82bf338e473db8ddc1f601fffa69eed7e4e642adce0a2304d3453bb` |
| `hq-03-1.gold.json` | `fa1e23d03e8752144eca74e0cc2d19416facfa60736c1b344a782d76704037ee` |
| `hq-03-1.txt` | `79fff5f84f14be6a74ed08588b5f004c18e8006fbc87c1a284f468b49fb91ed4` |
| `hq-03-2.gold.json` | `50f7a98ef32bbc3470dec705d07bb8f3903c4e7cfe48428cdd328fab4ee1ed07` |
| `hq-03-2.txt` | `9d78773ec5106871dbbb598e7dfb983d794fba2eb75162e0f6a0d502163fc43d` |
| `hq-04-1.gold.json` | `3ca020e10d9b4cc604db30e01329431c7a03d490035d8e4f8be083e1b5cf7202` |
| `hq-04-1.txt` | `087e87932b07819658a4b843a4b8f78c0f3cf602eac0db25bec12e037e320a70` |
| `hq-04-2.gold.json` | `fda677bae68cb3832fa6f0930fda3376dfe8232e444f8cf961af83f8b0aa5b24` |
| `hq-04-2.txt` | `80afdcce0f8e2a160adf2bca160d009c81d5faf050c2492e2da370a7edba266f` |
| `hq-05-1.gold.json` | `17947aeb05d3bcadea31046bae6c7001183499d097fb86b6cafac183ae15f38c` |
| `hq-05-1.txt` | `12d6a5eface19ca2468af478a1161fccca68f8d06f49e2d7f824469b4f057e70` |
| `hq-05-2.gold.json` | `cd68a5324cb95bc6e274f70658aff1267961e010d81594853e2c7512b0178105` |
| `hq-05-2.txt` | `79020ec186c0edd237cfe420527b00a89c61328b0ef1c1a1e34e81e1fc817c67` |
| `hq-06-1.gold.json` | `9ad83b9a495f6423eab6b08cf323d305cc3043cc3102fc9d4ecc13924309b8cc` |
| `hq-06-1.txt` | `16cc243b1c6343e5e1a463241020a84b82fd69a7f475276929843ee71421a4fc` |
| `hq-06-2.gold.json` | `84c9dea27b0ebfe40053c2709d988eee1b4e3532efd8b6a196962bd13da298df` |
| `hq-06-2.txt` | `23e17b2b7388b1b37b64b5c1cbf71ffc8c3bb7d8f35f0c5f5bc0c5c5645d7b5e` |
| `hq-07-1.gold.json` | `1199ff01efa8832ec64767fde4347aa51414c04be8b63526513d85fad5221e9a` |
| `hq-07-1.txt` | `0704baa6add0dcfce3435ed8eef199156cb80f6dad29004ef701f6494f2643c2` |
| `hq-07-2.gold.json` | `d879a543cfb109497828108ddd88b105fb66c928686cdf036eec0176ae7c2f6d` |
| `hq-07-2.txt` | `533862b0b017cf41cad2e33dcaa8d32c81ebac49199b1a3494c8827dbdb659e3` |
| `hq-08-1.gold.json` | `e2686240b85f2199bba3b8dfa9828605be30f27eab7f53cbc303db18010ddc1c` |
| `hq-08-1.txt` | `cbe1f790766bc74f9d4b568974f3bf4821c4f02a4260a176d176bd0d655a6f1d` |
| `hq-08-2.gold.json` | `9ce86d0e51eaefebcbbd2ba6e2519e990aa1dd3d51fc137dfbe4b9b2a1f9c85d` |
| `hq-08-2.txt` | `9e4e7385cbd140a566b56094570fa95842f2de816f82eb2c6a6c34d44c65b414` |
| `hq-09-1.gold.json` | `bab1cf8a15982a394096c4bb1e5059b6103a4b2fb8c34fabb4b8e104ca1aae8d` |
| `hq-09-1.txt` | `526d49a1ad9d732c1116ee161644948fb64245701b1becfe2009531f151b19df` |
| `hq-09-2.gold.json` | `05e21984598ec0b5c8b4e3aab53b943dc5e1fb716f8edef4295db8bdd556c190` |
| `hq-09-2.txt` | `9e624725f878348f1dc5408ff9cbddfa4af1cc4011f52d277350cdeb4701396f` |
| `hq-10-1.gold.json` | `ddaf972540bf58e1077b966daad00a26529677e357b1c60a78ebf716d4036a86` |
| `hq-10-1.txt` | `42846fb5ce99a297b3486e4d9825bf3042062a48da3728d53cc1904ba320fc35` |
| `hq-10-2.gold.json` | `0c34e7c5663391d0f142b490f9a77f0117a19a944cfdc9850cd18b8b3526ae87` |
| `hq-10-2.txt` | `9e1671bc4a1dc7a6f6b0a55d501eeca0f6c823ed79a57f29afb2d05b350ef7a7` |
| `hq-11-1.gold.json` | `f349ef3afef4a29e30715afbcf2a39b1078654648a30909acba2bd87f58ff899` |
| `hq-11-1.txt` | `893a761347652f01a2231543efabcbe764aace7cc80c22057ba810100ac39c65` |
| `hq-11-2.gold.json` | `ec06ec24ae5405ac822adfe02b05b7f9ff0f091453a3d37f87dafbbc555bc673` |
| `hq-11-2.txt` | `747d2552b099768d6fe8535d90c5550118ae9e89c88fec27ef94851f83edbfca` |
| `hq-12-1.gold.json` | `ef105f9afc3c354b327dcfb7541ce0b779a2674daf649442cd08c881d353c9dd` |
| `hq-12-1.txt` | `87ee811f32b8eb77962a6e90017f591932185fd10a811602ab01dff7d131067d` |
| `hq-12-2.gold.json` | `78c8f38ba59b938f02dd1e5640d01f13575e6bd561db5239efb763bc3ba8e5ab` |
| `hq-12-2.txt` | `d651ba7690f4922bf19889ed435ba0c3b3561235a25726c50f831e802ce85490` |
| `manifest.json` | `75af4b4d9c818b9a1a60550268ec4b5811863eb839de9296135c22932015ea3a` |
