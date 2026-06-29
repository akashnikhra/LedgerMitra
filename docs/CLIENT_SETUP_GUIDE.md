# LedgerMitra — Client Setup & Deployment Guide

This guide covers the complete setup, deployment, licensing, and day-one configuration of **LedgerMitra** for a customer. It is intended for the developer/system-admin who installs and hands over the solution.

---

## Table of Contents

1. [What You Are Deploying](#1-what-you-are-deploying)
2. [System Requirements](#2-system-requirements)
3. [Installation](#3-installation)
4. [First Run / Initial Login](#4-first-run--initial-login)
5. [Create Company & Financial Year](#5-create-company--financial-year)
6. [License Activation](#6-license-activation)
7. [Generating License Keys](#7-generating-license-keys)
8. [Everyday Setup: Customers, Products & Invoices](#8-everyday-setup-customers-products--invoices)
9. [WhatsApp Integration](#9-whatsapp-integration)
10. [Legacy Speed Plus Import](#10-legacy-speed-plus-import)
11. [Backup & Restore](#11-backup--restore)
12. [Portable USB Deployment](#12-portable-usb-deployment)
13. [Building the Installer (NSIS)](#13-building-the-installer-nsis)
14. [Environment Variables & Data Paths](#14-environment-variables--data-paths)
15. [Troubleshooting](#15-troubleshooting)
16. [Security Checklist](#16-security-checklist)

---

## 1. What You Are Deploying

LedgerMitra is a Windows desktop accounting application.

- **Stack:** Electron 30 + React 18 + TypeScript
- **Database:** Local SQLite (`better-sqlite3`), WAL mode
- **Data residency:** All data stays on the customer's machine — no cloud, no server
- **License model:** Free core + premium add-ons activated via offline license keys

The app supports:

- Multi-company books
- Multi-financial-year accounting
- Sales invoices, purchase invoices, receipts, payments
- Customer / supplier / product masters
- Double-entry ledger with running balance
- GST auto-calculation (CGST/SGST/IGST)
- Print & PDF
- WhatsApp Web document sharing
- Legacy Speed Plus `.mdb`/`.bmw` import
- One-click backup/restore

---

## 2. System Requirements

| Requirement | Minimum |
|-------------|---------|
| OS | Windows 10 or later (64-bit) |
| CPU | x64 processor |
| RAM | 4 GB |
| Disk | 2 GB free |
| Node.js (for dev/source run) | v18+ |
| npm | v9+ |
| Git | latest |
| Browser (for WhatsApp) | Google Chrome or Chromium installed |

> Chocolatey / winget are not required. The provided `setup.bat` downloads Node.js and Git if missing.

---

## 3. Installation

### Method A — Automatic Setup (Recommended for New Users)

1. Clone or extract the project into a folder, e.g. `C:\LedgerMitra`.
2. Double-click `setup.bat`.
3. The script will:
   - Check Windows version
   - Check for Node.js and Git
   - Download and install missing dependencies (may require Administrator approval)
   - Run `install.bat` to fetch npm packages and rebuild native modules
4. When complete, run `start.bat` to launch the app in development mode.

```bat
cd C:\LedgerMitra
setup.bat
```

### Method B — Manual Setup

Use this when you already have Node.js and Git installed.

```bat
git clone https://github.com/akashnikhra/LedgerMitra.git
cd LedgerMitra
npm install --legacy-peer-deps
npm run rebuild:native
npm run dev
```

### Method C — Packaged Installer (For End Customers)

Build the NSIS installer once, then give the customer the `.exe` in `release/`:

```bat
npm run build
npm run package:win
```

Output: `release/LedgerMitra Setup 1.2.4.exe` (version depends on `package.json`).

The customer installs this like any normal Windows app. Data will go to `%APPDATA%/ledgermitra/`.

---

## 4. First Run / Initial Login

Launch the app via:

- `start.bat` (source/dev mode), or
- the installed shortcut (packaged mode)

### Default Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |

> Change the admin password immediately after first login via the Settings screen.

---

## 5. Create Company & Financial Year

After login the app walks through a 3-step wizard:

1. **Select / Create Company**
   - Company name, address, phone, email, GSTIN, PAN, state
2. **Select / Create Financial Year**
   - Default: April–March
   - Name example: `2024-25`
3. **Main Dashboard**
   - You are now in the accounting workspace

> A company can have many financial years. Opening balances and outstanding amounts are carried forward automatically between years via the `fy_carry_forwards` mechanism.

---

## 6. License Activation

### Free vs Premium

| Plan | Included |
|------|----------|
| Free | Invoicing, Ledger, Products, Customers, Receipts, Purchase Invoices, Dashboard, Financial Years |
| Premium | WhatsApp Integration, Legacy Import, Multi-Company, Backup & Restore, Print & PDF |

### Activating on the Client Machine

1. Obtain a license key (see Section 7).
2. In LedgerMitra, go to **Settings > License > Activate**.
3. Paste the key and click **Activate**.
4. Restart the app if premium features do not unlock immediately.

### Trial Mode

All premium features are unlocked for **30 days** from first run. After the trial, only a valid license key enables premium features.

---

## 7. Generating License Keys

License keys are generated **by the developer only** using the script at `scripts/license-gen.ts`. It uses RSA-2048 signing; the private key stays on your machine, the public key is embedded in the app.

### Prerequisites for Key Generation

- Node.js installed
- Project dependencies installed (`npm install`)
- `tsx` or run via `npx tsx`

### First-Time Key Pair Generation

The first time you run the generator it creates the RSA key pair automatically:

```bat
npx tsx scripts/license-gen.ts
```

Keys are stored in:

```
scripts/keys/private.pem    ← NEVER share this
scripts/keys/public.pem     ← embedded in the app
```

### Generate a New License Key

```bat
npx tsx scripts/license-gen.ts
```

Interactive prompts:

1. Customer name
2. License type — `1` Perpetual or `2` Subscription
3. (Subscription only) Expiry date `YYYY-MM-DD`
4. Features — enter comma-separated numbers or `a` for all
5. Max activations — default is `3`

The output looks like:

```
LM-eyJpZCI6IjEyM2FiYz...<very long string>...
```

Copy the full `LM-...` string and send it to the customer.

### Common License Commands

```bat
# Verify a customer-provided key
npx tsx scripts/license-gen.ts --verify "LM-..."

# Regenerate a lost key (requires old key or partial key)
npx tsx scripts/license-gen.ts --regenerate

# List all generated/activated licenses
npx tsx scripts/license-gen.ts --list

# Search licenses by name or key fragment
npx tsx scripts/license-gen.ts --search "Acme Corp"

# Export license records to CSV
npx tsx scripts/license-gen.ts --export
```

Exported CSV is saved to `scripts/keys/licenses-export.csv`. Back this up monthly.

### Premium Feature IDs

| ID | Feature |
|----|---------|
| `whatsapp` | WhatsApp Integration |
| `legacy_import` | Legacy Speed Plus Import |
| `multi_company` | Multi-Company |
| `backup` | Backup & Restore |
| `print_pdf` | Print & PDF |

---

## 8. Everyday Setup: Customers, Products & Invoices

### Masters

1. **Customers** — add before invoicing (opening balance optional)
2. **Suppliers** — add before purchase invoices
3. **Products** — SKU, selling rate, GST rate, HSN, opening stock

### Sales Invoice Flow

1. Open **Invoices > New Invoice**.
2. Select customer.
3. Add line items. GST is auto-calculated based on product GST rate and customer state vs company state.
4. Save. The ledger is updated automatically (debit customer, credit sales).

### Receipt Flow

1. Open **Receipts > New Receipt**.
2. Select customer and amount.
3. Choose auto-allocate (oldest invoice first) or manual allocation.
4. Save. The invoice outstanding is reduced and a ledger credit entry is created.

---

## 9. WhatsApp Integration

WhatsApp requires a one-time QR-code scan using the customer's own phone.

### Requirements

- Premium license with `whatsapp` feature
- Google Chrome or Chromium installed on the PC
- Internet connection
- WhatsApp on a mobile phone

### Steps

1. Go to **Settings > WhatsApp**.
2. Click **Connect WhatsApp**.
3. A QR code appears.
4. On the phone, open WhatsApp → Settings → Linked Devices → Link a Device → Scan QR code.
5. Status changes to `Connected as <name>`.
6. From any invoice/receipt, click **Send WhatsApp** to share the PDF.

> The session is persisted in `%APPDATA%/ledgermitra/whatsapp-session/`. If linking fails repeatedly, clear that folder and reconnect.

---

## 10. Legacy Speed Plus Import

Use this to migrate existing data from Speed Plus accounting software.

### Requirements

- Premium license with `legacy_import` feature
- Access to the Speed Plus `Upload\Data` folder containing `.mdb` or `.bmw` files
- Default MDB password: `allthebest` (already embedded in the app)

### Setting the Legacy Data Path

Option 1 — Environment variable:

```bat
set LEDGERMITRA_LEGACY_DATA=F:\path\to\Upload\Data
```

Option 2 — Browse inside the app via Legacy Import screen.

### Import Steps

1. Go to **Legacy Import** from the sidebar.
2. Enter/browse the `Upload\Data` folder and click **Set path**.
3. Select the `spd.mdb` or `spd.bmw` file.
4. Click **Analyze** to review tables, row counts, date range, and detected financial years.
5. Select the company and financial year to import into.
6. Click **Import**.
7. Review the import log for skipped records and fix any data issues.

### What Gets Imported

| Speed Plus Table | LedgerMitra Table |
|------------------|-------------------|
| `Items` | `products` |
| `Account` | `customers` |
| `BillMaster` | `invoices` |
| `Ledger` | `ledger_entries` |
| `Company` | `company` (used during wizard) |

---

## 11. Backup & Restore

### Manual Backup

The entire database is a single file. Locate it and copy it:

| Mode | Default Database Path |
|------|-----------------------|
| Dev / source | `<project>\data\ledgermitra.db` |
| Installed app | `%APPDATA%\ledgermitra\ledgermitra.db` |
| Portable | `<USB>\LedgerMitra\data\ledgermitra.db` |

### In-App Backup (Premium)

1. Go to **Settings > Backup / Restore > Export Backup**.
2. Choose destination folder.
3. The app copies the database and creates a timestamped backup.

### In-App Restore (Premium)

1. Go to **Settings > Backup / Restore > Import Backup**.
2. Select a previously exported backup file.
3. The app validates and restores the database.
4. Restart the app.

> Always back up before major imports or financial-year changes.

---

## 12. Portable USB Deployment

LedgerMitra can run directly from a USB drive so no data touches the host PC.

### Build Portable Version

```bat
npm run build
npm run package:portable
```

Output: `release/win-unpacked/`

### Prepare the USB Drive

1. Copy the entire `win-unpacked` folder to a USB drive.
2. Rename the folder to `LedgerMitra-Portable` (recommended).
3. From inside that folder, run `portable.bat`.

### USB Folder Structure

```
USB Drive/
└── LedgerMitra-Portable/
    ├── LedgerMitra.exe
    ├── resources/
    │   ├── app.asar
    │   └── app.asar.unpacked/
    └── LedgerMitra/          ← all data lives here
        ├── data/             ← database (ledgermitra.db)
        ├── whatsapp-session/ ← WhatsApp auth
        ├── Upload/Merged/    ← merge output
        └── temp/             ← cleaned on exit
```

### Behavior in Portable Mode

- Database is created on the USB
- WhatsApp session is stored on the USB
- Temp files are removed when the app exits
- No files are written to host `%APPDATA%` or `%TEMP%`

---

## 13. Building the Installer (NSIS)

Use this to produce a single Windows installer for distribution.

### Requirements

- Node.js + dependencies installed
- Windows Developer Mode **OR** terminal running as Administrator (electron-builder needs to extract signing tools)

### Steps

```bat
npm run build
npm run package:win
```

### Outputs

| File | Location |
|------|----------|
| Installer | `release/LedgerMitra Setup <version>.exe` |
| Unpacked app | `release/win-unpacked/` |

Give the installer file to the customer. The installer handles shortcuts, registry entries, and uninstallation.

---

## 14. Environment Variables & Data Paths

| Variable | Purpose | Default |
|----------|---------|---------|
| `LEDGERMITRA_DATA_DIR` | Where `ledgermitra.db` is stored | `<project>\data\` or `%APPDATA%\ledgermitra\` |
| `LEDGERMITRA_LEGACY_DATA` | Path to Speed Plus `Upload\Data` | `F:\FinBook-Pro\Upload\Data` (in `start.bat`) |
| `LEDGERMITRA_PORTABLE` | Enables portable USB mode | unset |

---

## 15. Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| App won't start after install | Run `npm run rebuild:native` to rebuild `better-sqlite3` and `mdb-reader` for Electron |
| `better-sqlite3` error | Native module mismatch. Delete `node_modules` and run `install.bat` or `npm install --legacy-peer-deps` then `npm run rebuild:native` |
| WhatsApp QR not appearing | Ensure Chrome/Chromium is installed. Clear `%APPDATA%/ledgermitra/whatsapp-session/` and retry |
| WhatsApp send fails | Check internet. Verify the phone number is registered on WhatsApp |
| Legacy import fails | Confirm the file path and that the file is not open in Speed Plus |
| License says invalid | Verify the key starts with `LM-`. Re-run `--verify` to check expiry/activation count |
| Trial expired | Generate a premium key and activate in Settings > License |
| Missing premium menu items | License not activated or wrong feature set. Use `--list` to inspect |

---

## 16. Security Checklist

- [ ] Change default `admin` password immediately
- [ ] Keep `scripts/keys/private.pem` secure and never share it
- [ ] Back up `scripts/keys/licenses.json` and `licenses-export.csv` regularly
- [ ] Store customer database backups in a separate secure location
- [ ] For portable mode, encrypt the USB or store it safely
- [ ] Do not commit `private.pem` or customer database files to Git

---

## Quick Reference Card

```bat
# Start dev mode
start.bat

# Build & package
npm run build
npm run package:win

# Generate license
npx tsx scripts/license-gen.ts

# Verify license
npx tsx scripts/license-gen.ts --verify "LM-..."

# Backup
Copy-Item "$env:APPDATA\ledgermitra\ledgermitra.db" "\\backup-server\\ledgermitra-backup.db"
```

---

*Document version: LedgerMitra 1.2.4*
