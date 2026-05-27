# Changelog

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
