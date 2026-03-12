# Error handling

## BackendError and helpers

- **BackendError** and related types/helpers live in `core/backend/errors.ts`.
- **toBackendError** — Converts thrown values or API errors into a `BackendError` shape.
- **toUserMessage** — Produces a user-facing message from a BackendError (e.g. for toasts or inline text).

## gqlRequest behavior (nhost)

The backend’s **gqlRequest** (in `core/backend/nhost.ts`) typically:

1. Calls the GraphQL API.
2. On failure: shows a **toast** with a user-friendly message (e.g. via `toUserMessage`) and **rethrows** so callers can react (e.g. set local error state or return an error result).

So API errors are both surfaced to the user (toast) and available to the caller (throw).

## Screen-level handling

- **Checkout:** Maintains `orderError` state. On create-order failure, the error message is set and shown inline (e.g. banner). User can dismiss. Toasts are still shown by gqlRequest for the initial feedback; the inline message allows retry without losing context.
- **Login:** Sets local `error` state from sign-in result or catch; displayed under the form.
- **Other screens:** May rely on toasts only, or catch and set local error state when a dedicated message is useful.

## When to show inline vs toast

- **Toast:** Good for transient feedback (e.g. “Order placed successfully”, “Print failed”). Handled centrally by gqlRequest for API errors unless the screen overrides.
- **Inline:** Good when the user must correct something (e.g. login credentials, checkout failure) or when the screen needs to show a persistent error (e.g. “Reduce quantity for items exceeding available stock”) that isn’t just a one-off toast.

## See also

- [Architecture](architecture.md) — Data layer and backend
- [Backend errors](https://github.com/your-org/FabriqWorld/blob/main/core/backend/errors.ts) — `BackendError`, `toBackendError`, `toUserMessage`
