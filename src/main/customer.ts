import { queryAll, queryOne, executeWrite, getDatabase } from './database';
import { getActiveCompanyId } from './session';
import type { Customer } from '@shared/types';

export function getAllCustomers(companyId?: number): Customer[] {
  const cid = companyId ?? getActiveCompanyId();
  if (!cid) return [];
  return queryAll<Customer>('SELECT * FROM customers WHERE company_id = ? ORDER BY name', [cid]);
}

export function getCustomerById(id: number): Customer | undefined {
  const companyId = getActiveCompanyId();
  if (!companyId) return undefined;
  return queryOne<Customer>('SELECT * FROM customers WHERE id = ? AND company_id = ?', [
    id,
    companyId
  ]);
}

export async function createCustomer(
  data: Partial<Customer> & { name: string; opening_balance_type?: string },
  companyIdOverride?: number
): Promise<{ success: boolean; data?: Customer; error?: string }> {
  try {
    const companyId = companyIdOverride ?? getActiveCompanyId();
    if (!companyId) return { success: false, error: 'No company selected' };
    const ob = data.opening_balance ?? 0;
    const obType = (data.opening_balance_type === 'Cr' ? 'Cr' : 'Dr');
    const currentBalance = obType === 'Dr' ? ob : -ob;
    const r = executeWrite(
      `INSERT INTO customers (name, phone, email, address, state, gstin, opening_balance, opening_balance_type, current_balance, company_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name.trim(),
        data.phone || null,
        data.email || null,
        data.address || null,
        data.state || null,
        data.gstin || null,
        ob,
        obType,
        currentBalance,
        companyId,
        data.notes || null
      ]
    );
    const customer = queryOne<Customer>('SELECT * FROM customers WHERE id = ?', [r.lastInsertRowid]);
    return { success: true, data: customer };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function updateCustomer(
  id: number,
  data: Partial<Customer> & { opening_balance_type?: string }
): { success: boolean; data?: Customer; error?: string } {
  try {
    const existing = getCustomerById(id);
    if (!existing) return { success: false, error: 'Customer not found' };

    const name = (data.name ?? existing.name).trim();
    if (!name) return { success: false, error: 'Name is required' };

    const openingBalance =
      data.opening_balance !== undefined ? data.opening_balance : existing.opening_balance;
    const obType = (data.opening_balance_type ?? existing.opening_balance_type ?? 'Dr') === 'Cr' ? 'Cr' : 'Dr';
    const newObCurrent = obType === 'Dr' ? openingBalance : -openingBalance;
    const oldObCurrent = existing.opening_balance_type === 'Cr' ? -existing.opening_balance : existing.opening_balance;
    const balanceDelta = newObCurrent - oldObCurrent;
    const currentBalance = existing.current_balance + balanceDelta;

    executeWrite(
      `UPDATE customers SET
        name = ?, phone = ?, email = ?, address = ?, state = ?, gstin = ?,
        opening_balance = ?, opening_balance_type = ?, current_balance = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND company_id = ?`,
      [
        name,
        data.phone !== undefined ? data.phone || null : existing.phone,
        data.email !== undefined ? data.email || null : existing.email,
        data.address !== undefined ? data.address || null : existing.address,
        data.state !== undefined ? data.state || null : existing.state,
        data.gstin !== undefined ? data.gstin || null : existing.gstin,
        openingBalance,
        obType,
        currentBalance,
        data.notes !== undefined ? data.notes || null : existing.notes,
        id,
        existing.company_id
      ]
    );

    const customer = getCustomerById(id);
    return { success: true, data: customer };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function deleteCustomer(id: number): { success: boolean; error?: string } {
  try {
    const existing = getCustomerById(id);
    if (!existing) return { success: false, error: 'Customer not found' };

    const companyId = getActiveCompanyId()!;
    const db = getDatabase();

    const invCount = db.prepare(
      'SELECT COUNT(*) as c FROM invoices WHERE customer_id = ? AND company_id = ?'
    ).get([id, companyId]) as { c: number };

    if (invCount.c > 0) {
      return { success: false, error: `Cannot delete: customer has ${invCount.c} invoice(s). Delete invoices first.` };
    }

    const ledgerCount = db.prepare(
      'SELECT COUNT(*) as c FROM ledger_entries WHERE customer_id = ? AND company_id = ?'
    ).get([id, companyId]) as { c: number };

    if (ledgerCount.c > 0) {
      return { success: false, error: `Cannot delete: customer has ${ledgerCount.c} ledger entry(ies). Clear ledger first.` };
    }

    executeWrite(`DELETE FROM customers WHERE id = ? AND company_id = ?`, [id, companyId]);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
