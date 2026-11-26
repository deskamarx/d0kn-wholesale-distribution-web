# Phase 2 plan — remaining 59 upgrades

Phase 1 is live at `2.1.1`. Phase 2 is an independent, shippable web release at `2.2.0`
(`CHANGELOG_ID = 2.2.0-phase2`). The signed APK stays at `2.1.0` and is not rebuilt or
republished unless explicitly requested. No backend, accounts, cloud sync, or new major
product area is introduced.

Coupled items stay together: `24 + 63`, `71 + 72`, `19 + 56`, `31 + 79`.

## Shared infrastructure

- [ ] 2 Sortable table headers (generic table toolkit)
- [ ] 3 Sticky first column
- [ ] 4 Bulk row selection with batch edit/delete/export
- [ ] 6 Inline table editing for simple fields
- [ ] 14 Card/table view switch (Products, Orders, Invoices)
- [ ] 19 + 56 Next-best-action banner and quotation expiry reminders
- [ ] 22 Global quick-add menu
- [ ] 23 Cross-module deep links from records
- [ ] 24 + 63 Saved views and saved searches
- [ ] 25 Cross-module activity timeline
- [ ] 29 Draft autosave and recovery
- [ ] 31 + 79 Barcode/SKU scanning (web + Android-optimised camera entry)
- [ ] 33 CSV paste into line items
- [ ] 34 Reusable line-item templates
- [ ] 71 + 72 Global date range and period comparison
- [ ] 73 Metric drill-down
- [ ] 74 Voice summaries for all 16 modules
- [ ] 78 Offline/pending-changes badge
- [ ] 81 Backup reminder scheduler
- [ ] 82 Android share target
- [ ] 83 System file picker for backups
- [ ] 86 Performance mode for low-end devices
- [ ] 87 Unit tests for parsers/calculations
- [ ] 88 E2E smoke script
- [ ] 92 Privacy-free diagnostic log viewer
- [ ] 93 Storage schema versioning/migration
- [ ] 94 Data integrity checker

## Module-specific

- [ ] 39 Supplier scorecard trends
- [ ] 40 Supplier contract/Incoterm tracker
- [ ] 41 Product variants/bundles
- [ ] 42 Landed-cost history per SKU
- [ ] 43 Product images/spec attachments
- [ ] 44 Import container/pallet breakdown
- [ ] 45 Landed-cost waterfall view
- [ ] 46 Import approval workflow
- [ ] 47 Shipment milestone timeline
- [ ] 48 Shipment document checklist
- [ ] 50 Warehouse bin/location tracking
- [ ] 51 Cycle-count workflow
- [ ] 52 In-transit warehouse transfers
- [ ] 53 Credit-limit guard on order creation
- [ ] 54 Customer tiers/pricing rules
- [ ] 55 Quotation version history
- [ ] 57 Partial fulfillment/packing status
- [ ] 58 Backorder tracking
- [ ] 59 Recurring invoice templates
- [ ] 60 Payment allocation to invoice lines
- [ ] 61 Bank-statement CSV import
- [ ] 62 Compliance expiry calendar/renewal queue
- [ ] 65 Weekly digest report
- [ ] 67 Cash-flow forecast
- [ ] 68 Inventory aging report
- [ ] 69 Supplier score trend chart
- [ ] 70 Receivables aging buckets

## Verification

- [ ] `npm run build`, unit tests, E2E smoke script
- [ ] Android compile check after native/web plumbing changes
- [ ] Browser verification of all 16 routes in three languages, light/dark, desktop/mobile
- [ ] Release bump, commit, push, monitor Pages deploy, verify live assets and cache `d0kn-distribution-shell-v5`
- [ ] Confirm signed APK hash unchanged and electronics app untouched
