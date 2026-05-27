import { queryAll, queryOne, executeWrite } from './database';
import type { Company } from '@shared/types';

export function getAllCompanies(): Company[] {
  return queryAll<Company>('SELECT * FROM company ORDER BY name');
}

export function getCompany(id: number): Company | undefined {
  return queryOne<Company>('SELECT * FROM company WHERE id = ?', [id]);
}

export function createCompany(data: Partial<Company>): Company {
  const r = executeWrite(
    `INSERT INTO company (name, address, phone, email, gstin, pan, state)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name || 'New Company',
      data.address || null,
      data.phone || null,
      data.email || null,
      data.gstin || null,
      data.pan || null,
      data.state || null
    ]
  );
  return getCompany(r.lastInsertRowid as number)!;
}
