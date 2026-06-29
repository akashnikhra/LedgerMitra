import { useEffect, useState, useRef } from 'react';
import type { Customer } from '@shared/types';

type FormMode = 'create' | 'edit' | 'view';

interface CustomerModalProps {
  mode: FormMode;
  customer: Customer | null;
  onClose: () => void;
  onSave: (data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    state?: string;
    gstin?: string;
    opening_balance: number;
    opening_balance_type?: string;
    notes?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onDelete: (id: number) => Promise<{ success: boolean; error?: string }>;
  onEdit?: () => void;
}

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  state: '',
  gstin: '',
  opening_balance: '0',
  opening_balance_type: 'Dr',
  notes: ''
};

export default function CustomerModal({
  mode,
  customer,
  onClose,
  onSave,
  onDelete,
  onEdit
}: CustomerModalProps) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-focus first field on mount
  useEffect(() => {
    if (mode === 'create' || mode === 'edit') {
      setTimeout(() => modalRef.current?.querySelector<HTMLInputElement>('input:not([disabled]):not([type="date"])')?.focus(), 0);
    } else if (mode === 'view') {
      setTimeout(() => modalRef.current?.querySelector<HTMLButtonElement>('.btn')?.focus(), 0);
    }
  }, [mode]);

  // Global keyboard: Escape to close, Ctrl+S to save, focus trap
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (mode === 'view') onEdit?.();
        else document.getElementById('customer-form')?.requestSubmit();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const els = modalRef.current.querySelectorAll<HTMLElement>('input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, onEdit, mode]);

  useEffect(() => {
    if (mode === 'create') {
      setForm(emptyForm);
    } else if (customer) {
      setForm({
        name: customer.name,
        phone: customer.phone || '',
        email: customer.email || '',
        address: customer.address || '',
        state: customer.state || '',
        gstin: customer.gstin || '',
        opening_balance: String(customer.opening_balance),
        opening_balance_type: customer.opening_balance_type || 'Dr',
        notes: customer.notes || ''
      });
      setError('');
    }
  }, [mode, customer]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Customer name is required');
      return;
    }

    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      address: form.address.trim() || undefined,
      state: form.state.trim() || undefined,
      gstin: form.gstin.trim() || undefined,
      opening_balance: parseFloat(form.opening_balance) || 0,
      opening_balance_type: form.opening_balance_type,
      notes: form.notes.trim() || undefined
    };

    setSaving(true);
    const res = await onSave(payload);
    setSaving(false);

    if (!res.success) {
      setError(res.error || 'Could not save customer');
      return;
    }

    onClose();
  }

  async function handleDelete() {
    if (!customer || !confirm('Delete this customer? This cannot be undone.')) return;
    const res = await onDelete(customer.id);
    if (!res.success) {
      setError(res.error || 'Could not delete customer');
      return;
    }
    onClose();
  }

  const balanceLabel = form.opening_balance_type === 'Dr' ? 'They owe you (Receivable)' : 'You owe them (Advance)';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" ref={modalRef} onClick={(e) => e.stopPropagation()} tabIndex={-1}>
        <div className="modal-header">
          <h2>
            {mode === 'create' ? 'New Customer' : mode === 'edit' ? 'Edit Customer' : 'View Customer'}
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

          <form id="customer-form" onSubmit={handleSubmit}>
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
                <label>Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
            </div>

            <div className="form-group">
              <label>Address</label>
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                disabled={mode === 'view'}
              />
            </div>

            <div className="modal-form-row">
              <div className="form-group">
                <label>State</label>
                <input
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
              <div className="form-group">
                <label>GSTIN</label>
                <input
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
            </div>

            <div className="modal-form-row">
              <div className="form-group">
                <label>Opening balance (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.opening_balance}
                  onChange={(e) => setForm({ ...form, opening_balance: e.target.value })}
                  disabled={mode === 'view'}
                />
              </div>
              <div className="form-group">
                <label>Balance type</label>
                <select
                  value={form.opening_balance_type}
                  onChange={(e) => setForm({ ...form, opening_balance_type: e.target.value })}
                  disabled={mode === 'view'}
                >
                  <option value="Dr">Dr — Customer owes you</option>
                  <option value="Cr">Cr — You owe customer</option>
                </select>
              </div>
            </div>
            <p className="balance-hint">{balanceLabel}</p>

            <div className="form-group">
              <label>Notes</label>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                disabled={mode === 'view'}
                placeholder="Add notes..."
              />
            </div>

            {customer && (
              <p className="invoice-outstanding">
                Current balance: <strong>₹{customer.current_balance.toLocaleString('en-IN')}</strong>
              </p>
            )}
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
                {saving ? 'Saving…' : mode === 'create' ? 'Create Customer' : 'Save Changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
