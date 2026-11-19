# Frozen before measuring

This set was added and committed before any document in it was read by the system it tests. The commit that adds this file is the record of that. It measures the W-2 checks of contract v1.37, which were changed after the W-2s of `../heldout/` were seen.

**What will be measured, unchanged from commit `f89d667` (contract v1.37):**

- **In the cloud:** `npm run eval -- --dataset heldout-2 --variants h37`. The app's cloud request for `document.pointer.extract` (`shared/prompts/pointer-extract.v5.md`), with the leak check of `eval/README.md`. Scored on what the app shows: the answer without the boxes it leaves out (`validation/DEVICE_READING.md` section 9).
- **On a device:** `eval/heldout.html?set=heldout-2` in desktop Chrome with its on-device model ready, read as the app reads a W-2.

**Commitments.** The results are published as they come, including every miss. No prompt, word list, schema or check is changed because of what this set shows; a change measured on it makes it no longer held out, and this file will say so.

## Files (SHA-256)

| File | SHA-256 |
|---|---|
| `hv-01-1.gold.json` | `8b48ed42fda3fc75a8b1d5cfda7edd307829604ac4de51974ccb4a356fe9b266` |
| `hv-01-1.txt` | `c5a7fcc8a1e0deb62a0c78b0905be40a0cde4b62658e5c264963a66bf72eb872` |
| `hv-01-2.gold.json` | `33593ffc1e591324b11e39e311ddea992c99abc2a764dff3edb5906f29d31b91` |
| `hv-01-2.txt` | `7f335b45047c46b4f866f12f02f093fe1f87f71dc8d766406422b2c5cd4c86e3` |
| `hv-02-1.gold.json` | `974b06f7e89c6afd1b3d03d359e0c283343447902b13c3ce241e65b7999aac23` |
| `hv-02-1.txt` | `fed9eaf90df89091aee118a39923eaa471c35b723652e87bb82fb923a0a7be4b` |
| `hv-02-2.gold.json` | `8fef6039357d34775d3569e399184d63aba88447fb90b546a9bbad408f1e121d` |
| `hv-02-2.txt` | `fb7eac4bd9fe0472bed3bf59509250fa69353cb52095f36bfa69ca4b0389606e` |
| `hv-03-1.gold.json` | `cb1f2a5c5994e4bbe17de5ae454260f498aa0bdc008c3a704c9a9e86c6452c7d` |
| `hv-03-1.txt` | `ecaa3926ebeb38b351a20bd8de18871311a67e1dd1e54f0dc4761674017d63fe` |
| `hv-03-2.gold.json` | `1137870193a00d2102024664620f3bcb391db18b1012e3f1e148c5332f2546c7` |
| `hv-03-2.txt` | `244b1e848bee48805157189f3c57923731e22466630af745bb9a6c470ba52a20` |
| `hv-04-1.gold.json` | `aff5f322a50ff21c12bf1e652f2f1f5165b76aa34700e4d5f23fd92e555f1aec` |
| `hv-04-1.txt` | `1f036e27ded4809dc020b9b139012447921cb9311758ed4a602bdcbda14a2d07` |
| `hv-04-2.gold.json` | `b108aa2cf6f1b91248669040a0e82006071dfa0c3d07551688308ee3d68d7c73` |
| `hv-04-2.txt` | `e42dc748cb30706785be5f47a699086cd7ffd4f6c07619ee897be5b2e10d7341` |
| `hv-05-1.gold.json` | `c5e0d64f785a0ae4b8f0dc6735c71617601c7d0369eff512768b919001ade7ab` |
| `hv-05-1.txt` | `1b17aeef22e07806372d6cec98b219b86c9f293fa5ed53c99ccc5f23fcfb7175` |
| `hv-05-2.gold.json` | `fee988e6c7416450b3421e581ac32ada46a772b787a02ca1e249a90df90dbadf` |
| `hv-05-2.txt` | `97ad14a6de6c066f15e7786001cf4a4142d041ec1b5405f38e67c939ee77f56f` |
| `hv-06-1.gold.json` | `2c550374470f3db0ccf5334deba22b9a4946c334093d18865c13ceb45fb7d59b` |
| `hv-06-1.txt` | `23d3464093b3723ff9f69ff1cddebf8cc1bfd6cb2c0a3bf406738976155b6535` |
| `hv-06-2.gold.json` | `9e58d1924997ada969a0c4059ee12f783895aa2d4f85a43224d8342183625454` |
| `hv-06-2.txt` | `7326ccd1d973bec1ae4dc0ac2895353577cd6cb1cfcc13152a4c220a78fac493` |
