# Feature: Auth

## Purpose

Handles **login** and **session**. User signs in with email and password; on success the app navigates to the main tabs. Session is used across the app for authenticated API calls and for displaying user info (e.g. in the home menu).

## Screen flow

- **Login** (`app/(auth)/login` → `features/auth/screens/LoginScreen`) — Email/password form; on success a short “Login successful!” state is shown, then `router.replace('/(tabs)')`.
- If the user is already signed in, the protected stack shows tabs or company flow; auth screens are not shown.

## State

- **Auth context** (`core/context/auth-context`) — Provides `session`, `signIn`, `signOut`, and related. Consumed via `useAuth()`. Wraps the app in `app/_layout.tsx` via `SessionProvider`.

## API

- **NHost Auth** — Sign-in and session management are done through the backend abstraction used in auth context (e.g. `backend.auth.signIn()`). Session is persisted via SecureStore/AsyncStorage by the NHost client.

## Storage

- **Session** — Stored by the NHost auth client (see [Local storage](../local-storage.md)).

## See also

- [Architecture](../architecture.md) — Context and dependencies
- [Navigation](../navigation.md) — Auth vs protected stack
