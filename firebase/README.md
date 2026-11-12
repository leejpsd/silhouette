# Firebase project

| Item | Value |
|---|---|
| Project id | `silhouette-hybrid` |
| Web app id | `1:567202172105:web:ef1399cc77031101549118` |
| Android app id | `1:567202172105:android:d814d0c9fc5eb27d549118` (package `app.silhouette.benefits`) |
| iOS app id | `1:567202172105:ios:85a2ab1de6b94769549118` (bundle `app.silhouette.benefits`) |
| Firestore | `(default)`, Native mode, Standard edition, location `nam5` |
| AI Logic | Enabled (Gemini Developer API) |

```bash
npx firebase-tools apps:sdkconfig WEB 1:567202172105:web:ef1399cc77031101549118   # web config
npx firebase-tools apps:sdkconfig ANDROID 1:567202172105:android:d814d0c9fc5eb27d549118   # google-services.json (not committed)
npx firebase-tools apps:sdkconfig IOS 1:567202172105:ios:85a2ab1de6b94769549118           # GoogleService-Info.plist (not committed)
npx firebase-tools deploy --only firestore:rules,firestore:indexes,remoteconfig  
```

`firestore.rules` rejects any user document that contains keys other than the allowed ones, so profile data cannot be stored even by mistake.
