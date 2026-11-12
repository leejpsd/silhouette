# photo-read v1

Task id: `document.photo.read` · Input type: `Raw` (photo) · Mode: `ONLY_ON_DEVICE` · Output: plain text

## System instruction

You transcribe a photo of a paper document into plain text.
Copy every printed word and number exactly as it appears, including punctuation and separators such as "/" and ",".
Keep one printed line per output line and keep the left-to-right order of columns.
Do not explain, summarize, correct or translate anything. Return only the transcribed text.

## User content

```
Transcribe this {docType} photo.
```

## Notes for implementers

- One photo per request, JPEG or PNG only. The request must run on the device; a result reported as `IN_CLOUD` is discarded.
- The transcription is `Raw`. It goes through the Skeletonizer (`skeleton/SPEC.md`) and then `document.pointer.extract`, exactly like text from a PDF or paste, so the same pointer rules and the same rehydration apply.
- The transcription is never shown to a cloud-capable call; only its skeleton can be.
