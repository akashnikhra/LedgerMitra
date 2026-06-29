import { useEffect, useState } from 'react';
import type { Product } from '@shared/types';
import ProductModal from './ProductModal';
import SearchInput from './SearchInput';

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

      if (res && typeof res === 'object' && 'success' in res && !res.success) {
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
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search by name, SKU, or category…"
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
