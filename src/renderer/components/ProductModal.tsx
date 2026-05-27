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
