import { queryAll, queryOne, executeWrite, getDatabase } from './database';
import type { FinancialYear } from '@shared/types';

export function getAllFinancialYears(companyId?: number): FinancialYear[] {
  if (companyId) {
    return queryAll<FinancialYear>(
      'SELECT * FROM financial_years WHERE company_id = ? ORDER BY start_date DESC',
      [companyId]
    );
  }
  return queryAll<FinancialYear>('SELECT * FROM financial_years ORDER BY start_date DESC');
}

export function getActiveFinancialYear(companyId: number): FinancialYear | undefined {
  return queryOne<FinancialYear>(
    'SELECT * FROM financial_years WHERE company_id = ? AND is_active = 1 LIMIT 1',
    [companyId]
  );
}

export function createFinancialYear(
  name: string,
  startDate: string,
  endDate: string,
  companyId: number,
  setActive = true
): FinancialYear {
  const db = getDatabase();
  if (setActive) {
    db.prepare('UPDATE financial_years SET is_active = 0 WHERE company_id = ?').run(companyId);
  }
  const r = executeWrite(
    `INSERT INTO financial_years (name, start_date, end_date, is_active, company_id)
     VALUES (?, ?, ?, ?, ?)`,
    [name, startDate, endDate, setActive ? 1 : 0, companyId]
  );
  return queryOne<FinancialYear>('SELECT * FROM financial_years WHERE id = ?', [
    r.lastInsertRowid
  ])!;
}

export function setActiveFinancialYear(id: number, companyId: number): void {
  const db = getDatabase();
  db.prepare('UPDATE financial_years SET is_active = 0 WHERE company_id = ?').run(companyId);
  db.prepare('UPDATE financial_years SET is_active = 1 WHERE id = ?').run(id);
}
