# Silhouette

**Find the benefits you're owed — current, accurate, and your paperwork never leaves your phone.**

Silhouette is a hybrid on-device + cloud app built with [Firebase AI Logic](https://firebase.google.com/docs/ai-logic) for Web (Chrome), Android and iOS.

> Status: early development for #BuildHybridAI 2026. Not a government service. Not legal or tax advice.

## The idea in one picture

```
 your documents ──► on your device ──► exact numbers ──► deterministic rules ──► "you may qualify"
                        │
                        ├─ document silhouette  ("Gross Pay ⟦N12⟧")        ─┐
                        └─ profile silhouette   ("income band C, 3 people") ─┴─► cloud: current program status,
                                                                                 leads, nearby help
```

- **The model points, the device fills in.** For text documents, every number, date and name is replaced by a placeholder on the device. The model only says which placeholder is the gross pay. It never sees a value, so it cannot leak or invent one.
- **Fallback cannot break the promise.** Cloud-capable calls accept only data that is already safe to send. This is enforced by types and by a canary leak test.
- **Rules decide, not the model.** Eligibility comes from a human-verified, versioned rule pack evaluated on the device.

## Repository

| Path | Contents |
|---|---|
| `shared/` | Cross-platform contracts, fixtures and a zero-dependency reference implementation |
| `web/`, `android/`, `ios/` | Platform apps |
| `firebase/` | Firestore rules and Remote Config template |

```bash
cd shared/reference && npm test
```

## License

Apache-2.0. See [LICENSE](LICENSE).
