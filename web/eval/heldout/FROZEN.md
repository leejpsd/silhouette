# Frozen before measuring

This set was added and committed before any document in it was read by the system it tests. The commit that adds this file is the record of that.

**What will be measured, unchanged from commit `c8c9810` (contract v1.36):**

- **In the cloud:** `npm run eval -- --dataset heldout --variants h36`. The app's cloud request for `document.pointer.extract` (`shared/prompts/pointer-extract.v5.md`, the shared schemas, `gemini-3.5-flash-lite`), on every document, with the leak check of `eval/README.md`.
- **On a device:** `eval/heldout.html` in desktop Chrome with its on-device model ready. Every document is read as the app reads it: device first, the checks of `validation/DEVICE_READING.md`, and one cloud retry of the same silhouette when the device's answer fails them.

**Commitments.**

- The results are published as they come, including every miss.
- No prompt, word list, schema or check is changed because of what this set shows. A later change that is measured on this set makes it no longer held out, and the README will say so.
- The set is scored by the same rules as `eval/dataset/` (`eval/score.mjs`) and the on-device check (`shared/validation/DEVICE_CHECK.md` section 2).

## Files (SHA-256)

| File | SHA-256 |
|---|---|
| `hp-01-1.gold.json` | `9f4b29374af0f21e86b6ef6578741f3ba6e96fdf689c181edab3f76401a6b2fe` |
| `hp-01-1.txt` | `db81ffa1cdb54273de3077284309a6a7dd5b262daa7ebd61b1548d945f2f6e49` |
| `hp-01-2.gold.json` | `b071524d150a88cf0464c02d41dffde4376e2b17d16ed0fdaeceefec202ed8a9` |
| `hp-01-2.txt` | `22d2a4773943cd577f69482666948dcfceea6bf0e8afbb410a68b13874456985` |
| `hp-02-1.gold.json` | `8eafa95e3bdb07ba4442c7701eef84b2a590337ff6ebb8a9f6661d3a8b9526e4` |
| `hp-02-1.txt` | `fd8ea35b7aa586a30fe948a3bfb6b7ece2d331f2c75fdb60330a608013819057` |
| `hp-02-2.gold.json` | `15b21e45c5c77f0297a5e55d3baaf3ab7807f532d1256cf9f6d5b93ebac7d98f` |
| `hp-02-2.txt` | `6ae0b1bd0b938550f9eaaa7c3bb1ae2b6e782afde286301ea06e345e616feae1` |
| `hp-03-1.gold.json` | `f863909d85b08712c6c6d386659e1ab20f9cc72eb63193b3d821531200a1eec6` |
| `hp-03-1.txt` | `895bf88326cd0e5a71a1f90bd7706045035de9321d39240c3c622a2a81dde59b` |
| `hp-03-2.gold.json` | `474a63ca61e390da5628e40da547d21d2603c86631c019dc268c9beeaa6dfa01` |
| `hp-03-2.txt` | `f20c8414d426646be865f46d7e9bf05a47e442d14d9a7e16af96e203b96c8375` |
| `hp-04-1.gold.json` | `9d4b760b540fccf2afc68a84737eba23d618a514e2571a37afcf3f5549689f9b` |
| `hp-04-1.txt` | `d4e2be5d7d669df49b34a9bf1ed53ec7b1c5b0ee8c471705c90b7fa61f47a964` |
| `hp-04-2.gold.json` | `62ebf299b0a6f16e6784dc88089c6530496066c776d369e836d1e4f5ab6db782` |
| `hp-04-2.txt` | `8df021e34648a8f0d52069bf46653d2487691321e8ec2f57b17984a064f0f3c0` |
| `hp-05-1.gold.json` | `c119208072dcd396e12412dec37964da68b13eee5042312125ff600b56ba4f7f` |
| `hp-05-1.txt` | `879c5dcac86bf7302266917228fae3b77606494047bbd658f2c1a7c29200ab16` |
| `hp-05-2.gold.json` | `292e733abb4eefaeddf385762e6c9dedb597c305ef767edcdeb9c65cb93fa62e` |
| `hp-05-2.txt` | `0e8ac796c84ff4d4c8d829e2a6b615034ea358e789e4331948509da56379fbbf` |
| `hp-06-1.gold.json` | `f85abc00eb6deb106de1eee34762bcf56ca26c04b5522c6432d563df09f80a0e` |
| `hp-06-1.txt` | `1b5bd8b492036556ad7d6c912d739b6cfaf65dc568aa0e00b22657b2fe03217c` |
| `hp-06-2.gold.json` | `1d87a8543070f1ba166535f41999580782f6809fba7daa4d3d38c634bc1e6d8d` |
| `hp-06-2.txt` | `1a0200a8204f204e74d824161f0bad783e69526c5c28c152b6504a790d0b192c` |
| `hp-07-1.gold.json` | `39f4aa7b6cfc3f05a8354e216e272836e66015f211c6c891f7f88e5a1f7eaf52` |
| `hp-07-1.txt` | `eb5a03f9eb7cc498ea79126b8caff10b1a603c829e061f311f2e6cf606a74adf` |
| `hp-07-2.gold.json` | `c634bac9f8eea284c6cdc992bb231a910f4477df770f90e9948bf81bf82efe9c` |
| `hp-07-2.txt` | `0d25cd0baba75a6b302b412800aa14d5d3912e97f525a7e5c75beb624a6c92d1` |
| `hp-08-1.gold.json` | `4ef14c6301720cfce799cde87e2153a9f9df52ecf0015296aa4c6b2079a0c02e` |
| `hp-08-1.txt` | `6ec81fa6c5980b35811341e7d1a04b0e3793b603bb853a23520a50ffdb6a6099` |
| `hp-08-2.gold.json` | `a955acd3704482e5cda614ba5c509ebe72061cb13225a51ce3e8931585db5e36` |
| `hp-08-2.txt` | `293ade8fd1ba190ce977cb964ee5cc70455cd17a6dad25c958555d8f6b6378a8` |
| `hp-09-1.gold.json` | `24051409bb25932ba1da2091961784db8723ec6ebfad3c5cf775a8c5573f28eb` |
| `hp-09-1.txt` | `4abb91f3b5a0547d17cf963f018d6c5b6ec530292f3c52161c465f304f28f975` |
| `hp-09-2.gold.json` | `792ca13adb14c8899453e892574212d0ce64117e645512928543bc566b8ac647` |
| `hp-09-2.txt` | `10ffa57c32e2d8921faf78086e636f408d7a8a2b4799af34bac17ffe80681642` |
| `hp-10-1.gold.json` | `2471459e354c4b16f30a737d0f2f21644e1ec512b3cb01c6e4288a1b90265b3a` |
| `hp-10-1.txt` | `c548aa76b012f654fd5e655f489da69a01eb09e6af2de10bfca248f06fbb5f5f` |
| `hp-10-2.gold.json` | `be7d7a51fe547641c999fe672424b3dd1369d9c47fcf832e2d6c71f7dcd1a4ad` |
| `hp-10-2.txt` | `50a1f6430554645fb125d22955fc6e230172cd03d233dcf75304befde009da78` |
| `hp-11-1.gold.json` | `71ea64ca4a1357fe7b2dbf605d92686fcc7ce48d2090cb675713c750c4df2e02` |
| `hp-11-1.txt` | `a9f27d2ca8318b289be9852e9a9b77333a45d7d6c517d851d7c9007456a8e080` |
| `hp-11-2.gold.json` | `73502b7ff02a9e7f2b4d8d9c9c106618b12f453be64aa62590ff9dfba9b5fcfd` |
| `hp-11-2.txt` | `51953b33201ed1500a7ad64cf36d3a7a9f69d96173a4223ac0b6b35f2cdbe671` |
| `hp-12-1.gold.json` | `1d1bde5e7d10dd99898cf4bf6c314acd97275ca546200dcbf4b7c6e753c2fce4` |
| `hp-12-1.txt` | `05843a829a7dfa3a75319c5288d8610c4c74e1fe53d79573917543b605d79252` |
| `hp-12-2.gold.json` | `388fb4d5bb3d0a98eb734c654fc61825ed1cd3e08124df374ab4e332f4d01a58` |
| `hp-12-2.txt` | `92b6fa47d6a86844182b25c638859e54cdf876fba5a8472e16cc18841ede58b1` |
| `hw-01-1.gold.json` | `daadac3bad4b528dd63684a87197b017cf45d03c3e71567b89eaa2fea2f4ae0d` |
| `hw-01-1.txt` | `924809a3644a30c4bb6936a4a0caa3a8a091af488028e5a9484e12b5bc85b377` |
| `hw-01-2.gold.json` | `757150044810a294d8a18aebf75cc70802811f95aa06ee1ea9abc69fd7b1aa6f` |
| `hw-01-2.txt` | `1639602f2f676ced3cc29446430500c556b18e78021773d4d3a889ab69c58a65` |
| `hw-02-1.gold.json` | `2974fcfe4e321f4c17fb6c5ea1e664557f93256c32e378bc2f374bd27f74d342` |
| `hw-02-1.txt` | `36f9763a5e30e62223a47b678d67a4f89e504d378aa5311625efa309355b325a` |
| `hw-02-2.gold.json` | `84459e85ce01a7dc212f5a55249f02830feb06bc0db6df8ba2ccf96706d0c0d9` |
| `hw-02-2.txt` | `7d7fe6edb330616bf61363ed5a1775423aa56a2f956a872716ef5a560b8a14ad` |
| `hw-03-1.gold.json` | `2cbd65b80c75ae9c1191ce7c819102dadfe8de49c7ca645fb9a5b480701a0094` |
| `hw-03-1.txt` | `5dd2e1e78a8836de2d6869b6c8ffe35a2656581e066913af1bb24a17b5cb0404` |
| `hw-03-2.gold.json` | `78d086ca8428ce3707557abdee7a50385cff4157677b2e4f14300a073f62226c` |
| `hw-03-2.txt` | `b780c6fd2cfddfb830311e635f1b80589e1cab9bfa789d07b1b6ff8f60aff1e2` |
