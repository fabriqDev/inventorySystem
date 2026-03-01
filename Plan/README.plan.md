---
name: Project Overview
overview: FabriqWorld Expo app - inventory + POS with Supabase and Razorpay. See other plans for details.
todos: []
isProject: false
---

# FabriqWorld

Expo React Native app for inventory management and POS. Uses Supabase backend, Razorpay for payments.

## Get started

```bash
npm install
npx expo start
```

## Plans

- app_flow.plan.md — App navigation flow (login vs landing)
- login/login.plan.md — Login module and UI (separation of concern)
- supabase_login_flow.plan.md — Supabase auth backend
- home/home.plan.md — Home screen (companies list, hamburger)
- home/hamburger_menu.plan.md — Hamburger menu with Logout
- home/home_supabase.plan.md — Home Supabase functions (fetch companies)
- product/product.plan.md — Product list, search (debounced), pagination
- cart/cart.plan.md — Cart: Scan, Search, list, total, Checkout (Razorpay later)
- Models.plan.md — All data models for the codebase
- Payments.plan.md — Razorpay integration
- SupabaseClientImpl.plan.md — Centralized Supabase function calls
