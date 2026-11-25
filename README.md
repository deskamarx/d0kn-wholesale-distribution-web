# D0K@N Global Distribution Web

A larger-scale offline-first workspace for wholesale import and distribution operations. This app is tailored for companies that import smart phones, accessories and gadgets directly from China and distribute them through warehouses and wholesale accounts.

This is a separate project from `d0kn-electronics-web`; the electronics/service app has not been changed.

## What it does

- **Executive command center** with live KPIs, watchlists, recent activity and local intelligence signals.
- **China supply** modules for suppliers, products, import batches and shipments, including landed cost, supplier scores, incoterms, clearance states, delay risk and container counts.
- **Distribution** modules for warehouses, stock movements, wholesale customers, quotations and orders. Orders check stock before completion and quotations can be converted into draft orders.
- **Finance & control** modules for invoices, payments, compliance documents and analytics, including credit exposure, open balances, aging and category revenue.
- **Intelligence engine** with rule-based signals for low stock, 30-day demand, shipment risk, supplier quality, quote expiry, credit exposure and compliance renewal. All signals are computed locally from the current workspace; no external AI service is used.
- **Universal search** across suppliers, products, imports, shipments, customers, orders, quotations, invoices, payments and compliance records.
- **English, Bengali and Chinese** across the complete interface, with locale-aware number, currency and date formatting. The selected language is remembered in the browser.
- **Adaptive multi-device layout** with automatic phone/tablet/desktop detection plus a manual preview override in Settings. Overrides are local to the current browser.
- **PWA/offline shell** with install metadata, icon, service worker and cached app shell. Data remains in the browser and is not synced to a server.

## Modules

| Group | Sections |
| --- | --- |
| Command center | Dashboard, Intelligence, Analytics |
| China supply | Suppliers, Products, Imports, Shipments |
| Distribution | Warehouse, Customers, Quotations, Orders |
| Finance & control | Invoices, Payments, Compliance |
| System | Search, Settings |

Each module uses hash routing, for example `#suppliers`, `#orders` or `#settings`.

## Run locally

```bash
npm install
npm run dev
```

Production build and local preview:

```bash
npm run build
npm run preview
```

The Vite base path is `/d0kn-wholesale-distribution-web/`, matching the GitHub Pages project path.

## Data and storage

The app is local-only. There is no backend, account system or cloud sync.

| Purpose | localStorage key |
| --- | --- |
| Workspace records and company settings | `d0kn-distribution-v1` |
| Manual device preview override | `d0kn-distribution-preview-v1` |
| Interface language | `d0kn-distribution-language-v1` |

Settings provides JSON backup, restore and sample-data reset. The service worker caches only the app shell; workspace records stay in localStorage on the device where they were created.

## Android APK

A signed, installable Android APK is included in the GitHub release for this repository. The native wrapper bundles the complete app locally, so no server is required. See `ANDROID.md` for package details, signing information, install instructions, and rebuild commands.

## Deployment

GitHub Actions builds and deploys `dist/` on every push to `main`. Pages deployment uses the automatic `GITHUB_TOKEN`; no repository secrets are required.

Live URL after the first successful deployment:

`https://deskamarx.github.io/d0kn-wholesale-distribution-web/`

## Current status

Version `2.0.0` is a complete local-workspace prototype intended for work-scale workflow evaluation. It is not a hosted SaaS product and does not include multi-user collaboration.
