import { useEffect, useState } from 'react';
import type { Customer } from '@shared/types';
import CustomerModal from './CustomerModal';

interface Props {
  onChanged?: () => void;
}

export default function CustomersPanel({ onChanged }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<'create' | 'edit' | 'view' | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  async function load() {
    setCustomers(await window.electronAPI.getCustomers());
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').toLowerCase().includes(q) ||
      (c.gstin || '').toLowerCase().includes(q)
    );
  });

  async function openCreate() {
    setSelectedId(null);
    setMode('create');
    setError('');
  }

  async function openView(customer: Customer) {
    setSelectedId(customer.id);
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
    notes?: string;
  }) {
    try {
      const res =
        mode === 'create'
          ? await window.electronAPI.createCustomer(data)
          : await window.electronAPI.updateCustomer(selectedId!, data);

      if (!res.success) {
        return { success: false, error: res.error || 'Could not save customer' };
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
      const res = await window.electronAPI.deleteCustomer(id);
      if (!res.success) {
        return { success: false, error: res.error || 'Could not delete customer' };
      }
      await load();
      onChanged?.();
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  const selectedCustomer = customers.find((c) => c.id === selectedId);

  return (
    <div className="invoices-panel">
      <div className="invoices-toolbar">
        <h2>Customers ({customers.length})</h2>
        <button type="button" className="btn" onClick={openCreate}>
          + New customer
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
                  No customers yet. Click <strong>New customer</strong> to add one.
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className={selectedId === c.id && mode !== null ? 'selected' : ''}
                  onClick={() => openView(c)}
                >
                  <td>{c.name}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.gstin || '—'}</td>
                  <td>₹{c.current_balance.toLocaleString('en-IN')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {mode && selectedCustomer && (
        <CustomerModal
          mode={mode}
          customer={selectedCustomer}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
          onEdit={() => setMode('edit')}
        />
      )}

      {mode === 'create' && (
        <CustomerModal
          mode="create"
          customer={null}
          onClose={closeModal}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
