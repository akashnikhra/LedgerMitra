# Legacy Import Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace FY radio buttons with tab selector and add view/update modals for preview data in the Legacy Import Wizard.

**Architecture:** Two independent changes to `LegacyImportWizard.tsx`: (1) FY selector tabs replace native radios, (2) DataTableModal component shows preview data with inline editing. All styles use existing DESIGN.md tokens in `global.css`.

**Tech Stack:** React (TSX), CSS custom properties, Electron IPC.

---

### File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/renderer/components/LegacyImportWizard.tsx` | Modify | FY tabs, view buttons, modal state |
| `src/renderer/components/DataTableModal.tsx` | Create | Reusable modal for preview data with inline editing |
| `src/renderer/styles/global.css` | Modify | Add `.fy-tabs`, `.fy-tab`, `.fy-content`, `.fy-field-grid` styles |
| `src/shared/types.ts` | Modify | Export `MdbFullAnalysis`, `MdbImportResult` types |

---

### Task 1: Export Shared Types

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/mdb-import.ts`
- Modify: `src/renderer/components/LegacyImportWizard.tsx`

- [ ] **Step 1: Move MdbFullAnalysis and MdbImportResult to shared types**

In `src/shared/types.ts`, add after existing type definitions (around line 153):

```typescript
export interface MdbFullAnalysis {
  success: boolean;
  fileName: string;
  fileSize: number;
  tables: { name: string; rowCount: number; columns: string[]; sampleRows: any[] }[];
  companyName: string | null;
  dateRange: { min: string | null; max: string | null };
  suggestedFY: { name: string; startDate: string; endDate: string; valid: boolean; warnings: string[] };
  dataSummary: { products: number; customers: number; invoices: number; ledgerEntries: number };
  error?: string;
}

export interface MdbImportResult {
  success: boolean;
  imported: { products: number; customers: number; invoices: number; ledger: number };
  skipped: { products: number; customers: number; invoices: number; ledger: number };
  errors: { products: string[]; customers: string[]; invoices: string[]; ledger: string[] };
  error?: string;
}
```

- [ ] **Step 2: Update mdb-import.ts to import from shared types**

In `src/main/mdb-import.ts`, replace local interface definitions with:

```typescript
import type { MdbFullAnalysis, MdbImportResult } from '@shared/types';
```

Remove the local `MdbFullAnalysis` and `MdbImportResult` interface definitions (lines 175-224).

- [ ] **Step 3: Update LegacyImportWizard.tsx to use shared types**

In `src/renderer/components/LegacyImportWizard.tsx`, change the import line (line 2):

```typescript
import type { FinancialYear, MdbFileInfo, MdbFullAnalysis, MdbImportResult } from '@shared/types';
```

Remove the local `Analysis` and `ImportResult` interfaces (lines 4-18). Update all references:
- `Analysis` → `MdbFullAnalysis`
- `ImportResult` → `MdbImportResult`

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: All 3 targets (main, preload, renderer) build without errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/mdb-import.ts src/renderer/components/LegacyImportWizard.tsx
git commit -m "refactor: export MdbFullAnalysis and MdbImportResult to shared types"
```

---

### Task 2: FY Selector Tabs

**Files:**
- Modify: `src/renderer/components/LegacyImportWizard.tsx:372-456`
- Modify: `src/renderer/styles/global.css` (append new styles)

- [ ] **Step 1: Add FY tab styles to global.css**

Append to `src/renderer/styles/global.css`:

```css
.fy-tabs {
  display: flex;
  gap: var(--spacing-sm);
  border-bottom: 1px solid var(--hairline);
  margin-bottom: var(--spacing-lg);
}

.fy-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--muted);
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 14px;
  font-weight: 400;
  line-height: 2;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.fy-tab:hover {
  color: var(--ink);
}

.fy-tab.active {
  color: var(--ink);
  border-bottom-color: var(--ink);
  font-weight: 500;
}

.fy-content {
  padding: var(--spacing-lg);
  background: var(--surface-soft);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm);
}

.fy-field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: var(--spacing-md);
}

@media (max-width: 600px) {
  .fy-field-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 2: Replace radio buttons with tabs in LegacyImportWizard.tsx**

In `src/renderer/components/LegacyImportWizard.tsx`, replace lines 372-456 (the `<hr>` through the FY field grid) with:

```tsx
<div className="fy-tabs">
  <button
    type="button"
    className={`fy-tab ${fyMode === 'detected' ? 'active' : ''}`}
    onClick={() => {
      setFyMode('detected');
      applyDetectedFy(analysis);
    }}
  >
    Detected FY
  </button>
  <button
    type="button"
    className={`fy-tab ${fyMode === 'existing' ? 'active' : ''}`}
    onClick={() => setFyMode('existing')}
  >
    Existing FY
  </button>
  <button
    type="button"
    className={`fy-tab ${fyMode === 'custom' ? 'active' : ''}`}
    onClick={() => setFyMode('custom')}
  >
    Custom FY
  </button>
</div>

<div className="fy-content">
  {fyMode === 'detected' && (
    <div className="fy-field-grid">
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>FY name</label>
        <input value={fyName} readOnly style={{ background: 'var(--surface-soft)' }} />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Start</label>
        <input type="date" value={fyStart} readOnly style={{ background: 'var(--surface-soft)' }} />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>End</label>
        <input type="date" value={fyEnd} readOnly style={{ background: 'var(--surface-soft)' }} />
      </div>
    </div>
  )}

  {fyMode === 'existing' && (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label>Financial year</label>
      <select
        value={selectedFyId}
        onChange={(e) => setSelectedFyId(Number(e.target.value) || '')}
      >
        <option value="">— Select FY —</option>
        {existingFys.map((fy) => (
          <option key={fy.id} value={fy.id}>
            {fy.name} ({fy.start_date} – {fy.end_date})
          </option>
        ))}
      </select>
    </div>
  )}

  {fyMode === 'custom' && (
    <div className="fy-field-grid">
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>FY name</label>
        <input
          value={fyName}
          onChange={(e) => setFyName(e.target.value)}
          placeholder="FY25-26"
        />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Start</label>
        <input
          type="date"
          value={fyStart}
          onChange={(e) => setFyStart(e.target.value)}
        />
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>End</label>
        <input
          type="date"
          value={fyEnd}
          onChange={(e) => setFyEnd(e.target.value)}
        />
      </div>
    </div>
  )}
</div>
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: All 3 targets build without errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/global.css src/renderer/components/LegacyImportWizard.tsx
git commit -m "feat: replace FY radio buttons with tab selector"
```

---

### Task 3: DataTableModal Component

**Files:**
- Create: `src/renderer/components/DataTableModal.tsx`
- Modify: `src/renderer/styles/global.css` (append modal table styles)

- [ ] **Step 1: Add modal table styles to global.css**

Append to `src/renderer/styles/global.css`:

```css
.data-table-modal table {
  width: 100%;
  border-collapse: collapse;
}

.data-table-modal th {
  text-align: left;
  padding: var(--spacing-xs) var(--spacing-sm);
  border-bottom: 1px solid var(--hairline);
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.data-table-modal td {
  padding: var(--spacing-xs) var(--spacing-sm);
  border-bottom: 1px solid var(--hairline);
  font-size: 14px;
}

.data-table-modal tr:last-child td {
  border-bottom: none;
}

.data-table-modal .edit-input {
  width: 100%;
  padding: 2px 6px;
  font-size: 14px;
  font-family: var(--font-mono);
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm);
  background: var(--canvas);
}

.data-table-modal .edit-input:focus {
  border-color: var(--ink);
  outline: none;
}

.data-table-modal .row-actions-cell {
  white-space: nowrap;
}

.data-table-modal .btn-icon {
  background: transparent;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
}

.data-table-modal .btn-icon:hover {
  border-color: var(--ink);
  color: var(--ink);
}
```

- [ ] **Step 2: Create DataTableModal component**

Create `src/renderer/components/DataTableModal.tsx`:

```tsx
import { useState } from 'react';

interface ColumnDef {
  key: string;
  label: string;
  editable?: boolean;
}

interface DataTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  columns: ColumnDef[];
  data: Record<string, any>[];
  onUpdate: (data: Record<string, any>[]) => void;
}

export default function DataTableModal({
  isOpen,
  onClose,
  title,
  columns,
  data,
  onUpdate
}: DataTableModalProps) {
  const [localData, setLocalData] = useState(data);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});

  if (!isOpen) return null;

  function startEdit(index: number) {
    setEditingIndex(index);
    setEditValues({ ...localData[index] });
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditValues({});
  }

  function saveEdit() {
    const updated = [...localData];
    updated[editingIndex!] = { ...editValues };
    setLocalData(updated);
    onUpdate(updated);
    setEditingIndex(null);
  }

  function handleEditChange(key: string, value: any) {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <div className="modal-body data-table-modal">
          <table>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key}>{col.label}</th>
                ))}
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {localData.map((row, index) => (
                <tr key={index}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      {editingIndex === index && col.editable ? (
                        <input
                          className="edit-input"
                          value={editValues[col.key] ?? ''}
                          onChange={(e) => handleEditChange(col.key, e.target.value)}
                        />
                      ) : (
                        String(row[col.key] ?? '—')
                      )}
                    </td>
                  ))}
                  <td className="row-actions-cell">
                    {editingIndex === index ? (
                      <>
                        <button className="btn-icon" onClick={saveEdit} style={{ marginRight: 4 }}>
                          Save
                        </button>
                        <button className="btn-icon" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button className="btn-icon" onClick={() => startEdit(index)}>
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {localData.length === 0 && (
            <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 'var(--spacing-lg)' }}>
              No data available.
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: All 3 targets build without errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/styles/global.css src/renderer/components/DataTableModal.tsx
git commit -m "feat: add DataTableModal component for preview data editing"
```

---

### Task 4: Integrate View/Update Modals into Wizard

**Files:**
- Modify: `src/renderer/components/LegacyImportWizard.tsx`

- [ ] **Step 1: Add preview data state and modal state**

In `src/renderer/components/LegacyImportWizard.tsx`, add after line 42 (after `const [error, setError] = useState('');`):

```tsx
const [previewData, setPreviewData] = useState<{
  products: Record<string, any>[];
  customers: Record<string, any>[];
  invoices: Record<string, any>[];
  ledger: Record<string, any>[];
}>({ products: [], customers: [], invoices: [], ledger: [] });

const [modalType, setModalType] = useState<'products' | 'customers' | 'invoices' | 'ledger' | null>(null);
```

- [ ] **Step 2: Import DataTableModal**

Add at the top of the file (after line 2):

```tsx
import DataTableModal from './DataTableModal';
```

- [ ] **Step 3: Add column definitions**

Add after the `STEPS` constant (after line 22):

```tsx
const COLUMNS: Record<string, { key: string; label: string; editable?: boolean }[]> = {
  products: [
    { key: 'name', label: 'Name', editable: true },
    { key: 'code', label: 'Code', editable: true },
    { key: 'price', label: 'Price', editable: true },
    { key: 'stock', label: 'Stock', editable: true }
  ],
  customers: [
    { key: 'name', label: 'Name', editable: true },
    { key: 'email', label: 'Email', editable: true },
    { key: 'phone', label: 'Phone', editable: true },
    { key: 'balance', label: 'Balance', editable: true }
  ],
  invoices: [
    { key: 'number', label: 'Number', editable: true },
    { key: 'date', label: 'Date', editable: true },
    { key: 'customer', label: 'Customer', editable: true },
    { key: 'amount', label: 'Amount', editable: true },
    { key: 'status', label: 'Status', editable: true }
  ],
  ledger: [
    { key: 'date', label: 'Date', editable: true },
    { key: 'account', label: 'Account', editable: true },
    { key: 'debit', label: 'Debit', editable: true },
    { key: 'credit', label: 'Credit', editable: true },
    { key: 'description', label: 'Description', editable: true }
  ]
};
```

- [ ] **Step 4: Populate preview data after analysis**

In the `analyze()` function, after line 100 (`setAnalysis(full);`), add:

```tsx
// Populate preview data from analysis tables
const tables = (full as any).tables || [];
const productTable = tables.find((t: any) => t.name.toLowerCase().includes('product'));
const customerTable = tables.find((t: any) => t.name.toLowerCase().includes('customer'));
const invoiceTable = tables.find((t: any) => t.name.toLowerCase().includes('invoice'));
const ledgerTable = tables.find((t: any) => t.name.toLowerCase().includes('ledger'));

setPreviewData({
  products: productTable?.sampleRows?.slice(0, 50) || [],
  customers: customerTable?.sampleRows?.slice(0, 50) || [],
  invoices: invoiceTable?.sampleRows?.slice(0, 50) || [],
  ledger: ledgerTable?.sampleRows?.slice(0, 50) || []
});
```

- [ ] **Step 5: Add View buttons to analysis results table**

In Step 2 (around line 310), replace the data summary table with:

```tsx
<table style={{ marginTop: '1.25rem' }}>
  <thead>
    <tr>
      <th>Data type</th>
      <th>Rows in file</th>
      <th style={{ width: 80 }}>Preview</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>Products</td>
      <td>{analysis.dataSummary.products}</td>
      <td>
        <button
          className="btn-icon"
          style={{ fontSize: 12, padding: '2px 8px' }}
          onClick={() => setModalType('products')}
        >
          View
        </button>
      </td>
    </tr>
    <tr>
      <td>Customers</td>
      <td>{analysis.dataSummary.customers}</td>
      <td>
        <button
          className="btn-icon"
          style={{ fontSize: 12, padding: '2px 8px' }}
          onClick={() => setModalType('customers')}
        >
          View
        </button>
      </td>
    </tr>
    <tr>
      <td>Invoices</td>
      <td>{analysis.dataSummary.invoices}</td>
      <td>
        <button
          className="btn-icon"
          style={{ fontSize: 12, padding: '2px 8px' }}
          onClick={() => setModalType('invoices')}
        >
          View
        </button>
      </td>
    </tr>
    <tr>
      <td>Ledger entries</td>
      <td>{analysis.dataSummary.ledgerEntries}</td>
      <td>
        <button
          className="btn-icon"
          style={{ fontSize: 12, padding: '2px 8px' }}
          onClick={() => setModalType('ledger')}
        >
          View
        </button>
      </td>
    </tr>
  </tbody>
</table>
```

- [ ] **Step 6: Add modal render at end of component**

Before the closing `</div>` of the component (before line 525), add:

```tsx
{modalType && (
  <DataTableModal
    isOpen={!!modalType}
    onClose={() => setModalType(null)}
    title={`Preview: ${modalType.charAt(0).toUpperCase() + modalType.slice(1)}`}
    columns={COLUMNS[modalType]}
    data={previewData[modalType]}
    onUpdate={(updated) => {
      setPreviewData((prev) => ({ ...prev, [modalType]: updated }));
    }}
  />
)}
```

- [ ] **Step 7: Add btn-icon style to global.css**

Append to `src/renderer/styles/global.css`:

```css
.btn-icon {
  background: transparent;
  border: 1px solid var(--hairline);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
}

.btn-icon:hover {
  border-color: var(--ink);
  color: var(--ink);
}
```

- [ ] **Step 8: Build and verify**

Run: `npm run build`
Expected: All 3 targets build without errors.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/LegacyImportWizard.tsx src/renderer/styles/global.css
git commit -m "feat: integrate view/update modals into Legacy Import Wizard"
```

---

### Task 5: Cleanup & Polish

**Files:**
- Modify: `src/renderer/components/LegacyImportWizard.tsx`
- Modify: `src/renderer/styles/global.css`

- [ ] **Step 1: Remove old radio button styles**

In `src/renderer/styles/global.css`, search for any radio-related styles that were specific to the FY selector and remove them if they are no longer used elsewhere.

- [ ] **Step 2: Verify no native radios remain in wizard**

Search `LegacyImportWizard.tsx` for `type="radio"`. Expected: 0 matches.

- [ ] **Step 3: Verify tab accessibility**

Ensure all `.fy-tab` buttons have `type="button"` attribute (already included in Task 2).

- [ ] **Step 4: Final build**

Run: `npm run build`
Expected: All 3 targets build without errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/LegacyImportWizard.tsx src/renderer/styles/global.css
git commit -m "chore: cleanup unused radio styles from Legacy Import Wizard"
```
