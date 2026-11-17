# "Leaving your device": the record (v1)

Every platform keeps a record of every request the app makes to another host, and of every answer its on-device model wrote, and shows it in the persistent block at the bottom of the app. This file states what the record holds, how each entry is worded, and what may never leave.

## 1. Nothing leaves before the person sends

- Work on the device makes **no network request at all**: opening the app, the Quick Check, the document preview and its read-ahead, an on-device reading with all its parts (`validation/DEVICE_READING.md`), on-device explanations, typed questions and the photo reading.
- Device-only work must not create or depend on an App Check instance. **App Check starts only when a cloud request is about to be sent**, after the person chose to send. On the Web this matters because App Check's reCAPTCHA Enterprise provider loads its script and exchanges a token as soon as it is initialized; on every platform it keeps the device path free of requests.
- **No token, no request.** A cloud request is made only with a valid limited-use App Check token. When the token cannot be obtained, the request is not made: nothing carries the person's material, and the person sees the App Check message with "Try again".
- Remote Config is fetched for the first time after the first request the person chose to send (`routing.json`).

## 2. Entries and statuses

Each entry has a channel, what it carried (in plain words, never a bare host name), where it went (host and path, no query string), its time, and a status.

| Status | Meaning | Wording | Counts as sent |
|---|---|---|---|
| `attempted` | recorded before it was sent, no answer yet | `outbound.status.attempted` | yes, as in progress |
| `sent` | an answer arrived with a 2xx status | `outbound.status.sent` (with the status), or `outbound.status.loaded` when the platform cannot see the status (a script or frame another service loaded) | yes |
| `failed` | it left but did not complete: an HTTP error status, or a network error after it left | `outbound.status.failed` with the reason | yes, and listed under `leaving.notCompleted` |
| `blocked` | stopped before it left: by the app (no cloud request was expected; no App Check token) or refused by the platform's security policy | `outbound.status.blocked`, `outbound.status.noAppCheck` or `outbound.status.refusedByBrowser` | **no** |
| `answered` | an answer written by the on-device model; nothing left | `outbound.status.answeredShort` | no; counted as kept (`leaving.keptCount`) |

A request that did not complete must never read as sent: it reads "Not completed: …" or "Not sent: …". A later network error never turns a `blocked` entry into `failed`.

## 3. What each request carried

Labels are copy keys `outbound.field.{field}`. A request carries one or more fields:

| Field | Carried |
|---|---|
| `document-silhouette` | the document's silhouette (placeholders only) |
| `profile-silhouette`, `county-area`, `inline-file` | a silhouette of the person's answers, the county's center point, an attached file |
| `program-facts`, `prepared-question`, `program-names`, `answer-text`, `model-request` | public material only (a program's information, a prepared question, program names, an answer read aloud) |
| `app-check-token-request` | an App Check token request (no personal data) |
| `recaptcha-check` | Web: reCAPTCHA Enterprise's check that the request comes from the real app (no personal data); `leaving.recaptchaNote` explains that its check frame's own traffic cannot be listed |
| `installation`, `remote-config` | an installation id and the settings request (no personal data) |
| `other-request` | any other service the app contacts (no answers or documents); the destination is shown under it |

## 4. The count and the line under it

The block's number is every request that left (statuses `attempted`, `sent`, `failed`). The line under it splits that number into two parts that add up to it:

- requests that carried something of the person's (`document-silhouette`, `profile-silhouette`, `county-area`, `inline-file`): `leaving.split.document` when all of them carried only the document's silhouette, otherwise `leaving.split.personal`; `leaving.split.nothingOfYours` when there were none;
- the rest, which carried nothing of the person's: `leaving.split.technical` when all are checks and settings (App Check, reCAPTCHA, installation, Remote Config, other), otherwise `leaving.split.general` (they include general questions about a program).

The parts are joined with " · ". With nothing sent the line is `leaving.none` ("Nothing has left this device.").

## 5. Informative: what the hosted Web app sends on a first cloud Send

In a browser without the device model, a first Send makes these requests the page can see: reCAPTCHA Enterprise's loader and script, its invisible check frame, its `clr` check call, one App Check token exchange (limited use), one request to Firebase AI Logic with the silhouette, and, after the first cloud request only, an installation id and the Remote Config fetch. Eight requests, seven when the browser already has an installation id. Each later Send makes three: the reCAPTCHA check, one exchange, one model request. In a browser with the device model, the whole two-minute path makes none. Native apps use other App Check providers (App Attest, Play Integrity) and list their own requests the same way.
