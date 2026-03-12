# Strings and localization

## Where UI strings live

All user-facing UI strings are defined in **`core/strings.ts`**. The module exports a single object **`Strings`** with nested keys (e.g. `Strings.auth.login`, `Strings.company.checkout`, `Strings.common.cancel`). Screens, components, and toasts should use these constants instead of hardcoded copy.

## Convention

- **Do not** put user-facing copy (button labels, screen titles, placeholders, empty-state messages, toast messages, validation/error text, receipt/print copy) as inline string literals in components or screens. Use `Strings.*` (or a small helper that reads from the same source).
- **Technical keys** (e.g. GraphQL enum values like `'sale'`, `'refund'`) and log-only text may remain as literals; document that convention in the project.

## Adding i18n later

When you add localization (i18n):

1. Replace or wrap the `Strings` object (or the helper that reads from it) so that it loads from locale-based files (e.g. `en.json`, `hi.json`) based on the current locale.
2. Keep the same key structure so that call sites stay as `Strings.auth.login` (or `t('auth.login')`) and only the implementation of `Strings` / `t` changes. No need to change every screen.

## See also

- [Architecture](architecture.md) — core layer
- [README](../README.md) — Strings and localization section
