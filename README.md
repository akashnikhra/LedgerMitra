<div align="center">
  <h1>LedgerMitra</h1>
  <p>
    <strong>Modern desktop accounting software for small businesses</strong>
  </p>
  <p>
    <a href="#features">Features</a> •
    <a href="#tech-stack">Tech Stack</a> •
    <a href="#getting-started">Getting Started</a> •
    <a href="#usage">Usage</a> •
    <a href="#migration">Speed Plus Migration</a>
  </p>
  <br/>
</div>

LedgerMitra is a greenfield desktop accounting application built with Electron, React, and TypeScript. It replaces legacy accounting software (Speed Plus) while providing a modern, intuitive interface for day-to-day bookkeeping — invoices, receipts, purchases, ledger management, and GST-ready reporting.

---

## Features

- **Dashboard** — KPI cards, sales/purchase summaries, outstanding snapshots
- **Invoicing** — Create and manage sales invoices with line items, GST, and auto-numbering
- **Purchase Invoices** — Record purchases with stock and ledger integration
- **Payment Receipts** — Receive payments with auto or manual invoice allocation
- **Ledger** — Customer-wise, year-wise, and invoice-wise ledger with debit/credit summaries
- **Customers & Suppliers** — Party master management with opening balances
- **Products** — SKU-based product catalog with rates, GST, and stock tracking
- **Financial Years** — Multi-FY support with balance carry-forward across years
- **Print & PDF** — Invoice, receipt, and ledger printing with save-to-PDF
- **WhatsApp Integration** — Send invoices and receipts directly via WhatsApp Web
- **Backup & Restore** — One-click database export and import
- **Legacy Import** — Full migration engine from Speed Plus MDB/BMW files
- **Multi-Company** — Support for multiple companies with separate books

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | [Electron 30](https://www.electronjs.org/) |
| Frontend | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Build | [electron-vite](https://electron-vite.org/) + [Vite 6](https://vitejs.dev/) |
| Database | [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (SQLite, WAL mode) |
| Auth | [bcryptjs](https://github.com/dcodeIO/bcrypt.js) (local password hashing) |
| Import Engine | [mdb-reader](https://github.com/DeltaRaz/mdb-reader) (Access .mdb/.bmw) |
| Printing | HTML → PDF via Electron's built-in print API |
| WhatsApp | [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) |
| Packaging | [electron-builder](https://www.electron.build/) (NSIS for Windows) |

## Screenshots

> *Screenshots coming soon.*

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [npm](https://www.npmjs.com/) v9 or later
- Windows (other platforms: not yet tested)

### Installation

```bat
git clone https://github.com/yourusername/LedgerMitra.git
cd LedgerMitra
install.bat
```

Or manually:

```bat
npm install --legacy-peer-deps
npm run rebuild:native
```

### Development

```bat
npm run dev
```

### Build for production

```bat
npm run build
npm run package:win
```

The packaged installer will be in the `release/` directory.

## Usage

### First Run

1. Launch the app (default login: `admin` / `admin123`)
2. Create a company profile
3. Set up a financial year (April–March by default)
4. Start creating customers, products, and invoices

### Legacy Import

If you have existing data from Speed Plus accounting software:

1. Place your `spd.mdb` or `spd.bmw` files in `Upload/Data/`
2. Open **Legacy Import** from the sidebar
3. Select the file and map it to your company
4. Data is imported with audit trail and deduplication

> See [docs/LEGACY_DATA_MAP.md](docs/LEGACY_DATA_MAP.md) for the field-level mapping reference.

## Migration

### Speed Plus → LedgerMitra

LedgerMitra provides a complete migration pipeline from Speed Plus (`.mdb` / `.bmw`) files:

| Legacy Table | New Table | Description |
|-------------|-----------|-------------|
| `Items` | `products` | SKU, rates, GST, stock |
| `Account` | `customers` | Party ledgers, opening balance |
| `BillMaster` | `invoices` | Sales vouchers |
| `Ledger` | `ledger_entries` | Payments / receipts |
| `Company` | `company` | Company name during wizard |

The import engine handles:
- Multi-FY detection within a single MDB file
- Deduplication via file hash tracking
- Balance carry-forward across financial years
- Audit logging with skipped item details

Set the legacy data path via environment variable:

```bat
set LEDGERMITRA_LEGACY_DATA=F:\path\to\Upload\Data
```

## Project Structure

```
LedgerMitra/
├── database/
│   └── schema.sql              # SQLite schema (17 tables)
├── docs/
│   └── LEGACY_DATA_MAP.md      # Field-level mapping reference
├── scripts/
│   ├── merge-legacy-data.mjs   # Merge multiple MDBs into one DB
│   └── patch-mdb-reader.mjs    # Post-install native module patch
├── src/
│   ├── main/                   # Electron main process
│   │   ├── main.ts             # App entry, window creation
│   │   ├── preload.ts          # Context bridge
│   │   ├── database.ts         # SQLite init, migrations, helpers
│   │   ├── ipc-handlers.ts     # All IPC channel handlers
│   │   ├── mdb-import.ts       # Legacy MDB import engine
│   │   ├── invoice.ts          # Sales invoice CRUD
│   │   ├── purchase-invoice.ts # Purchase invoice CRUD
│   │   ├── ledger.ts           # Ledger entry queries
│   │   ├── receipt.ts          # Receipt + allocation management
│   │   ├── customer.ts         # Customer CRUD
│   │   ├── supplier.ts         # Supplier CRUD
│   │   ├── product.ts          # Product CRUD
│   │   ├── auth.ts             # Login/logout/password
│   │   ├── session.ts          # Company/FY session
│   │   ├── company.ts          # Company CRUD
│   │   ├── financial-year.ts   # Financial year CRUD
│   │   ├── print.ts            # HTML-to-PDF printing
│   │   └── whatsapp.ts         # WhatsApp integration
│   ├── renderer/               # React UI
│   │   ├── index.html          # HTML shell
│   │   ├── main.tsx            # React entry point
│   │   ├── App.tsx             # Root with screen router
│   │   ├── context/
│   │   ├── styles/
│   │   └── components/         # 25+ React components
│   └── shared/
│       ├── types.ts            # TypeScript interfaces
│       └── constants.ts        # App config & IPC channels
├── Upload/                     # Legacy data source directory
├── electron.vite.config.ts
├── package.json
├── install.bat
└── start.bat
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LEDGERMITRA_DATA_DIR` | Database file location | `<project>/data/` |
| `LEDGERMITRA_LEGACY_DATA` | Path to Speed Plus uploads | `F:\accounting_software\Upload\Data\` |

### Default Credentials

- **Username:** `admin`
- **Password:** `admin123`

## Contributing

Contributions are welcome. Please open an issue first to discuss the change, then submit a pull request.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE` for more information.
