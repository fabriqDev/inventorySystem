# Local storage

FabriqWorld uses local storage for session and for the selected printer device.

## What is stored

| Data        | Purpose                    | Where                      |
|------------|----------------------------|----------------------------|
| **Session**| Auth token / user session   | NHost auth (SecureStore/AsyncStorage) |
| **Printer**| Last selected Bluetooth printer | `core/services/printing/print-service.ts` (AsyncStorage) |

## Where it’s implemented

- **Session:** NHost auth client (used in `core/backend/nhost.ts`) persists the session. Storage is typically **SecureStore** on native and **AsyncStorage** (or equivalent) on web, as configured by the NHost SDK.
- **Printer:** `core/services/printing/print-service.ts` uses **AsyncStorage** to save and load the selected printer device (e.g. MAC address or device id). Keys and contract are defined in that module (e.g. `getSavedPrinter`, `setSavedPrinter`).

## Storage keys

- Session: Managed by NHost; no application-defined keys in the codebase.
- Printer: Key(s) are defined inside `print-service.ts`; see that file for the exact key names.

## See also

- [Architecture](architecture.md) — Data layer
- [Features: Company](features/company.md) — Receipt printing and printer selection
