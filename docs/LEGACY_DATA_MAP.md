# Legacy Data Mapping (Speed Plus → LedgerMitra)

## Source files

| Path pattern | Format | Password |
|-------------|--------|----------|
| `Upload/Data/Data */spd.mdb` | Microsoft Access | `allthebest` |
| `Upload/Data/Data */spd.bmw` | Encrypted Access | `allthebest` |

## Key tables (typical `spd.mdb`)

| Table | ~Rows | Purpose |
|-------|-------|---------|
| Items | 4,000+ | Product master |
| Account | 100–500 | Customer / party ledgers |
| BillMaster | 200–600 | Sales invoices |
| Ledger | 1,000–1,600 | Payments & receipts |
| Batch | 4,000+ | Batch-wise stock (Phase 2) |
| Inventory | 1,800+ | Stock movements (Phase 2) |
| Company | 1 | Firm details |

## Field mappings

### Items → products

| Legacy column | Target column |
|--------------|---------------|
| ItemName | name |
| ItemCode / Barcode | sku |
| SalePrice / MRP | selling_rate |
| PurchasePrice | purchase_rate |
| GST% / Tax | gst_rate |
| HSNCode | hsn_code |
| UnitName | unit |
| OPStock | opening_stock, stock_qty |
| ReorderLevel | reorder_level |
| ItemGroupName | category |

### Account → customers

| Legacy column | Target column |
|--------------|---------------|
| AccountName | name |
| Address | address |
| City | address (append) |
| Phone / Mobile | phone |
| TINNo / GSTIN | gstin |
| ITPan | pan (notes) |
| OPBal / Balance | opening_balance |
| AccountID | notes (`Legacy AccountID: …`) |

### BillMaster → invoices

| Legacy column | Target column |
|--------------|---------------|
| VchNo | invoice_no |
| EntryDate | invoice_date |
| AccountName / AccountID | customer_id (via map) |
| Amount / Total | total_amount |

### Ledger → ledger_entries

| Legacy column | Target column |
|--------------|---------------|
| EntryDate | entry_date |
| AccountName / AccountID | customer_id |
| Amount | debit / credit |
| DC / TranType | entry_type |
| VoucherID | narration |

## Financial year

Indian FY: **1 April – 31 March**.  
Auto-detected from min/max dates in `BillMaster` and `Ledger`.

## Multi-company folders

Each `Data N` folder is typically one company dataset. Import each file into the matching company in LedgerMitra.
