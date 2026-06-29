import { queryAll, queryOne, executeWrite } from './database';
import { getActiveCompanyId } from './session';
import type { Product } from '@shared/types';

export function getNextSku(companyIdOverride?: number): string {
  const companyId = companyIdOverride ?? getActiveCompanyId();
  if (!companyId) return '1';

  const rows = queryAll<{ sku: string }>(
    `SELECT sku FROM products WHERE company_id = ?`,
    [companyId]
  );

  let maxNum = 0;
  for (const { sku } of rows) {
    if (/^\d+$/.test(sku)) {
      const n = parseInt(sku, 10);
      if (n > maxNum) maxNum = n;
    }
  }

  let candidate = String(maxNum + 1);
  while (getProductBySku(candidate, companyId)) {
    maxNum++;
    candidate = String(maxNum + 1);
  }

  return candidate;
}

export function getAllProducts(companyId?: number): Product[] {
  const cid = companyId ?? getActiveCompanyId();
  if (!cid) return [];
  return queryAll<Product>('SELECT * FROM products WHERE company_id = ? ORDER BY name', [cid]);
}

export function getProductBySku(sku: string, companyId?: number): Product | undefined {
  const cid = companyId ?? getActiveCompanyId();
  if (!cid) return undefined;
  return queryOne<Product>('SELECT * FROM products WHERE sku = ? AND company_id = ?', [sku, cid]);
}

export function getProductById(id: number, companyId?: number): Product | undefined {
  const cid = companyId ?? getActiveCompanyId();
  if (!cid) return undefined;
  return queryOne<Product>('SELECT * FROM products WHERE id = ? AND company_id = ?', [id, cid]);
}

export async function createProduct(
  data: Partial<Product> & { sku: string; name: string },
  companyIdOverride?: number
): Promise<Product> {
  const companyId = companyIdOverride ?? getActiveCompanyId();
  if (!companyId) throw new Error('No active company');

  let sku = data.sku;

  if (getProductBySku(sku, companyId)) {
    sku = getNextSku(companyId);
  }

  const r = executeWrite(
    `INSERT INTO products (sku, name, category, purchase_rate, selling_rate, gst_rate, hsn_code, unit, stock_qty, opening_stock, reorder_level, company_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      sku,
      data.name,
      data.category || null,
      data.purchase_rate ?? null,
      data.selling_rate ?? 0,
      data.gst_rate ?? null,
      data.hsn_code || null,
      data.unit || 'Nos',
      data.stock_qty ?? 0,
      data.opening_stock ?? 0,
      data.reorder_level ?? null,
      companyId
    ]
  );
  const newId = Number(r.lastInsertRowid);
  return queryOne<Product>('SELECT * FROM products WHERE id = ?', [newId])!;
}

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
