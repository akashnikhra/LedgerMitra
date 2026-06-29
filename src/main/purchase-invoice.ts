import { queryAll, queryOne, executeWrite, getDatabase } from './database';
import { getActiveCompanyId, getActiveFyId } from './session';
import type { PurchaseInvoice, InvoiceItem } from '@shared/types';

function getCompanyState(): string | null {
  const company = queryOne<{ state?: string }>('SELECT state FROM company WHERE id = ?', [getActiveCompanyId()!]);
  return company?.state || null;
}

function computeTaxSplit(
  taxAmount: number,
  supplierState: string | null,
  companyState: string | null
): { cgst: number; sgst: number; igst: number } {
  if (taxAmount <= 0) return { cgst: 0, sgst: 0, igst: 0 };
  const isIntraState = supplierState && companyState && supplierState.toLowerCase() === companyState.toLowerCase();
  if (isIntraState) {
    const half = Math.round((taxAmount / 2) * 100) / 100;
    return { cgst: half, sgst: taxAmount - half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: taxAmount };
}

export function getAllPurchaseInvoices(fyId?: number): PurchaseInvoice[] {
  const companyId = getActiveCompanyId();
  const fid = fyId ?? getActiveFyId();
  if (!companyId) return [];

  let sql = `
    SELECT pi.*, s.name AS supplier_name
    FROM purchase_invoices pi
    LEFT JOIN suppliers s ON s.id = pi.supplier_id
    WHERE pi.company_id = ?`;
  const params: unknown[] = [companyId];

  if (fid) {
    sql += ` AND pi.fy_id = ?`;
    params.push(fid);
  }

  return queryAll<PurchaseInvoice>(`${sql} ORDER BY pi.invoice_date DESC, pi.id DESC`, params);
}

export function getPurchaseInvoiceById(id: number): PurchaseInvoice | undefined {
  const companyId = getActiveCompanyId();
  if (!companyId) return undefined;
  return queryOne<PurchaseInvoice>(
    `SELECT pi.*, s.name AS supplier_name
     FROM purchase_invoices pi
     LEFT JOIN suppliers s ON s.id = pi.supplier_id
     WHERE pi.id = ? AND pi.company_id = ?`,
    [id, companyId]
  );
}

export function getPurchaseInvoiceItems(invoiceId: number): InvoiceItem[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];
  return queryAll<InvoiceItem>(
    `SELECT pii.*, COALESCE(pii.product_name, p.name) AS product_name
     FROM purchase_invoice_items pii
     LEFT JOIN products p ON p.id = pii.product_id
     WHERE pii.invoice_id = ?
     ORDER BY pii.id`,
    [invoiceId]
  );
}

export async function createPurchaseInvoice(data: {
  supplier_id: number;
  invoice_date: string;
  invoice_no?: string;
  fy_id?: number;
  items?: Array<{ product_id?: number; product_name?: string; qty: number; rate: number; gst_rate?: number; discount_pct?: number; remarks?: string }>;
  notes?: string;
}): Promise<{ success: boolean; data?: PurchaseInvoice; error?: string }> {
  try {
    const companyId = getActiveCompanyId();
    if (!companyId) return { success: false, error: 'No company selected' };

    const fyId = data.fy_id ?? getActiveFyId();
    if (!fyId) return { success: false, error: 'Select a financial year first' };

    let subtotal = 0;
    let taxAmount = 0;
    let totalDiscount = 0;
    const items = data.items || [];

    for (const item of items) {
      const lineAmt = item.qty * item.rate;
      const discountAmt = item.discount_pct ? (lineAmt * item.discount_pct) / 100 : 0;
      const amt = lineAmt - discountAmt;
      subtotal += amt;
      totalDiscount += discountAmt;
      const gst = item.gst_rate ? (amt * item.gst_rate) / 100 : 0;
      taxAmount += gst;
    }

    if (items.length === 0 || subtotal <= 0) {
      return { success: false, error: 'Add at least one item with valid quantity and rate' };
    }

    const total = subtotal + taxAmount;
    const invoiceNo = data.invoice_no?.trim() || `PINV-${Date.now().toString(36).toUpperCase()}`;

    const existingNo = queryOne<{ id: number }>(
      'SELECT id FROM purchase_invoices WHERE invoice_no = ? AND company_id = ?',
      [invoiceNo, companyId]
    );
    if (existingNo) return { success: false, error: 'Invoice number already exists' };

    const supplier = queryOne<{ id: number; state?: string }>(
      'SELECT id, state FROM suppliers WHERE id = ? AND company_id = ?',
      [data.supplier_id, companyId]
    );
    if (!supplier) return { success: false, error: 'Supplier not found' };

    const companyState = getCompanyState();
    const { cgst, sgst, igst } = computeTaxSplit(taxAmount, supplier.state, companyState);

    const db = getDatabase();
    const insert = db.transaction(() => {
      const r = executeWrite(
        `INSERT INTO purchase_invoices (invoice_no, fy_id, supplier_id, invoice_date, subtotal, discount, tax_amount, cgst_amount, sgst_amount, igst_amount, total_amount, total_remaining, company_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNo,
          fyId,
          data.supplier_id,
          data.invoice_date,
          subtotal,
          totalDiscount,
          taxAmount,
          cgst,
          sgst,
          igst,
          total,
          total,
          companyId,
          data.notes || null
        ]
      );

      const invoiceId = r.lastInsertRowid as number;

      for (const item of items) {
        const lineAmt = item.qty * item.rate;
        const discountAmt = item.discount_pct ? (lineAmt * item.discount_pct) / 100 : 0;
        const amt = lineAmt - discountAmt;
        const gstAmt = item.gst_rate ? (amt * item.gst_rate) / 100 : 0;
        db.prepare(
          `INSERT INTO purchase_invoice_items (invoice_id, product_id, product_name, qty, rate, amount, gst_rate, gst_amount, discount_pct, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(invoiceId, item.product_id || null, item.product_name || null, item.qty, item.rate, amt, item.gst_rate || null, gstAmt, item.discount_pct || 0, item.remarks || null);

        if (item.product_id) {
          db.prepare(`UPDATE products SET stock_qty = stock_qty + ?, purchase_rate = ? WHERE id = ? AND company_id = ?`)
            .run(item.qty, item.rate, item.product_id, companyId);
        }
      }

      db.prepare(
        `INSERT INTO ledger_entries (entry_date, customer_id, invoice_id, entry_type, credit, company_id, narration)
         VALUES (?, ?, ?, 'PURCHASE', ?, ?, ?)`
      ).run(
        data.invoice_date,
        data.supplier_id,
        invoiceId,
        total,
        companyId,
        `Purchase ${invoiceNo}`
      );

      db.prepare(`UPDATE suppliers SET current_balance = current_balance + ? WHERE id = ?`).run(
        total,
        data.supplier_id
      );

      return invoiceId;
    });

    const invoiceId = insert();
    return { success: true, data: getPurchaseInvoiceById(invoiceId as number) };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function deletePurchaseInvoice(id: number): { success: boolean; error?: string } {
  try {
    const existing = getPurchaseInvoiceById(id);
    if (!existing) return { success: false, error: 'Purchase invoice not found' };

    const companyId = getActiveCompanyId()!;
    const db = getDatabase();
    const tx = db.transaction(() => {
      const items = queryAll<{ product_id?: number; qty: number }>(
        'SELECT product_id, qty FROM purchase_invoice_items WHERE invoice_id = ?',
        [id]
      );

      for (const item of items) {
        if (item.product_id) {
          db.prepare(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ? AND company_id = ?`)
            .run(item.qty, item.product_id, companyId);
        }
      }

      db.prepare(`UPDATE suppliers SET current_balance = current_balance - ? WHERE id = ?`).run(
        existing.total_amount,
        existing.supplier_id
      );

      db.prepare(`DELETE FROM purchase_invoice_items WHERE invoice_id = ?`).run(id);
      db.prepare(`DELETE FROM ledger_entries WHERE invoice_id = ? AND entry_type = 'PURCHASE'`).run(id);
      executeWrite(`DELETE FROM purchase_invoices WHERE id = ? AND company_id = ?`, [id, companyId]);
    });

    tx();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
