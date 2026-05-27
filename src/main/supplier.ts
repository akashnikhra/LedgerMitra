import { queryAll, queryOne, executeWrite, getDatabase } from './database';
import { getActiveCompanyId } from './session';
import type { Supplier } from '@shared/types';

export function getAllSuppliers(companyId?: number): Supplier[] {
  const cid = companyId ?? getActiveCompanyId();
  if (!cid) return [];
  return queryAll<Supplier>('SELECT * FROM suppliers WHERE company_id = ? ORDER BY name', [cid]);
}

export function getSupplierById(id: number): Supplier | undefined {
  const companyId = getActiveCompanyId();
  if (!companyId) return undefined;
  return queryOne<Supplier>('SELECT * FROM suppliers WHERE id = ? AND company_id = ?', [
    id,
    companyId
  ]);
}

export async function createSupplier(
  data: Partial<Supplier> & { name: string; opening_balance_type?: string },
  companyIdOverride?: number
): Promise<{ success: boolean; data?: Supplier; error?: string }> {
  try {
    const companyId = companyIdOverride ?? getActiveCompanyId();
    if (!companyId) return { success: false, error: 'No company selected' };
    const ob = data.opening_balance ?? 0;
    const obType = (data.opening_balance_type === 'Dr' ? 'Dr' : 'Cr');
    const currentBalance = obType === 'Cr' ? ob : -ob;
    const r = executeWrite(
      `INSERT INTO suppliers (name, phone, email, address, state, gstin, opening_balance, opening_balance_type, current_balance, company_id, notes)
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
    const supplier = queryOne<Supplier>('SELECT * FROM suppliers WHERE id = ?', [r.lastInsertRowid]);
    return { success: true, data: supplier };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function updateSupplier(
  id: number,
  data: Partial<Supplier> & { opening_balance_type?: string }
): { success: boolean; data?: Supplier; error?: string } {
  try {
    const existing = getSupplierById(id);
    if (!existing) return { success: false, error: 'Supplier not found' };

    const name = (data.name ?? existing.name).trim();
    if (!name) return { success: false, error: 'Name is required' };

    const openingBalance =
      data.opening_balance !== undefined ? data.opening_balance : existing.opening_balance;
    const obType = (data.opening_balance_type ?? existing.opening_balance_type ?? 'Cr') === 'Dr' ? 'Dr' : 'Cr';
    const newObCurrent = obType === 'Cr' ? openingBalance : -openingBalance;
    const oldObCurrent = existing.opening_balance_type === 'Dr' ? -existing.opening_balance : existing.opening_balance;
    const balanceDelta = newObCurrent - oldObCurrent;
    const currentBalance = existing.current_balance + balanceDelta;

    executeWrite(
      `UPDATE suppliers SET
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

    const supplier = getSupplierById(id);
    return { success: true, data: supplier };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function deleteSupplier(id: number): { success: boolean; error?: string } {
  try {
    const existing = getSupplierById(id);
    if (!existing) return { success: false, error: 'Supplier not found' };

    const companyId = getActiveCompanyId()!;
    const db = getDatabase();

    const invCount = db.prepare(
      'SELECT COUNT(*) as c FROM purchase_invoices WHERE supplier_id = ? AND company_id = ?'
    ).get([id, companyId]) as { c: number };

    if (invCount.c > 0) {
      return { success: false, error: `Cannot delete: supplier has ${invCount.c} purchase invoice(s). Delete invoices first.` };
    }

    const ledgerCount = db.prepare(
      'SELECT COUNT(*) as c FROM ledger_entries WHERE customer_id = ? AND company_id = ? AND entry_type = ?'
    ).get([id, companyId, 'PURCHASE_PAYMENT']) as { c: number };

    if (ledgerCount.c > 0) {
      return { success: false, error: `Cannot delete: supplier has ${ledgerCount.c} payment record(s). Clear records first.` };
    }

    executeWrite(`DELETE FROM suppliers WHERE id = ? AND company_id = ?`, [id, companyId]);
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
