import { useEffect, useState } from 'react';
import type { Supplier } from '@shared/types';
import SupplierModal from './SupplierModal';

interface Props {
  onChanged?: () => void;
}

export default function SuppliersPanel({ onChanged }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<'create' | 'edit' | 'view' | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setSuppliers(await window.electronAPI.getSuppliers());
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = suppliers.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.phone || '').toLowerCase().includes(q) ||
      (s.gstin || '').toLowerCase().includes(q)
    );
  });

  async function openCreate() {
    setSelectedId(null);
    setMode('create');
    setError('');
  }

  async function openView(supplier: Supplier) {
    setSelectedId(supplier.id);
    setMode('view');
    setError('');
  }

  function closeModal() {
    setMode(null);
    setSelectedId(null);
    setError('');
  }

  async function handleSave(data: {
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    state?: string;
    gstin?: string;
    opening_balance: number;
    opening_balance_type?: string;
    notes?: string;
  }) {
    try {
      const res =
        mode === 'create'
          ? await window.electronAPI.createSupplier(data)
          : await window.electronAPI.updateSupplier(selectedId!, data);

      if (!res.success) {
        return { success: false, error: res.error || 'Could not save supplier' };
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
      const res = await window.electronAPI.deleteSupplier(id);
      if (!res.success) {
        return { success: false, error: res.error || 'Could not delete supplier' };
      }
      await load();
      onChanged?.();
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  const selectedSupplier = suppliers.find((s) => s.id === selectedId);

  return (
    <div className="invoices-panel">
      <div className="invoices-toolbar">
        <h2>Suppliers ({suppliers.length})</h2>
        <button type="button" className="btn" onClick={openCreate}>
          + New supplier
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-group search-group">
        <input
          placeholder="Search by name, phone, or GSTIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card invoices-table-card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>GSTIN</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No suppliers yet. Click <strong>New supplier</strong> to add one.
                </td>
              </tr>
            ) : (
              filtered.map((s) => (
                <tr
                  key={s.id}
                  className={selectedId === s.id && mode !== null ? 'selected' : ''}
                  onClick={() => openView(s)}
                >
                  <td>{s.name}</td>
                  <td>{s.phone || '—'}</td>
                  <td>{s.gstin || '—'}</td>
                  <td style={{ color: s.current_balance > 0 ? '#ef4444' : '#22c55e' }}>
                    ₹{s.current_balance.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {mode && selectedSupplier && (
        <SupplierModal
          mode={mode}
          supplier={selectedSupplier}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onEdit={() => setMode('edit')}
        />
      )}

      {mode === 'create' && (
        <SupplierModal
          mode="create"
          supplier={null}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
