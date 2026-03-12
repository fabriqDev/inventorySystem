# Feature: Home

## Purpose

Shows the **company list** (“Your Schools”) and a **hamburger menu** for theme toggle, mock/live data toggle, and logout. User selects a company to open the company-scoped flow (tiles).

## Screen flow

- **Home** (`app/(tabs)/index` → `features/home/screens/HomeScreen`) — List of companies (cards). Tap a company → `setSelectedCompany` and `router.push(/company/{id})`. Header has menu icon and refresh; menu opens as a modal with profile, theme, data source, and logout.

## State

- **Company context** — `useCompany()` for `selectedCompany` and `setSelectedCompany`.
- **Auth context** — `useAuth()` for `session` (profile in menu) and `signOut` (logout).
- **DataSource context** — `useDataSource()` for `useMockData` and `toggleDataSource` (Mock Data / Live Data in menu).
- **Theme context** — `useAppTheme()` for `toggleTheme` and `isDark` (Light/Dark mode in menu).
- Companies list is local state loaded by `fetchCompanies(useMockData)`.

## API

- **fetchCompanies** (`core/api/companies`) — Loads companies (with role) for the current user. Respects mock/live toggle from DataSource context.

## See also

- [Architecture](../architecture.md) — Context and dependencies
- [Navigation](../navigation.md) — Tabs and company entry
- [Feature: Company](company.md) — Company-scoped flow after selection
