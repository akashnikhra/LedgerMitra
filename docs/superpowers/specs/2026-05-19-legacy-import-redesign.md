# Legacy Import Page Redesign Spec

## Overview
Redesign the Legacy Import Wizard to improve the Financial Year (FY) selection UX and add view/update capabilities for imported data lists.

## Changes

### 1. FY Selector Tabs
**Location:** `LegacyImportWizard.tsx`, Step 3 (Company & FY)

**Current:** Three native radio buttons with nested indentation for conditional fields.
**New:** Horizontal tab bar using `button-tab` / `button-tab-active` styles.

**Structure:**
```tsx
<div className="fy-selector">
  <div className="fy-tabs">
    <button className={`fy-tab ${fyMode === 'detected' ? 'active' : ''}`} onClick={() => setFyMode('detected')}>Detected FY</button>
    <button className={`fy-tab ${fyMode === 'existing' ? 'active' : ''}`} onClick={() => setFyMode('existing')}>Existing FY</button>
    <button className={`fy-tab ${fyMode === 'custom' ? 'active' : ''}`} onClick={() => setFyMode('custom')}>Custom FY</button>
  </div>
  <div className="fy-content">
    {/* Conditional fields based on fyMode */}
  </div>
</div>
```

**Styles:**
- `.fy-tabs`: Flex container with `gap: var(--spacing-sm)`, `border-bottom: 1px solid var(--hairline)`, `margin-bottom: var(--spacing-lg)`.
- `.fy-tab`: `background: transparent`, `border: none`, `padding: var(--spacing-sm) var(--spacing-md)`, `color: var(--muted)`, `cursor: pointer`, `font-family: var(--font-mono)`.
- `.fy-tab.active`: `color: var(--ink)`, `border-bottom: 2px solid var(--ink)`, `margin-bottom: -1px`.
- `.fy-content`: Padding `var(--spacing-lg)`, background `var(--surface-soft)`, border `1px solid var(--hairline)`, radius `var(--radius-sm)`.

### 2. View/Update Popups
**Location:** `LegacyImportWizard.tsx`, Step 2 (Analysis Results)

**Current:** Static table showing row counts for Products, Customers, Invoices, Ledger.
**New:** "View" button next to each data type that opens a modal with a data table.

**Component:** `DataTableModal`
- Props: `isOpen`, `onClose`, `title`, `data`, `columns`, `onUpdate`
- Structure:
  - Header: Title + Close button
  - Body: Table with columns specific to data type
  - Footer: "Save Changes" / "Cancel" buttons
- Edit flow: Click "Edit" on a row → fields become inputs → "Save" updates local state.

**Data Types & Columns:**
- **Products:** Name, Code, Price, Stock
- **Customers:** Name, Email, Phone, Balance
- **Invoices:** Number, Date, Customer, Amount, Status
- **Ledger:** Date, Account, Debit, Credit, Description

**Styles:**
- Modal uses existing `.modal` styles.
- Table uses existing `.table` styles.
- Edit inputs use existing `.form-group` styles.

### 3. Data Flow
- Analysis step stores raw data in state: `analysis.dataSummary` becomes `analysis.data` (array of objects).
- View button opens modal with `analysis.data[type]`.
- Edit updates `analysis.data[type]` in local state.
- Import step uses the updated `analysis.data` for the actual import.

## Files to Modify
- `src/renderer/components/LegacyImportWizard.tsx`
- `src/renderer/styles/global.css`
- `src/renderer/components/DataTableModal.tsx` (new)

## Success Criteria
- FY selector uses tabs instead of radios.
- Conditional fields appear in a card below tabs, not indented.
- View buttons open modals with data tables.
- Edit flow works for all four data types.
- No native radio buttons remain in the wizard.
- All styles match DESIGN.md tokens.
