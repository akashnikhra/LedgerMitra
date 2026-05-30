# Changelog

## v1.2.2 (2026-05-30)

### Bug Fixes
- **Legacy merge in packaged app** — Fixed merge script not found error. Script path corrected to `app.asar.unpacked/scripts/`
- **Legacy merge data path** — Merge script now uses the configured data folder from settings instead of hardcoded `Upload/Data`
- **Legacy merge output** — Merged DB now written to `userData/Upload/Merged/` (writable) instead of inside the app bundle
- **Legacy data folder path** — Added path input in Legacy Import UI to manually set the data folder. Saved to settings table, persists across sessions.
- **Windows code signing** — Removed invalid `sign` property from electron-builder config that caused schema validation error

## v1.2.1 (2026-05-30)

### License Management CLI
- **`--list`** — List all licenses on the machine with status, activations, and expiry
- **`--search <query>`** — Search licenses by customer name, email, or partial key
- **`--export`** — Export all licenses to CSV for developer record-keeping
- **`--help`** — Updated help with lost key recovery guidance
- **Lost key recovery** — Three scenarios documented: customer has key, customer remembers name, customer remembers nothing

## v1.2.0 (2026-05-30)

### Licensing System
- **Offline RSA-2048 validation** � License keys verified locally, no internet required
- **30-day trial** � All features unlocked on first launch
- **Feature gating** � Premium features locked after trial: WhatsApp, Legacy Import, Multi-Company, Backup, Print/PDF
- **Hardware binding** � Licenses tied to machine fingerprint, N activations allowed
- **License generator CLI** � `npx tsx scripts/license-gen.ts` for creating customer keys
- **Activation UI** � Settings > License modal for entering keys
- **Premium badges** � PRO indicators on locked sidebar tabs
- **Startup check** � License status logged on app launch

### Database
- Added `licenses` table for storing activated keys
- Added `license_activations` table for tracking per-machine usage

## v1.1.0 (2026-05-28)

### New
- **`setup.bat`** � Automatic dependency checker and installer for new users. Checks for Node.js v18+, npm v9+, and Git, then downloads and installs any missing dependencies with user permission before running project setup.

### Landing Page
- **Hamburger nav** — Mobile nav links hidden behind a toggle button with animated X transition
- **Screenshot lightbox** — Click screenshots to view full-size in a dark overlay
- **Parallax depth** — Dot-grid backgrounds, floating screenshots, and staggered card animations across all sections
- **Mobile responsiveness** — Three breakpoints (480/640/1024px) with proper nav, typography, and layout scaling
- **Accessibility** — Visible nav toggle border, solid dropdown background, `prefers-reduced-motion` respected
- **Copyright line** — Added © 2026 LedgerMitra footer credit

## v1.0.1 (2026-05-28)

### Bug Fixes
- **Backup Import**: Fixed database restore not working after app restart. The `backup:import` handler now closes the SQLite connection before overwriting the database file and re-initializes it afterward, ensuring the restored data is visible after the renderer reloads. Previously the stale connection returned cached data from the old database. (839c02e)

## v1.0.0 (2026-05-28)

Initial release of LedgerMitra — a modern offline desktop accounting application built with Electron, React, and TypeScript.

### Features
- **Dashboard** — KPI cards, monthly revenue trends, top debtors, invoice aging, low stock alerts
- **Invoicing** — GST-ready sales invoices with line items, auto-numbering, CGST/SGST/IGST
- **Purchase Invoices** — Record purchases with stock and ledger integration
- **Payment Receipts** — Receive payments with auto or manual invoice allocation
- **Ledger** — Customer-wise, year-wise, invoice-wise ledger with debit/credit summaries
- **Customers & Suppliers** — Party master with opening balances, GSTIN, state, full transaction history
- **Products & Stock** — SKU-based catalog with rates, GST, HSN codes, stock tracking, reorder alerts
- **Financial Years** — Multi-FY support with balance carry-forward
- **Print & PDF** — Invoice, receipt, and ledger printing with save-to-PDF
- **WhatsApp Integration** — Send invoices and receipts via WhatsApp Web
- **Backup & Restore** — One-click database export and import
- **Multi-Company** — Support for multiple companies with separate books
- **Legacy Import** — Full migration engine from Speed Plus MDB/BMW files

### Tech
- Electron 30 + React 18 + TypeScript
- SQLite via better-sqlite3 (WAL mode)
- GST auto-calculation (CGST, SGST, IGST)
- Double-entry ledger with balance carry-forward
- bcryptjs local authentication

### Notes
- Windows 10+ only (64-bit)
- Node.js 18+ required for development
- Default login: `admin` / `admin123`
