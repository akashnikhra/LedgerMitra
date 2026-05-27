# Product CRUD Design

## Overview

Add full create, view, edit, and delete capability for products via a dedicated panel, matching the existing Customers/Suppliers pattern.

## Architecture

### Backend (`src/main/product.ts`)

Add three functions following the existing `customer.ts`/`supplier.ts` pattern:

- `getProductById(id, companyId?)` — single product lookup
- `updateProduct(id, data, companyId?)` — update all editable fields
- `deleteProduct(id, companyId?)` — soft or hard delete (hard delete for now, matching customer/supplier)

### IPC Layer

**Constants (`src/shared/constants.ts`)**
- Add `'product:get'`, `'product:update'`, `'product:delete'`

**IPC Handlers (`src/main/ipc-handlers.ts`)**
- Register handlers for the three new channels, importing the new functions from `product.ts`

**Preload (`src/main/preload.ts`)**
- Add `getProduct(id)`, `updateProduct(id, data)`, `deleteProduct(id)` to `electronAPI`

### Frontend

**ProductsPanel (`src/renderer/components/ProductsPanel.tsx`)**
- List all products with columns: SKU, Name, Category, Selling Rate, Stock
- Search bar filtering by SKU, name, category
- "+ New product" button opens create modal
- Click row opens view modal
- `onChanged` callback for parent refresh

**ProductModal (`src/renderer/components/ProductModal.tsx`)**
- Modes: `create`, `edit`, `view`
- All fields editable: SKU, name, category, purchase_rate, selling_rate, gst_rate, hsn_code, unit, stock_qty, opening_stock, reorder_level
- View mode: read-only display with Edit and Delete buttons
- Edit/Create mode: form with save/cancel
- Validation: SKU and name required

**Dashboard (`src/renderer/components/Dashboard.tsx`)**
- Replace inline product table (lines 142-168) with `<ProductsPanel onChanged={refresh} />`
- Import ProductsPanel component

## Data Flow

```
User clicks row → ProductsPanel sets selectedId + mode='view' → ProductModal displays
User clicks Edit → mode='edit' → form editable → Save → updateProduct IPC → refresh
User clicks New → mode='create' → empty form → Save → createProduct IPC → refresh
User clicks Delete → confirm → deleteProduct IPC → close modal → refresh
```

## Error Handling

- All IPC calls wrapped in try/catch in the panel
- Modal displays error alert on save/delete failure
- SKU uniqueness enforced at DB level (existing schema), error surfaced to user

## Testing

- Manual: create product → verify appears in list → edit → verify changes → delete → verify removed
- Search: type partial SKU/name → verify filtering works
- Validation: submit without SKU/name → verify error shown
