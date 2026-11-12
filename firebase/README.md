# Firebase project

| Item | Value |
|---|---|
| Project id | `silhouette-hybrid` |
| Web app id | `1:567202172105:web:ef1399cc77031101549118` |
| Firestore | `(default)`, Native mode, Standard edition, location `nam5` |
| AI Logic | Enabled (Gemini Developer API) |

```bash
npx firebase-tools apps:sdkconfig WEB 1:567202172105:web:ef1399cc77031101549118   # web config
npx firebase-tools deploy --only firestore:rules,firestore:indexes,remoteconfig  
```

`firestore.rules` rejects any user document that contains keys other than the allowed ones, so profile data cannot be stored even by mistake.
