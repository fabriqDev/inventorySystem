# Local storage

FabriqWorld uses local storage for session and for the selected printer device.

## What is stored

| Data        | Purpose                    | Where                      |
|------------|----------------------------|----------------------------|
| **Session**| Auth token / user session   | NHost auth: **AsyncStorage** on native (see `core/backend/nhost.ts`); one-time migration from legacy SecureStore if Async is empty |
| **Printer**| Last selected Bluetooth printer | `core/services/printing/print-service.ts` (AsyncStorage) |

## Where it’s implemented

- **Session:** NHost auth client (used in `core/backend/nhost.ts`) persists the session on native **only in AsyncStorage** (no SecureStore on the write path). First launch after upgrade may **once** copy an old Secure-only session into Async. **Logout** should only happen when the user signs out or when NHost refresh returns **401** (revoked/expired refresh token)—not when killing the app.
- **Web (normal windows / tabs):** Session is stored in **`localStorage`** (same origin). Opening the app in **another tab** loads that key, so you stay signed in. **`SessionProvider`** listens for the cross-tab `storage` event so an already-open tab updates if you sign in or out elsewhere. **Incognito / private** windows use an isolated store—each window is its own session (expected).
- **Printer:** `core/services/printing/print-service.ts` uses **AsyncStorage** to save and load the selected printer device (e.g. MAC address or device id). Keys and contract are defined in that module (e.g. `getSavedPrinter`, `setSavedPrinter`).

## Storage keys

- Session: Managed by NHost; no application-defined keys in the codebase.
- Printer: Key(s) are defined inside `print-service.ts`; see that file for the exact key names.

## See also

- [Architecture](architecture.md) — Data layer
- [Features: Company](features/company.md) — Receipt printing and printer selection
