import { queryAll, queryOne, executeWrite, getDatabase } from './database';
import { getActiveCompanyId, getActiveFyId } from './session';
import type { Invoice, InvoiceItem } from '@shared/types';

function getCompanyState(): string | null {
  const company = queryOne<{ state?: string }>('SELECT state FROM company WHERE id = ?', [getActiveCompanyId()!]);
  return company?.state || null;
}

function computeTaxSplit(
  taxAmount: number,
  customerState: string | null,
  companyState: string | null
): { cgst: number; sgst: number; igst: number } {
  if (taxAmount <= 0) return { cgst: 0, sgst: 0, igst: 0 };
  const isIntraState = customerState && companyState && customerState.toLowerCase() === companyState.toLowerCase();
  if (isIntraState) {
    const half = Math.round((taxAmount / 2) * 100) / 100;
    return { cgst: half, sgst: taxAmount - half, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: taxAmount };
}

export function getAllInvoices(fyId?: number, type?: string): Invoice[] {
  const companyId = getActiveCompanyId();
  const fid = fyId ?? getActiveFyId();
  if (!companyId) return [];

  let baseSql = `
    SELECT i.*, c.name AS customer_name
    FROM invoices i
    LEFT JOIN customers c ON c.id = i.customer_id
    WHERE i.company_id = ?`;
  const params: unknown[] = [companyId];

  if (type) {
    baseSql += ` AND i.invoice_type = ?`;
    params.push(type);
  }
  if (fid) {
    baseSql += ` AND i.fy_id = ?`;
    params.push(fid);
  }

  return queryAll<Invoice>(`${baseSql} ORDER BY i.invoice_date DESC, i.id DESC`, params);
}

export function getInvoiceById(id: number): Invoice | undefined {
  const companyId = getActiveCompanyId();
  if (!companyId) return undefined;
  return queryOne<Invoice>(
    `SELECT i.*, c.name AS customer_name
     FROM invoices i
     LEFT JOIN customers c ON c.id = i.customer_id
     WHERE i.id = ? AND i.company_id = ?`,
    [id, companyId]
  );
}

export function getInvoiceItems(invoiceId: number): InvoiceItem[] {
  const companyId = getActiveCompanyId();
  if (!companyId) return [];
  return queryAll<InvoiceItem>(
    `SELECT ii.*, COALESCE(ii.product_name, p.name) AS product_name
     FROM invoice_items ii
     LEFT JOIN products p ON p.id = ii.product_id
     JOIN invoices i ON i.id = ii.invoice_id
     WHERE ii.invoice_id = ? AND i.company_id = ?
     ORDER BY ii.id`,
    [invoiceId, companyId]
  );
}

export function getInvoiceWithItems(id: number): (Invoice & { items: InvoiceItem[] }) | undefined {
  const invoice = getInvoiceById(id);
  if (!invoice) return undefined;
  const items = getInvoiceItems(id);
  return { ...invoice, items };
}

export function deleteInvoice(id: number): { success: boolean; error?: string } {
  try {
    const existing = getInvoiceById(id);
    if (!existing) return { success: false, error: 'Invoice not found' };

    const companyId = getActiveCompanyId()!;
    const db = getDatabase();
    const tx = db.transaction(() => {
      const invoiceItems = queryAll<{ amount: number; gst_amount: number; product_id?: number; qty: number }>(
        'SELECT amount, gst_amount, product_id, qty FROM invoice_items WHERE invoice_id = ?',
        [id]
      );
      const itemTotal = invoiceItems.reduce((sum, item) => sum + item.amount + item.gst_amount, 0);
      const total = itemTotal > 0 ? itemTotal : existing.total_amount;

      if (existing.invoice_type === 'SALE') {
        for (const item of invoiceItems) {
          if (item.product_id) {
            db.prepare(`UPDATE products SET stock_qty = stock_qty + ? WHERE id = ? AND company_id = ?`)
              .run(item.qty, item.product_id, companyId);
          }
        }
        db.prepare(`UPDATE customers SET current_balance = current_balance - ? WHERE id = ?`).run(
          total,
          existing.customer_id
        );
      } else if (existing.invoice_type === 'RETURN') {
        for (const item of invoiceItems) {
          if (item.product_id) {
            db.prepare(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ? AND company_id = ?`)
              .run(item.qty, item.product_id, companyId);
          }
        }
        db.prepare(`UPDATE customers SET current_balance = current_balance + ? WHERE id = ?`).run(
          total,
          existing.customer_id
        );
      }

      db.prepare(`DELETE FROM invoice_items WHERE invoice_id = ?`).run(id);
      db.prepare(`DELETE FROM ledger_entries WHERE invoice_id = ?`).run(id);
      executeWrite(`DELETE FROM invoices WHERE id = ? AND company_id = ?`, [id, companyId]);
    });

    tx();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function createInvoice(data: {
  customer_id: number;
  invoice_date: string;
  invoice_no?: string;
  invoice_type?: string;
  fy_id?: number;
  legacy_amount?: number;
  total_amount?: number;
  items?: Array<{ product_id?: number; product_name?: string; qty: number; rate: number; gst_rate?: number; discount_pct?: number; remarks?: string }>;
  notes?: string;
}): Promise<{ success: boolean; data?: Invoice; error?: string }> {
  try {
    const companyId = getActiveCompanyId();
    if (!companyId) return { success: false, error: 'No company selected' };

    const fyId = data.fy_id ?? getActiveFyId();
    if (!fyId) return { success: false, error: 'Select a financial year first' };

    const invoiceType = data.invoice_type === 'RETURN' ? 'RETURN' : 'SALE';

    let subtotal = 0;
    let taxAmount = 0;
    let totalDiscount = 0;
    const items = data.items || [];

    if (items.length > 0) {
      for (const item of items) {
        const lineAmt = item.qty * item.rate;
        const discountAmt = item.discount_pct ? (lineAmt * item.discount_pct) / 100 : 0;
        const amt = lineAmt - discountAmt;
        subtotal += amt;
        totalDiscount += discountAmt;
        const gst = item.gst_rate ? (amt * item.gst_rate) / 100 : 0;
        taxAmount += gst;
      }
    } else {
      const amount = data.legacy_amount ?? data.total_amount ?? 0;
      if (amount <= 0) return { success: false, error: 'Invoice amount must be greater than zero' };
      subtotal = amount;
    }

    const total = subtotal + taxAmount;
    const invoiceNo =
      data.invoice_no?.trim() ||
      `INV-${Date.now().toString(36).toUpperCase()}`;

    const existingNo = queryOne<{ id: number }>(
      'SELECT id FROM invoices WHERE invoice_no = ? AND company_id = ?',
      [invoiceNo, companyId]
    );
    if (existingNo) return { success: false, error: 'Invoice number already exists' };

    const customer = queryOne<{ id: number; state?: string }>(
      'SELECT id, state FROM customers WHERE id = ? AND company_id = ?',
      [data.customer_id, companyId]
    );
    if (!customer) return { success: false, error: 'Customer not found' };

    const companyState = getCompanyState();
    const { cgst, sgst, igst } = computeTaxSplit(taxAmount, customer.state, companyState);

    const db = getDatabase();
    const insert = db.transaction(() => {
      const r = executeWrite(
        `INSERT INTO invoices (invoice_no, invoice_type, fy_id, customer_id, invoice_date, subtotal, discount, tax_amount, cgst_amount, sgst_amount, igst_amount, total_amount, total_remaining, company_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceNo,
          invoiceType,
          fyId,
          data.customer_id,
          data.invoice_date,
          subtotal,
          totalDiscount,
          taxAmount,
          cgst,
          sgst,
          igst,
          total,
          invoiceType === 'RETURN' ? -total : total,
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
          `INSERT INTO invoice_items (invoice_id, product_id, product_name, qty, rate, amount, gst_rate, gst_amount, discount_pct, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(invoiceId, item.product_id || null, item.product_name || null, item.qty, item.rate, amt, item.gst_rate || null, gstAmt, item.discount_pct || 0, item.remarks || null);

        if (item.product_id) {
          if (invoiceType === 'SALE') {
            db.prepare(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ? AND company_id = ?`)
              .run(item.qty, item.product_id, companyId);
          } else {
            db.prepare(`UPDATE products SET stock_qty = stock_qty + ? WHERE id = ? AND company_id = ?`)
              .run(item.qty, item.product_id, companyId);
          }
        }
      }

      if (total > 0) {
        const ledgerType = invoiceType === 'RETURN' ? 'RETURN' : 'INVOICE';
        const balanceChange = invoiceType === 'RETURN' ? -total : total;
        db.prepare(
          `INSERT INTO ledger_entries (entry_date, customer_id, invoice_id, entry_type, debit, company_id, narration)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).run(
          data.invoice_date,
          data.customer_id,
          invoiceId,
          ledgerType,
          invoiceType === 'RETURN' ? 0 : total,
          companyId,
          `${invoiceType === 'RETURN' ? 'Return' : 'Invoice'} ${invoiceNo}`
        );

        db.prepare(`UPDATE customers SET current_balance = current_balance + ? WHERE id = ?`).run(
          balanceChange,
          data.customer_id
        );
      }

      return invoiceId;
    });

    const invoiceId = insert();
    return { success: true, data: getInvoiceById(invoiceId as number) };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function updateInvoice(
  id: number,
  data: {
    invoice_no?: string;
    invoice_date?: string;
    customer_id?: number;
    total_amount?: number;
    notes?: string;
    items?: Array<{ product_id?: number; product_name?: string; qty: number; rate: number; gst_rate?: number; discount_pct?: number; remarks?: string }>;
  }
): { success: boolean; data?: Invoice; error?: string } {
  try {
    const existing = getInvoiceById(id);
    if (!existing) return { success: false, error: 'Invoice not found' };

    const companyId = getActiveCompanyId()!;
    const invoiceNo = data.invoice_no?.trim() || existing.invoice_no;
    const invoiceDate = data.invoice_date || existing.invoice_date;
    const customerId = data.customer_id ?? existing.customer_id;

    let subtotal = 0;
    let taxAmount = 0;
    let totalDiscount = 0;
    const items = data.items || [];

    if (items.length > 0) {
      for (const item of items) {
        const lineAmt = item.qty * item.rate;
        const discountAmt = item.discount_pct ? (lineAmt * item.discount_pct) / 100 : 0;
        const amt = lineAmt - discountAmt;
        subtotal += amt;
        totalDiscount += discountAmt;
        const gst = item.gst_rate ? (amt * item.gst_rate) / 100 : 0;
        taxAmount += gst;
      }
    } else {
      const amount = data.total_amount !== undefined ? data.total_amount : existing.total_amount;
      if (amount <= 0) return { success: false, error: 'Invoice amount must be greater than zero' };
      subtotal = amount;
    }

    const total = subtotal + taxAmount;

    if (invoiceNo !== existing.invoice_no) {
      const dup = queryOne<{ id: number }>(
        'SELECT id FROM invoices WHERE invoice_no = ? AND company_id = ? AND id != ?',
        [invoiceNo, companyId, id]
      );
      if (dup) return { success: false, error: 'Invoice number already exists' };
    }

    const customer = queryOne<{ id: number; state?: string }>(
      'SELECT id, state FROM customers WHERE id = ? AND company_id = ?',
      [customerId, companyId]
    );
    if (!customer) return { success: false, error: 'Customer not found' };

    const companyState = getCompanyState();
    const { cgst, sgst, igst } = computeTaxSplit(taxAmount, customer.state, companyState);

    const db = getDatabase();
    const tx = db.transaction(() => {
      const oldTotal = existing.total_amount;
      const oldCustomerId = existing.customer_id;
      const totalDiff = total - oldTotal;

      const oldItems = queryAll<{ product_id?: number; qty: number }>(
        'SELECT product_id, qty FROM invoice_items WHERE invoice_id = ?',
        [id]
      );

      if (existing.invoice_type === 'SALE') {
        for (const item of oldItems) {
          if (item.product_id) {
            db.prepare(`UPDATE products SET stock_qty = stock_qty + ? WHERE id = ? AND company_id = ?`)
              .run(item.qty, item.product_id, companyId);
          }
        }
      } else {
        for (const item of oldItems) {
          if (item.product_id) {
            db.prepare(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ? AND company_id = ?`)
              .run(item.qty, item.product_id, companyId);
          }
        }
      }

      executeWrite(
        `UPDATE invoices SET
          invoice_no = ?, customer_id = ?, invoice_date = ?,
          subtotal = ?, discount = ?, tax_amount = ?, cgst_amount = ?, sgst_amount = ?, igst_amount = ?,
          total_amount = ?, total_remaining = MAX(0, total_remaining + ?), notes = ?
         WHERE id = ? AND company_id = ?`,
        [
          invoiceNo,
          customerId,
          invoiceDate,
          subtotal,
          totalDiscount,
          taxAmount,
          cgst,
          sgst,
          igst,
          total,
          totalDiff,
          data.notes !== undefined ? data.notes || null : existing.notes,
          id,
          companyId
        ]
      );

      db.prepare(`DELETE FROM invoice_items WHERE invoice_id = ?`).run(id);
      for (const item of items) {
        const lineAmt = item.qty * item.rate;
        const discountAmt = item.discount_pct ? (lineAmt * item.discount_pct) / 100 : 0;
        const amt = lineAmt - discountAmt;
        const gstAmt = item.gst_rate ? (amt * item.gst_rate) / 100 : 0;
        db.prepare(
          `INSERT INTO invoice_items (invoice_id, product_id, product_name, qty, rate, amount, gst_rate, gst_amount, discount_pct, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(id, item.product_id || null, item.product_name || null, item.qty, item.rate, amt, item.gst_rate || null, gstAmt, item.discount_pct || 0, item.remarks || null);

        if (item.product_id) {
          if (existing.invoice_type === 'SALE') {
            db.prepare(`UPDATE products SET stock_qty = stock_qty - ? WHERE id = ? AND company_id = ?`)
              .run(item.qty, item.product_id, companyId);
          } else {
            db.prepare(`UPDATE products SET stock_qty = stock_qty + ? WHERE id = ? AND company_id = ?`)
              .run(item.qty, item.product_id, companyId);
          }
        }
      }

      db.prepare(
        `UPDATE ledger_entries SET entry_date = ?, customer_id = ?, debit = ?, narration = ?
         WHERE invoice_id = ? AND entry_type IN ('INVOICE', 'RETURN')`
      ).run(invoiceDate, customerId, total, `Invoice ${invoiceNo}`, id);

      if (oldCustomerId === customerId) {
        if (totalDiff !== 0) {
          db.prepare(`UPDATE customers SET current_balance = current_balance + ? WHERE id = ?`).run(
            totalDiff,
            customerId
          );
        }
      } else {
        db.prepare(`UPDATE customers SET current_balance = current_balance - ? WHERE id = ?`).run(
          oldTotal,
          oldCustomerId
        );
        db.prepare(`UPDATE customers SET current_balance = current_balance + ? WHERE id = ?`).run(
          total,
          customerId
        );
      }
    });

    tx();
    return { success: true, data: getInvoiceById(id) };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}
