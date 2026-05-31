# Changelog

## v1.2.4 (2026-05-31)

### New
- **Portable USB mode** — App auto-detects when running from a removable drive and stores all data (DB, WhatsApp session, merge output, temp files) on the USB. Zero traces left on the host machine. Temp files are cleaned up on exit.
  - Database: `<usb>/LedgerMitra/data/ledgermitra.db`
  - WhatsApp session: `<usb>/LedgerMitra/whatsapp-session/`
  - Merge output: `<usb>/LedgerMitra/Upload/Merged/`
  - Temp PDFs: `<usb>/LedgerMitra/temp/` (cleaned on quit)
- **Portable build script** — `npm run package:portable` builds a folder-based portable package

### Improvements
- **Expired subscription UX** — When a Premium Yearly license expires, the app now shows a red "EXPIRED" badge with the expiry date and renewal message, instead of falling back to the generic trial view. Premium features remain blocked until the license is renewed.

### Bug Fixes
- **Legacy merge `ERR_MODULE_NOT_FOUND`** — Merge script now bundled with esbuild, inlining `mdb-reader` and `sql.js` dependencies. The child process no longer needs external `node_modules` in packaged mode.
- **Legacy merge `Dynamic require of "node:fs"`** — Fixed esbuild ESM bundle by adding `createRequire` shim and `__dirname` polyfill for `sql.js` WASM initialization.
- **Legacy merge WASM not found** — `sql-wasm.wasm` now bundled alongside the script in `app.asar.unpacked/scripts/`. Added `locateFile` config to point `sql.js` to the correct path.
- **License CLI local storage** — Generated licenses saved to `scripts/keys/licenses.json`. `--list` and `--search` now check both local file and app database.
- **`.gitignore`** — Added `scripts/keys/licenses.json` and `scripts/keys/licenses-export.csv` to gitignore.

## v1.2.3 (2026-05-31)

### Bug Fixes
- **PRO badges on Settings** — WhatsApp, Backup, and Legacy Import PRO badges now hidden when license is active

## v1.2.2 (2026-05-31)

### Bug Fixes
- **Legacy merge in packaged app** — Fixed merge script not found error. Script path corrected to `app.asar.unpacked/scripts/`
- **Legacy merge data path** — Merge script now uses the configured data folder from settings instead of hardcoded `Upload/Data`
- **Legacy merge output** — Merged DB now written to `userData/Upload/Merged/` (writable) instead of inside the app bundle
- **Legacy data folder path** — Added path input in Legacy Import UI to manually set the data folder. Saved to settings table, persists across sessions.
- **Windows packaging** — Added `forceCodeSigning: false` and disabled code signing in build script to fix symlink permission errors during packaging

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
