# Product CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full create, view, edit, and delete capability for products via a dedicated panel matching the existing Customers/Suppliers pattern.

**Architecture:** Backend CRUD functions in `product.ts` → IPC channels in `constants.ts` + `ipc-handlers.ts` → preload bridge in `preload.ts` → React components `ProductsPanel.tsx` + `ProductModal.tsx` → Dashboard integration.

**Tech Stack:** Electron, TypeScript, React, SQLite (better-sqlite3), IPC

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/main/product.ts` | Modify | Add `getProductById`, `updateProduct`, `deleteProduct` |
| `src/shared/constants.ts` | Modify | Add `product:get`, `product:update`, `product:delete` channels |
| `src/main/ipc-handlers.ts` | Modify | Register new IPC handlers |
| `src/main/preload.ts` | Modify | Add `getProduct`, `updateProduct`, `deleteProduct` to electronAPI |
| `src/renderer/components/ProductsPanel.tsx` | Create | Product list panel with search, create, view |
| `src/renderer/components/ProductModal.tsx` | Create | Modal for create/edit/view/delete |
| `src/renderer/components/Dashboard.tsx` | Modify | Replace inline product table with ProductsPanel |

---

### Task 1: Backend — Add getProductById, updateProduct, deleteProduct

**Files:**
- Modify: `src/main/product.ts`

- [ ] **Step 1: Add getProductById function**

Add after `getProductBySku` (line 15):

```typescript
export function getProductById(id: number, companyId?: number): Product | undefined {
  const cid = companyId ?? getActiveCompanyId();
  if (!cid) return undefined;
  return queryOne<Product>('SELECT * FROM products WHERE id = ? AND company_id = ?', [id, cid]);
}
```

- [ ] **Step 2: Add updateProduct function**

Add after `createProduct`:

```typescript
export function updateProduct(
  id: number,
  data: Partial<Product>,
  companyIdOverride?: number
): { success: boolean; error?: string } {
  const companyId = companyIdOverride ?? getActiveCompanyId();
  if (!companyId) return { success: false, error: 'No active company' };

  const existing = getProductById(id, companyId);
  if (!existing) return { success: false, error: 'Product not found' };

  try {
    executeWrite(
      `UPDATE products SET
        sku = ?, name = ?, category = ?, purchase_rate = ?, selling_rate = ?,
        gst_rate = ?, hsn_code = ?, unit = ?, stock_qty = ?, opening_stock = ?,
        reorder_level = ?
      WHERE id = ? AND company_id = ?`,
      [
        data.sku ?? existing.sku,
        data.name ?? existing.name,
        data.category ?? existing.category,
        data.purchase_rate ?? existing.purchase_rate,
        data.selling_rate ?? existing.selling_rate,
        data.gst_rate ?? existing.gst_rate,
        data.hsn_code ?? existing.hsn_code,
        data.unit ?? existing.unit,
        data.stock_qty ?? existing.stock_qty,
        data.opening_stock ?? existing.opening_stock,
        data.reorder_level ?? existing.reorder_level,
        id,
        companyId
      ]
    );
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 3: Add deleteProduct function**

Add after `updateProduct`:

```typescript
export function deleteProduct(
  id: number,
  companyIdOverride?: number
): { success: boolean; error?: string } {
  const companyId = companyIdOverride ?? getActiveCompanyId();
  if (!companyId) return { success: false, error: 'No active company' };

  const existing = getProductById(id, companyId);
  if (!existing) return { success: false, error: 'Product not found' };

  try {
    executeWrite('DELETE FROM products WHERE id = ? AND company_id = ?', [id, companyId]);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
```

- [ ] **Step 4: Build to verify no TypeScript errors**

Run: `npm run build`
Expected: Build succeeds with no errors

---

### Task 2: IPC Constants — Add product channels

**Files:**
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Add product channels**

Add after `'product:create': 'product:create'` (line 27):

```typescript
  'product:get': 'product:get',
  'product:update': 'product:update',
  'product:delete': 'product:delete',
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 3: IPC Handlers — Register new product handlers

**Files:**
- Modify: `src/main/ipc-handlers.ts`

- [ ] **Step 1: Update import to include new functions**

Change line 14 from:
```typescript
import { getAllProducts, createProduct } from './product';
```
To:
```typescript
import { getAllProducts, getProductById, createProduct, updateProduct, deleteProduct } from './product';
```

- [ ] **Step 2: Add IPC handlers**

Add after line 80 (`ipcMain.handle(IPC_CHANNELS['product:create'], ...)`):

```typescript
  ipcMain.handle(IPC_CHANNELS['product:get'], (_, id: number) => getProductById(id));
  ipcMain.handle(IPC_CHANNELS['product:update'], (_, { id, data }) => updateProduct(id, data));
  ipcMain.handle(IPC_CHANNELS['product:delete'], (_, id: number) => deleteProduct(id));
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 4: Preload — Add electronAPI methods

**Files:**
- Modify: `src/main/preload.ts`

- [ ] **Step 1: Add product methods**

Add after line 41 (`getProducts: () => ...`):

```typescript
  getProduct: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['product:get'], id),
  updateProduct: (id: number, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS['product:update'], { id, data }),
  deleteProduct: (id: number) => ipcRenderer.invoke(IPC_CHANNELS['product:delete'], id),
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 5: Frontend — Create ProductModal component

**Files:**
- Create: `src/renderer/components/ProductModal.tsx`

- [ ] **Step 1: Create ProductModal.tsx**

Use `CustomerModal.tsx` as the structural template. Full content:

```tsx
import { useEffect, useState } from 'react';
import type { Product } from '@shared/types';

type FormMode = 'create' | 'edit' | 'view';

interface ProductModalProps {
  mode: FormMode;
  product: Product | null;
  onClose: () => void;
  onSave: (data: {
    sku: string;
    name: string;
    category?: string;
    purchase_rate?: number;
    selling_rate: number;
    gst_rate?: number;
    hsn_code?: string;
    unit?: string;
    stock_qty: number;
    opening_stock: number;
    reorder_level?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  onDelete: (id: number) => Promise<{ success: boolean; error?: string }>;
  onEdit?: () => void;
}

const emptyForm = {
  sku: '',
  name: '',
  category: '',
  purchase_rate: '',
  selling_rate: '',
  gst_rate: '',
  hsn_code: '',
  unit: 'Nos',
  stock_qty: '0',
  opening_stock: '0',
  reorder_level: ''
};

export default function ProductModal({
  mode,
  product,
  onClose,
  onSave,
  onDelete,
  onEdit
}: ProductModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (mode === 'create') {
      setForm(emptyForm);
    } else if (product) {
      setForm({
        sku: product.sku,
        name: product.name,
        category: product.category || '',
        purchase_rate: product.purchase_rate != null ? String(product.purchase_rate) : '',
        selling_rate: String(product.selling_rate),
        gst_rate: product.gst_rate != null ? String(product.gst_rate) : '',
        hsn_code: product.hsn_code || '',
        unit: product.unit || 'Nos',
        stock_qty: String(product.stock_qty),
        opening_stock: String(product.opening_stock),
        reorder_level: product.reorder_level != null ? String(product.reorder_level) : ''
      });
      setError('');
    }
  }, [mode, product]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.sku.trim()) {
      setError('SKU is required');
      return;
    }
    if (!form.name.trim()) {
      setError('Product name is required');
      return;
    }

    const payload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      category: form.category.trim() || undefined,
      purchase_rate: form.purchase_rate ? parseFloat(form.purchase_rate) : undefined,
      selling_rate: parseFloat(form.selling_rate) || 0,
      gst_rate: form.gst_rate ? parseFloat(form.gst_rate) : undefined,
      hsn_code: form.hsn_code.trim() || undefined,
      unit: form.unit.trim() || 'Nos',
      stock_qty: parseFloat(form.stock_qty) || 0,
      opening_stock: parseFloat(form.opening_stock) || 0,
      reorder_level: form.reorder_level ? parseFloat(form.reorder_level) : undefined
    };

    setSaving(true);
    const res = await onSave(payload);
    setSaving(false);

    if (!res.success) {
      setError(res.error || 'Could not save product');
      return;
    }

    onClose();
  }

  async function handleDelete() {
    if (!product || !confirm('Delete this product? This cannot be undone.')) return;
    const res = await onDelete(product.id);
    if (!res.success) {
      setError(res.error || 'Could not delete product');
      return;
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            {mode === 'create' ? 'New Product' : mode === 'edit' ? 'Edit Product' : 'View Product'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="modal-form-row">
              <div className="form-group">
                <label>SKU *</label>
                <input
                  value={form.sku}
                  onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  required
                  disabled={mode === 'view'}
                />
              </div>
              <div className="form-group">
                <label>Unit</label>
                <input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  disabled={mode === 'view'}
                  placeholder="Nos, Kg, Ltr..."
                />
              </div>
            </div>

            <div className="form-group">
              <label>Name *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                disabled={mode === 'view'}
              />
            </div>

            <div className="modal-form-row">
              <div className="form-group">
                <label>Category</label>
                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
              <div className="form-group">
                <label>HSN Code</label>
                <input
                  value={form.hsn_code}
                  onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
            </div>

            <div className="modal-form-row">
              <div className="form-group">
                <label>Purchase Rate (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.purchase_rate}
                  onChange={(e) => setForm({ ...form, purchase_rate: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
              <div className="form-group">
                <label>Selling Rate (₹) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.selling_rate}
                  onChange={(e) => setForm({ ...form, selling_rate: e.target.value })}
                  required
                  disabled={mode === 'view'}
                />
              </div>
            </div>

            <div className="form-group">
              <label>GST Rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={form.gst_rate}
                onChange={(e) => setForm({ ...form, gst_rate: e.target.value })}
                disabled={mode === 'view'}
                placeholder="e.g. 18"
              />
            </div>

            <div className="modal-form-row">
              <div className="form-group">
                <label>Stock Qty</label>
                <input
                  type="number"
                  step="1"
                  value={form.stock_qty}
                  onChange={(e) => setForm({ ...form, stock_qty: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
              <div className="form-group">
                <label>Opening Stock</label>
                <input
                  type="number"
                  step="1"
                  value={form.opening_stock}
                  onChange={(e) => setForm({ ...form, opening_stock: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Reorder Level</label>
              <input
                type="number"
                step="1"
                value={form.reorder_level}
                onChange={(e) => setForm({ ...form, reorder_level: e.target.value })}
                disabled={mode === 'view'}
              />
            </div>
          </form>
        </div>

        <div className="modal-footer">
          {mode === 'view' ? (
            <>
              <button type="button" className="btn btn-danger" onClick={handleDelete}>
                Delete
              </button>
              <div className="footer-spacer" />
              <button type="button" className="btn btn-secondary" onClick={onEdit}>
                Edit
              </button>
              <button type="button" className="btn" onClick={onClose}>
                Close
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn" disabled={saving} onClick={(e) => handleSubmit(e as any)}>
                {saving ? 'Saving…' : mode === 'create' ? 'Create Product' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 6: Frontend — Create ProductsPanel component

**Files:**
- Create: `src/renderer/components/ProductsPanel.tsx`

- [ ] **Step 1: Create ProductsPanel.tsx**

Use `CustomersPanel.tsx` as the structural template. Full content:

```tsx
import { useEffect, useState } from 'react';
import type { Product } from '@shared/types';
import ProductModal from './ProductModal';

interface Props {
  onChanged?: () => void;
}

export default function ProductsPanel({ onChanged }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<'create' | 'edit' | 'view' | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setProducts(await window.electronAPI.getProducts());
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = products.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    );
  });

  async function openCreate() {
    setSelectedId(null);
    setMode('create');
    setError('');
  }

  async function openView(product: Product) {
    setSelectedId(product.id);
    setMode('view');
    setError('');
  }

  function closeModal() {
    setMode(null);
    setSelectedId(null);
    setError('');
  }

  async function handleSave(data: {
    sku: string;
    name: string;
    category?: string;
    purchase_rate?: number;
    selling_rate: number;
    gst_rate?: number;
    hsn_code?: string;
    unit?: string;
    stock_qty: number;
    opening_stock: number;
    reorder_level?: number;
  }) {
    try {
      const res =
        mode === 'create'
          ? await window.electronAPI.createProduct(data)
          : await window.electronAPI.updateProduct(selectedId!, data);

      if (!res.success) {
        return { success: false, error: res.error || 'Could not save product' };
      }

      await load();
      onChanged?.();
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await window.electronAPI.deleteProduct(id);
      if (!res.success) {
        return { success: false, error: res.error || 'Could not delete product' };
      }
      await load();
      onChanged?.();
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  const selectedProduct = products.find((p) => p.id === selectedId);

  return (
    <div className="invoices-panel">
      <div className="invoices-toolbar">
        <h2>Products ({products.length})</h2>
        <button type="button" className="btn" onClick={openCreate}>
          + New product
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-group search-group">
        <input
          placeholder="Search by name, SKU, or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card invoices-table-card">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th>Rate</th>
              <th>Stock</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">
                  No products yet. Click <strong>New product</strong> to add one.
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr
                  key={p.id}
                  className={selectedId === p.id && mode !== null ? 'selected' : ''}
                  onClick={() => openView(p)}
                >
                  <td>{p.sku}</td>
                  <td>{p.name}</td>
                  <td>{p.category || '—'}</td>
                  <td>₹{p.selling_rate}</td>
                  <td>{p.stock_qty}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {mode && selectedProduct && (
        <ProductModal
          mode={mode}
          product={selectedProduct}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onEdit={() => setMode('edit')}
        />
      )}

      {mode === 'create' && (
        <ProductModal
          mode="create"
          product={null}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 7: Dashboard — Replace inline product table with ProductsPanel

**Files:**
- Modify: `src/renderer/components/Dashboard.tsx`

- [ ] **Step 1: Add ProductsPanel import**

Add to imports (after line 9):
```typescript
import ProductsPanel from './ProductsPanel';
```

- [ ] **Step 2: Replace inline product table**

Replace lines 142-168 (the `{tab === 'products' && ...}` block) with:
```tsx
        {tab === 'products' && <ProductsPanel onChanged={refresh} />}
```

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: Build succeeds

---

### Task 8: Final verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: All three bundles (main, preload, renderer) build with zero errors

- [ ] **Step 2: Manual smoke test checklist**

1. Launch app → navigate to Products tab → verify empty state message shows
2. Click "+ New product" → fill all fields → save → verify product appears in list
3. Click product row → verify view modal opens with correct data
4. Click "Edit" → modify fields → save → verify changes reflected in list
5. Click product row → click "Delete" → confirm → verify product removed from list
6. Type in search box → verify filtering by name/SKU/category works
