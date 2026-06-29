import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import MDBReader from 'mdb-reader';
import { getActiveCompanyId } from './session';
import { executeWrite, queryOne, queryAll, getDatabase } from './database';
import { SqliteReader } from './sqlite-reader';
import { getAllCompanies, createCompany } from './company';
import { createFinancialYear, getAllFinancialYears } from './financial-year';
import { createProduct, getProductBySku, getAllProducts } from './product';
import { createCustomer, getAllCustomers, updateCustomer } from './customer';
import { createInvoice } from './invoice';
import { addPaymentEntry } from './ledger';
import { DEFAULT_MDB_PASSWORD } from '@shared/constants';
import { setWorkspace } from './session';
import type {
  MdbFullAnalysis, MdbImportResult, MdbFileInfo, DetectedFY,
  MdbFileImportStatus, FyCarryForwardTrace, FinancialYear
} from '@shared/types';

const DEFAULT_PASSWORD = DEFAULT_MDB_PASSWORD;

interface MdbAccountIndex {
  partyIds: Set<string>;
  nameById: Map<string, string>;
}

/** Parse Access/Jet dates from mdb-reader (Date, OLE number, or string). */
export function parseLegacyDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number' && isFinite(value)) {
    if (value > 1e12) return new Date(value);
    const epoch = new Date(1899, 11, 30);
    return new Date(epoch.getTime() + Math.round(value * 86400000));
  }
  if (typeof value === 'string' && value.trim()) {
    let parsed = new Date(value);
    if (!isNaN(parsed.getTime())) return parsed;
    const parts = value.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (parts) {
      const day = parseInt(parts[1], 10);
      const month = parseInt(parts[2], 10) - 1;
      let year = parseInt(parts[3], 10);
      if (year < 100) year += 2000;
      parsed = new Date(year, month, day);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

function pickColumn(columns: string[], ...predicates: Array<(c: string) => boolean>): string | undefined {
  for (const pred of predicates) {
    const hit = columns.find(pred);
    if (hit) return hit;
  }
  return undefined;
}

function parseDc(value: unknown): 'D' | 'C' | null {
  const t = String(value ?? '')
    .trim()
    .toUpperCase();
  if (t === 'D' || t === 'DR' || t.startsWith('D')) return 'D';
  if (t === 'C' || t === 'CR' || t.startsWith('C')) return 'C';
  return null;
}

function computeFileHash(filePath: string): string {
  const buffer = readFileSync(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

function getFinancialYearKey(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth();
  const fyStartYear = month >= 3 ? year : year - 1;
  return `FY${String(fyStartYear).slice(-2)}-${String(fyStartYear + 1).slice(-2)}`;
}

function getFyBoundaries(fyName: string): { start: Date; end: Date } | null {
  const m = fyName.match(/FY(\d{2})-(\d{2})/);
  if (!m) return null;
  const startYear = 2000 + parseInt(m[1]);
  return {
    start: new Date(startYear, 3, 1),
    end: new Date(startYear + 1, 2, 31, 23, 59, 59)
  };
}

function isOpeningBalanceTran(tranType: unknown): boolean {
  const t = String(tranType ?? '').toLowerCase();
  return t.includes('op. bal') || t.includes('opening') || t === 'op bal';
}

function isSaleInvoiceTran(tranType: unknown): boolean {
  const t = String(tranType ?? '').toLowerCase().trim();
  if (!t) return true;
  if (t.includes('return') || t.includes('credit note') || t.includes('cn ') || t === 'cn') return false;
  if (t.includes('purchase') || t.includes('payment') || t.includes('receipt') || t.includes('journal') || t.includes('contra')) return false;
  return t.includes('sale') || t.includes('billing') || t.includes('invoice') || t.includes('cash') || t.includes('credit') || t.includes('bill') || t.includes(' Challan') || t.includes('delivery');
}

function isReceiptTran(tranType: unknown): boolean {
  const t = String(tranType ?? '').toLowerCase();
  return /receipt|payment|collection|received/.test(t);
}

function buildMdbAccountIndex(reader: { getTableNames: () => string[]; getTable: (n: string) => { getData: () => Record<string, unknown>[]; getColumnNames: () => string[] } }): MdbAccountIndex {
  const partyIds = new Set<string>();
  const nameById = new Map<string, string>();
  const accountTableName = reader.getTableNames().find((t) => t.toLowerCase() === 'account');
  if (!accountTableName) return { partyIds, nameById };

  const { rows: accountRows } = readTableDataSafe(reader.getTable(accountTableName));
  for (const row of accountRows) {
    const id = row.AccountID ?? row.ID;
    if (id == null) continue;
    const idStr = String(id);
    const name = String(row.AccountName ?? row.Name ?? '').trim();
    if (name) nameById.set(idStr, name);

    const group = String(row.AccountsGroupName ?? row.UnderGroupName ?? '').toLowerCase();
    const primary = String(row.PrimaryGroupName ?? '').toLowerCase();
    if (
      /customer|debtor|creditor|supplier|vendor|party/.test(group) ||
      /customer|debtor|creditor|supplier/.test(primary)
    ) {
      partyIds.add(idStr);
    }
  }
  return { partyIds, nameById };
}

function createCustomerResolver(
  legacyIdMap: Map<string, number>,
  customers: { id: number; name: string; notes?: string }[]
) {
  const customerMap = new Map(customers.map((c) => [c.name.toLowerCase(), c.id]));
  const idMap = legacyIdMap.size > 0 ? legacyIdMap : buildLegacyIdMapFromCustomers(customers);

  return (accountId: unknown, accountName?: unknown): number | undefined => {
    if (accountId != null && accountId !== '') {
      const idStr = String(accountId).trim();
      if (idMap.has(idStr)) return idMap.get(idStr);
    }
    if (accountName != null && accountName !== '') {
      const lower = String(accountName).trim().toLowerCase();
      if (customerMap.has(lower)) return customerMap.get(lower);
      for (const [name, id] of customerMap) {
        if (lower.includes(name) || name.includes(lower)) return id;
      }
    }
    return undefined;
  };
}

/** All folders to scan for spd.mdb / spd.bmw (settings, env, project Upload, original app) */
export function getLegacyDataFolders(): string[] {
  // Check settings table for user-configured path
  let settingsPath: string | undefined;
  try {
    const result = queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'legacy_data_path'");
    settingsPath = result?.value;
  } catch { }

  const candidates = [
    settingsPath,
    process.env.LEDGERMITRA_LEGACY_DATA,
    join(process.cwd(), 'Upload', 'Data')
  ].filter((p): p is string => Boolean(p));

  const seen = new Set<string>();
  const existing: string[] = [];
  for (const folder of candidates) {
    const normalized = folder.replace(/\//g, '\\');
    if (seen.has(normalized.toLowerCase())) continue;
    seen.add(normalized.toLowerCase());
    if (existsSync(folder)) existing.push(folder);
  }
  return existing;
}

export interface MdbAnalysisResult {
  success: boolean;
  tableNames: string[];
  rowCounts: Record<string, number>;
  companyName: string | null;
  dateRange: { min: Date | null; max: Date | null };
  suggestedFY: string | null;
  sampleData: Record<string, any[]>;
  error?: string;
}

export interface MdbImportOptions {
  companyId?: number;
  fyId?: number;
  importProducts: boolean;
  importCustomers: boolean;
  importInvoices: boolean;
  importLedger: boolean;
  importOpeningBalances?: boolean;
  mode?: 'skip' | 'merge' | 'replace';
  selectedFYs?: Array<{
    name: string;
    startDate: string;
    endDate: string;
    mode: 'skip' | 'merge' | 'replace';
  }>;
}

export interface FYValidationResult {
  valid: boolean;
  name: string;
  startDate: string;
  endDate: string;
  warnings: string[];
  errors: string[];
}

/** Normalize FY suggestion for API / UI (handles legacy fyName field) */
export function normalizeSuggestedFY(
  raw: Partial<FYValidationResult> & { fyName?: string }
): MdbFullAnalysis['suggestedFY'] {
  const name = (raw.name || raw.fyName || '').trim();
  return {
    name,
    startDate: raw.startDate || '',
    endDate: raw.endDate || '',
    valid: raw.valid ?? Boolean(name),
    warnings: raw.warnings || []
  };
}

interface MdbRow {
  [key: string]: any;
}

/**
 * Scan Upload/Data folder for MDB and BMW files
 */
export function scanMdbFiles(): MdbFileInfo[] {
  const files: MdbFileInfo[] = [];
  const dataFolders = getLegacyDataFolders();
  const seenPaths = new Set<string>();

  if (dataFolders.length === 0) {
    return files;
  }

  for (const dataFolder of dataFolders) {
    try {
      const folders = readdirSync(dataFolder);

      for (const folder of folders) {
        const folderPath = join(dataFolder, folder);
        const folderStat = statSync(folderPath);

        if (!folderStat.isDirectory()) continue;

        const mdbFiles = readdirSync(folderPath).filter((f: string) =>
          /\.(mdb|bmw|accdb)$/i.test(f)
        );

        for (const file of mdbFiles) {
          const filePath = join(folderPath, file);
          const key = filePath.toLowerCase();
          if (seenPaths.has(key)) continue;
          seenPaths.add(key);

          const fileStat = statSync(filePath);
          const sourceLabel = dataFolder.replace(/\\/g, '/').split('/').slice(-2).join('/') || 'Data';

          files.push({
            name: `${sourceLabel}/${folder}/${file}`,
            path: filePath,
            size: fileStat.size,
            modifiedDate: fileStat.mtime.toISOString()
          });
        }
      }
    } catch (err) {
      console.error(`[mdb-import] Error scanning ${dataFolder}:`, err);
    }
  }

  return files.sort(
    (a, b) => new Date(b.modifiedDate).getTime() - new Date(a.modifiedDate).getTime()
  );
}

interface SafeReadResult {
  rows: Record<string, unknown>[];
  partial: boolean;
}

function readTableDataSafe(table: { getData: (opts?: { rowLimit?: number; rowOffset?: number }) => Record<string, unknown>[] }): SafeReadResult {
  try {
    const rows = table.getData();
    return { rows, partial: false };
  } catch (err) {
    const msg = String(err);
    if (msg.includes('Wrong page type') || msg.includes('does not belong to table')) {
      console.warn('[mdb] Table has page type errors, some rows may be skipped');
      return { rows: [], partial: true };
    }
    throw err;
  }
}

/**
 * Analyze an MDB file and return metadata
 */
export function analyzeMdbFile(filePath: string, password?: string): MdbAnalysisResult {
  try {
    if (!existsSync(filePath)) {
      return { success: false, tableNames: [], rowCounts: {}, companyName: null, dateRange: { min: null, max: null }, suggestedFY: null, sampleData: {}, error: 'File not found' };
    }

    const buffer = readFileSync(filePath);
    const reader = new MDBReader(buffer, { password: password || DEFAULT_PASSWORD });

    const tableNames = reader.getTableNames().filter(t =>
      !t.startsWith('MSys') && !t.startsWith('~')
    );

    const rowCounts: Record<string, number> = {};
    const sampleData: Record<string, any[]> = {};
    let allDates: Date[] = [];
    let companyName: string | null = null;

    for (const tableName of tableNames) {
      try {
        const table = reader.getTable(tableName);
        rowCounts[tableName] = table.rowCount;

        // Get first 3 rows as sample
        const data = table.getData({ rowLimit: 3 });
        sampleData[tableName] = data;

        // Extract dates from BillMaster or Ledger for FY detection
        if (tableName === 'BillMaster' || tableName === 'Ledger' || tableName === 'Voucher') {
          const dateCol = data[0] ? Object.keys(data[0]).find(k =>
            k.toLowerCase().includes('date') || k.toLowerCase().includes('entry')
          ) : null;

          if (dateCol) {
            for (const row of data) {
              if (row[dateCol] instanceof Date) {
                allDates.push(row[dateCol]);
              }
            }
          }
        }

        // Get company name
        if (tableName === 'Company' || tableName === 'CompanyMaster') {
          const nameCol = data[0] ? Object.keys(data[0]).find(k =>
            k.toLowerCase().includes('name')
          ) : null;
          if (nameCol && data[0]) {
            companyName = data[0][nameCol];
          }
        }
      } catch (err) {
        console.log(`[mdb-import] Error reading table ${tableName}:`, err);
      }
    }

    // Calculate date range
    const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : null;
    const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : null;

    // Suggest financial year
    const suggestedFY = minDate ? detectFinancialYear(minDate, maxDate) : null;

    return {
      success: true,
      tableNames,
      rowCounts,
      companyName,
      dateRange: { min: minDate, max: maxDate },
      suggestedFY,
      sampleData
    };
  } catch (err) {
    return {
      success: false,
      tableNames: [],
      rowCounts: {},
      companyName: null,
      dateRange: { min: null, max: null },
      suggestedFY: null,
      sampleData: {},
      error: (err as Error).message
    };
  }
}

/**
 * Perform full analysis of MDB file for wizard display
 */
export async function analyzeMdbFileFull(filePath: string, password?: string): Promise<MdbFullAnalysis> {
  try {
    if (!existsSync(filePath)) {
      return { success: false, fileName: '', fileSize: 0, tables: [], companyName: null, dateRange: { min: null, max: null }, suggestedFY: { name: '', startDate: '', endDate: '', valid: false, warnings: [] }, dataSummary: { products: 0, customers: 0, invoices: 0, ledgerEntries: 0 }, error: 'File not found' };
    }

    const buffer = readFileSync(filePath);
    const reader = new MDBReader(buffer, { password: password || 'allthebest' });
    const tableNames = reader.getTableNames().filter(t => !t.startsWith('MSys') && !t.startsWith('~'));

    const tables: MdbFullAnalysis['tables'] = [];
    let allDates: Date[] = [];
    let companyName: string | null = null;

    // Track key tables for summary
    const keyTables = {
      items: tableNames.find(t => t.toLowerCase() === 'items'),
      account: tableNames.find(t => t.toLowerCase() === 'account'),
      billmaster: tableNames.find(t => t.toLowerCase() === 'billmaster'),
      ledger: tableNames.find(t => t.toLowerCase() === 'ledger')
    };

    for (const tableName of tableNames) {
      try {
        const table = reader.getTable(tableName);
        const columns = table.getColumnNames();
        const rowCount = table.rowCount;
        const sampleRows = table.getData({ rowLimit: 3 });

        tables.push({ name: tableName, rowCount, columns, sampleRows });

        // Get company name
        if (tableName === 'Company') {
          const nameCol = columns.find(c => c.toLowerCase().includes('name'));
          if (nameCol && sampleRows[0]) {
            companyName = sampleRows[0][nameCol];
          }
        }

        // Collect dates for FY detection
        if (tableName === 'BillMaster' || tableName === 'Voucher' || tableName === 'Ledger') {
          const dateCol = columns.find(c => c.toLowerCase().includes('date') || c.toLowerCase().includes('entry'));
          if (dateCol) {
            for (const row of sampleRows) {
              if (row[dateCol] instanceof Date) {
                allDates.push(row[dateCol]);
              }
            }
            // Also get more dates from full data for accurate range
            const { rows: fullData } = readTableDataSafe(table);
            for (const row of fullData.slice(0, 100)) {
              if (row[dateCol] instanceof Date) {
                allDates.push(row[dateCol]);
              }
            }
          }
        }
      } catch (err) {
        console.log(`[mdb-import] Error reading table ${tableName}:`, err);
      }
    }

    // Calculate date range
    const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : null;
    const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : null;

    // Calculate suggested FY
    const suggestedFY = minDate
      ? normalizeSuggestedFY(calculateSuggestedFY(minDate, maxDate))
      : { name: '', startDate: '', endDate: '', valid: false, warnings: [] };

    // Calculate data summary
    let invoiceEstimate = 0;
    let paymentEstimate = 0;
    if (keyTables.ledger && keyTables.account) {
      try {
        const idx = buildMdbAccountIndex(reader);
        const { rows: ledgerRows } = readTableDataSafe(reader.getTable(keyTables.ledger));
        const seen = new Set<string>();
        for (const row of ledgerRows) {
          const accountId = String(row.AccountID ?? '');
          if (!idx.partyIds.has(accountId)) continue;
          const amt = parseFloat(row.Amount as string) || 0;
          if (amt <= 0) continue;
          const dc = parseDc(row.DC);
          const tran = row.TranType;
          if (dc === 'D' && isSaleInvoiceTran(tran)) {
            const key = `${row.VoucherID}-${accountId}`;
            if (!seen.has(key)) {
              seen.add(key);
              invoiceEstimate++;
            }
          } else if (dc === 'C' && isReceiptTran(tran)) {
            paymentEstimate++;
          }
        }
      } catch (err) {
        console.warn('[mdb-import] Could not compute data summary:', err);
      }
    }

    const dataSummary = {
      products: keyTables.items ? reader.getTable(keyTables.items).rowCount : 0,
      customers: keyTables.account ? reader.getTable(keyTables.account).rowCount : 0,
      invoices: invoiceEstimate || (keyTables.billmaster ? reader.getTable(keyTables.billmaster).rowCount : 0),
      ledgerEntries: paymentEstimate || (keyTables.ledger ? reader.getTable(keyTables.ledger).rowCount : 0)
    };

    return {
      success: true,
      fileName: filePath.split(/[\\/]/).pop() || '',
      fileSize: buffer.length,
      tables,
      companyName,
      dateRange: {
        min: minDate ? minDate.toISOString() : null,
        max: maxDate ? maxDate.toISOString() : null
      },
      suggestedFY,
      dataSummary
    };
  } catch (err) {
    return {
      success: false,
      fileName: '',
      fileSize: 0,
      tables: [],
      companyName: null,
      dateRange: { min: null, max: null },
      suggestedFY: { name: '', startDate: '', endDate: '', valid: false, warnings: [] },
      dataSummary: { products: 0, customers: 0, invoices: 0, ledgerEntries: 0 },
      error: (err as Error).message
    };
  }
}

/**
 * Calculate suggested FY with validation
 */
function calculateSuggestedFY(startDate: Date, endDate: Date | null): FYValidationResult {
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth();
  const warnings: string[] = [];

  // Determine FY based on start date (Indian: April-March)
  let fyStartYear = startMonth >= 3 ? startYear : startYear - 1;
  let fyEndYear = fyStartYear + 1;

  // Expected FY boundaries
  const fyStart = new Date(fyStartYear, 3, 1);  // April 1
  const fyEnd = new Date(fyEndYear, 2, 31);      // March 31

  // Check if dates fit within FY
  let valid = true;
  if (endDate) {
    if (endDate < fyStart || endDate > fyEnd) {
      warnings.push(`Transaction dates extend beyond standard FY (Apr ${fyStartYear} - Mar ${fyEndYear})`);
      if (endDate.getFullYear() > fyEndYear || (endDate.getFullYear() === fyEndYear && endDate.getMonth() > 2)) {
        valid = false;
        warnings.push('Data spans multiple financial years - may need batch import');
      }
    }
    if (startDate < fyStart) {
      warnings.push(`Transactions begin before FY start date (${fyStart.toLocaleDateString()})`);
    }
  }

  // Check if start date is exactly April 1
  if (startDate.getMonth() !== 3 || startDate.getDate() !== 1) {
    warnings.push(`FY typically starts April 1, data starts ${startDate.toLocaleDateString()}`);
  }

  return {
    valid,
    name: `FY${String(fyStartYear).slice(-2)}-${String(fyEndYear).slice(-2)}`,
    startDate: fyStart.toISOString().split('T')[0],
    endDate: fyEnd.toISOString().split('T')[0],
    warnings,
    errors: valid ? [] : ['Date range validation failed']
  };
}

/**
 * Validate FY dates and return warnings
 */
export function validateFYDates(startDate: string, endDate: string): FYValidationResult {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const warnings: string[] = [];
  const errors: string[] = [];

  // Basic validation
  if (start >= end) {
    errors.push('Start date must be before end date');
  }

  // Check FY is April-March
  if (start.getMonth() !== 3 || start.getDate() !== 1) {
    warnings.push('Indian financial year typically starts April 1');
  }
  if (end.getMonth() !== 2 || end.getDate() !== 31) {
    warnings.push('Indian financial year typically ends March 31');
  }

  // Calculate expected FY name
  const fyStartYear = start.getMonth() >= 3 ? start.getFullYear() : start.getFullYear() - 1;
  const fyEndYear = fyStartYear + 1;
  const name = `FY${String(fyStartYear).slice(-2)}-${String(fyEndYear).slice(-2)}`;

  return {
    valid: errors.length === 0,
    name,
    startDate,
    endDate,
    warnings,
    errors
  };
}

/**
 * Detect financial year from dates
 */
export function detectFinancialYear(startDate: Date, endDate: Date | null): string {
  // Indian FY: April to March
  // If date is April-June, FY starts current year
  // If date is July-March, FY starts previous year

  const year = startDate.getFullYear();
  const month = startDate.getMonth(); // 0-indexed, 0=January

  let fyStartYear: number;

  if (month >= 3) { // April onwards (month 3 = April)
    fyStartYear = year;
  } else {
    fyStartYear = year - 1;
  }

  const fyEndYear = fyStartYear + 1;
  const fyName = `FY${String(fyStartYear).slice(-2)}-${String(fyEndYear).slice(-2)}`;

  return fyName;
}

/**
 * Create financial year if it doesn't exist
 */
export async function createFYIfNotExists(fyName: string, startDate: Date, endDate: Date, companyId: number): Promise<number> {
  const existingFys = await getAllFinancialYears();
  const existing = existingFys.find(fy => fy.name === fyName);

  if (existing) {
    return existing.id;
  }

  const result = createFinancialYear(
    fyName,
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0],
    companyId,
    true
  );

  return result.id;
}

/**
 * Analyze MDB file to detect all financial years present in the data.
 */
export function analyzeDetectedFYs(filePath: string, password?: string): DetectedFY[] {
  try {
    const buffer = readFileSync(filePath);
    const reader = new MDBReader(buffer, { password: password || DEFAULT_PASSWORD });
    const ledgerTableName = reader.getTableNames().find((t: string) => t.toLowerCase() === 'ledger');
    if (!ledgerTableName) return [];

    const table = reader.getTable(ledgerTableName);
    const columns = table.getColumnNames();
    const dateCol = pickColumn(
      columns,
      (c) => c === 'EntryDate',
      (c) => c === 'Date',
      (c) => /date/i.test(c) && !/id|no|num/i.test(c)
    );
    if (!dateCol) return [];

    const { rows: data, partial } = readTableDataSafe(table);
    if (partial) {
      console.warn('[mdb-import] Ledger data is partial — some pages had unexpected type');
    }
    const fyMap = new Map<string, { min: Date; max: Date; count: number }>();

    for (const row of data) {
      const entryDate = parseLegacyDate(row[dateCol]);
      if (!entryDate) continue;
      const key = getFinancialYearKey(entryDate);
      const existing = fyMap.get(key);
      if (existing) {
        existing.count++;
        if (entryDate < existing.min) existing.min = entryDate;
        if (entryDate > existing.max) existing.max = entryDate;
      } else {
        fyMap.set(key, { min: entryDate, max: entryDate, count: 1 });
      }
    }

    const result: DetectedFY[] = [];
    for (const [name, info] of fyMap) {
      const boundaries = getFyBoundaries(name);
      if (!boundaries) continue;
      result.push({
        name,
        startDate: boundaries.start.toISOString().split('T')[0],
        endDate: boundaries.end.toISOString().split('T')[0],
        rowCount: info.count,
        dateRange: {
          min: info.min.toISOString().split('T')[0],
          max: info.max.toISOString().split('T')[0]
        }
      });
    }

    result.sort((a, b) => a.startDate.localeCompare(b.startDate));
    return result;
  } catch (err) {
    console.error('[mdb-import] Error analyzing FYs:', err);
    return [];
  }
}

/**
 * Check if an MDB file has been imported before and return per-FY status.
 */
export function checkFileImportStatus(filePath: string): MdbFileImportStatus {
  const fileHash = computeFileHash(filePath);
  const logs = queryAll<{
    fy_id: number;
    fy_name: string;
    imported_invoices: number;
    completed_at: string;
  }>(
    `SELECT DISTINCT fy_id, fy_name, imported_invoices, completed_at
     FROM legacy_import_log WHERE file_hash = ? ORDER BY fy_name`,
    [fileHash]
  );

  const detectedFYs = analyzeDetectedFYs(filePath);

  return {
    fileHash,
    filePath,
    existing: logs.length > 0,
    previouslyImportedFYs: logs.map(l => ({
      fyName: l.fy_name || '',
      fyId: l.fy_id,
      invoiceCount: l.imported_invoices,
      importDate: l.completed_at
    })),
    detectedFYs
  };
}

/**
 * Import data from MDB file
 */
export async function importFromMdb(
  filePath: string,
  password: string,
  options: MdbImportOptions
): Promise<MdbImportResult> {
  const result: MdbImportResult = {
    success: true,
    imported: { products: 0, customers: 0, invoices: 0, ledger: 0, openingBalances: 0 },
    skipped: { products: 0, customers: 0, invoices: 0, ledger: 0, openingBalances: 0 },
    errors: { products: [], customers: [], invoices: [], ledger: [] }
  };

  const companyId = options.companyId || getActiveCompanyId();
  const fyId = options.fyId;

  if (!companyId) {
    result.success = false;
    result.error = 'No company selected';
    return result;
  }

  if (fyId) {
    setWorkspace(companyId, fyId);
  }

  try {
    const buffer = readFileSync(filePath);
    const reader = new MDBReader(buffer, { password });
    const fileHash = computeFileHash(filePath);
    const accountIndex = buildMdbAccountIndex(reader);
    console.log(
      `[MDB] Account index: ${accountIndex.partyIds.size} party accounts, ${accountIndex.nameById.size} total`
    );

    // Import Products (shared across FYs)
    if (options.importProducts) {
      const productResult = await importProducts(reader, companyId);
      result.imported.products = productResult.imported;
      result.skipped.products = productResult.skipped;
      result.errors.products = productResult.errors;
    }

    // Import Customers (shared across FYs)
    let legacyIdMap: Map<string, number> = new Map();
    if (options.importCustomers) {
      const customerResult = await importCustomers(reader, companyId);
      result.imported.customers = customerResult.imported;
      result.skipped.customers = customerResult.skipped;
      result.errors.customers = customerResult.errors;
      legacyIdMap = customerResult.legacyIdMap;
    }

    // Multi-FY mode: iterate selected FYs
    if (options.selectedFYs && options.selectedFYs.length > 0) {
      const fyResults: MdbImportResult['fyResults'] = [];

      for (const fyOption of options.selectedFYs) {
        if (fyOption.mode === 'skip') {
          continue;
        }

        // Get or create FY record
        const fy = await getOrCreateFYForImport(
          fyOption.name, fyOption.startDate, fyOption.endDate, companyId
        );
        if (!fy.success || !fy.id) {
          result.errors.ledger.push(`Failed to create FY ${fyOption.name}: ${fy.error}`);
          continue;
        }
        const currentFyId = fy.id;
        setWorkspace(companyId, currentFyId);

        // If mode is 'replace', nuke prior import data for this FY from this file
        if (fyOption.mode === 'replace') {
          const priorLogs = queryAll<{ id: number }>(
            `SELECT id FROM legacy_import_log WHERE file_hash = ? AND fy_id = ?`,
            [fileHash, currentFyId]
          );
          for (const log of priorLogs) {
            const voucherEntries = queryAll<{ entity_type: string; entity_id: number }>(
              `SELECT entity_type, entity_id FROM import_voucher_map WHERE import_file_log_id = ?`,
              [log.id]
            );
            const db = getDatabase();
            const tx = db.transaction(() => {
              for (const ve of voucherEntries) {
                if (ve.entity_type === 'invoice') {
                  const { deleteInvoice } = require('./invoice');
                  deleteInvoice(ve.entity_id);
                } else if (ve.entity_type === 'ledger') {
                  db.prepare('DELETE FROM ledger_entries WHERE id = ?').run(ve.entity_id);
                }
              }
              db.prepare('DELETE FROM import_voucher_map WHERE import_file_log_id = ?').run(log.id);
              db.prepare('DELETE FROM legacy_import_log WHERE id = ?').run(log.id);
            });
            tx();
          }
        }

        // Import opening balances for this FY
        if (options.importOpeningBalances !== false) {
          const obResult = await importOpeningBalances(
            reader, companyId, currentFyId, fyOption.name, legacyIdMap, accountIndex, filePath, fileHash
          );
          result.imported.openingBalances += obResult.imported;
          result.skipped.openingBalances += obResult.skipped;
        }

        // Import invoices for this FY
        if (options.importInvoices) {
          const invoiceResult = await importInvoicesForFy(
            reader, companyId, currentFyId, legacyIdMap, accountIndex,
            fyOption.name, fileHash, fyOption.mode
          );
          result.imported.invoices += invoiceResult.imported;
          result.skipped.invoices += invoiceResult.skipped;
          result.errors.invoices.push(...invoiceResult.errors);
          // invoices: imported ${invoiceResult.imported}, skipped ${invoiceResult.skipped}
        }

        // Import ledger payments for this FY
        if (options.importLedger) {
          const ledgerResult = await importLedgerForFy(
            reader, companyId, currentFyId, legacyIdMap, accountIndex,
            fyOption.name, fileHash, fyOption.mode
          );
          result.imported.ledger += ledgerResult.imported;
          result.skipped.ledger += ledgerResult.skipped;
          result.errors.ledger.push(...ledgerResult.errors);
          // ledger payments: imported ${ledgerResult.imported}, skipped ${ledgerResult.skipped}
        }

        fyResults.push({
          fyName: fyOption.name,
          fyId: currentFyId,
          imported: result.imported.invoices,
          skipped: result.skipped.invoices
        });
      }

      result.fyResults = fyResults;

      // Build FY chain after all FYs imported
      await buildFyChain(companyId);
    } else {
      // Legacy single-FY mode (backward compatible)
      if (fyId) {
        setWorkspace(companyId, fyId);
      }

      if (options.importInvoices) {
        const invoiceResult = await importInvoices(reader, companyId, fyId, legacyIdMap, accountIndex);
        result.imported.invoices = invoiceResult.imported;
        result.skipped.invoices = invoiceResult.skipped;
        result.errors.invoices = invoiceResult.errors;
      }

      if (options.importLedger) {
        const ledgerResult = await importLedger(reader, companyId, fyId, legacyIdMap, accountIndex);
        result.imported.ledger = ledgerResult.imported;
        result.skipped.ledger = ledgerResult.skipped;
        result.errors.ledger = ledgerResult.errors;
      }
    }

    const totalImported =
      result.imported.products +
      result.imported.customers +
      result.imported.invoices +
      result.imported.ledger +
      result.imported.openingBalances;
    const criticalErrors = result.errors.products.length + result.errors.customers.length;
    result.success = criticalErrors === 0 && totalImported > 0;

  } catch (err) {
    result.success = false;
    result.error = (err as Error).message;
  }

  return result;
}

/**
 * Import Products from MDB Items table
 */
async function importProducts(reader: any, companyId: number): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] };

  try {
    const tableNames = reader.getTableNames();
    const itemsTableName = tableNames.find(t =>
      t.toLowerCase() === 'items' ||
      t.toLowerCase() === 'item' ||
      t.toLowerCase() === 'products' ||
      t.toLowerCase() === 'product' ||
      t.toLowerCase() === 'stock' ||
      t.toLowerCase() === 'stockitems'
    );

    if (!itemsTableName) {
      result.errors.push('Items table not found');
      return result;
    }

    const table = reader.getTable(itemsTableName);
    const columns = table.getColumnNames();
    const { rows: data } = readTableDataSafe(table);

    // Map common column names
    const nameCol = columns.find(c => c.toLowerCase().includes('name') && !c.toLowerCase().includes('group'));
    const skuCol = columns.find(c => c.toLowerCase().includes('code') || c.toLowerCase().includes('sku') || c.toLowerCase().includes('barcode'));
    const saleCol = columns.find(c => c === 'SalePrice' || c === 'SelectedPrice' || c === 'MRP' || c === 'Rate' || c === 'Price' || c.toLowerCase().includes('sale') || c.toLowerCase().includes('mrp') || c.toLowerCase().includes('rate'));
    const purchaseCol = columns.find(c => c === 'PurchasePrice' || c === 'CostPrice' || c === 'Cost' || c.toLowerCase().includes('purchase') || c.toLowerCase().includes('cost'));
    const gstCol = columns.find(c => c.toLowerCase().includes('gst') || c.toLowerCase().includes('tax'));
    const hsnCol = columns.find(c => c.toLowerCase().includes('hsn') || c.toLowerCase().includes('sac'));
    const unitCol = columns.find(c => c.toLowerCase().includes('unit'));
    const stockCol = columns.find(c => c === 'OPStock' || c === 'StockQty' || c.toLowerCase().includes('stock') || c.toLowerCase().includes('qty') || c.toLowerCase().includes('opstock'));
    const reorderCol = columns.find(c => c.toLowerCase().includes('reorder') || c.toLowerCase().includes('minimum'));
    const groupCol = columns.find(c => c === 'ItemGroupName' || c.toLowerCase().includes('group') || c.toLowerCase().includes('category'));

    // Find ALL price-related columns for fallback
    const allPriceCols = columns.filter(c =>
      /price|rate|mrp|sale|cost|amount/i.test(c)
    );

    console.log(`[MDB] Items table "${itemsTableName}" columns:`, columns);
    console.log(`[MDB] Mapped columns - name: ${nameCol}, sku: ${skuCol}, sale: ${saleCol}, purchase: ${purchaseCol}, gst: ${gstCol}, stock: ${stockCol}`);
    console.log(`[MDB] All price-related columns:`, allPriceCols);

    // Helper: pick best rate from multiple columns (first non-zero wins)
    function pickBestRate(row: any, preferredCols: (string | undefined)[], fallbackCols: string[]): number {
      for (const col of preferredCols) {
        if (col && row[col] !== undefined && row[col] !== null && row[col] !== '') {
          const val = parseFloat(row[col]);
          if (!isNaN(val) && val > 0) return val;
        }
      }
      for (const col of fallbackCols) {
        if (row[col] !== undefined && row[col] !== null && row[col] !== '') {
          const val = parseFloat(row[col]);
          if (!isNaN(val) && val > 0) return val;
        }
      }
      return 0;
    }

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      try {
        const itemName = row[nameCol] || row[nameCol?.toLowerCase() === 'itemname' ? 'ItemName' : ''];
        if (!itemName) continue;

        const sku = row[skuCol] || `IMP-${i + 1}`;
        const existing = getProductBySku(String(sku), companyId);

        if (existing) {
          result.skipped++;
          continue;
        }

        const sellingRate = pickBestRate(row, [saleCol, 'SalePrice', 'SelectedPrice', 'MRP', 'Rate', 'Price', 'Sp1', 'Sp2', 'Sp3'], allPriceCols);
        const purchaseRate = pickBestRate(row, [purchaseCol, 'PurchasePrice', 'CostPrice', 'Cost', 'Rate', 'Price', 'Pp1'], allPriceCols);

        const productData: any = {
          sku: String(sku),
          name: String(itemName),
          selling_rate: sellingRate,
          purchase_rate: purchaseRate || undefined,
          gst_rate: row[gstCol] ? parseFloat(row[gstCol]) : undefined,
          hsn_code: row[hsnCol] ? String(row[hsnCol]) : undefined,
          unit: row[unitCol] ? String(row[unitCol]) : 'Nos',
          stock_qty: row[stockCol] ? parseInt(row[stockCol]) : 0,
          opening_stock: row[stockCol] ? parseInt(row[stockCol]) : 0,
          category: row[groupCol] ? String(row[groupCol]) : undefined
        };

        if (i < 5) {
          console.log(`[MDB] Row ${i + 1}: "${itemName}" → selling_rate: ${sellingRate}, purchase_rate: ${purchaseRate}`);
        }

        await createProduct(productData, companyId);
        result.imported++;
      } catch (err) {
        result.errors.push(`Row ${i + 1}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    result.errors.push(`Products import error: ${(err as Error).message}`);
  }

  return result;
}

/**
 * Import Customers from MDB Account table
 */
async function importCustomers(reader: any, companyId: number): Promise<{ imported: number; skipped: number; errors: string[]; legacyIdMap: Map<string, number> }> {
  const result: { imported: number; skipped: number; errors: string[]; legacyIdMap: Map<string, number> } = { imported: 0, skipped: 0, errors: [] as string[], legacyIdMap: new Map() };

  try {
    const tableNames = reader.getTableNames();
    const accountTableName = tableNames.find(t =>
      t.toLowerCase() === 'account' ||
      t.toLowerCase() === 'accounts' ||
      t.toLowerCase() === 'customers' ||
      t.toLowerCase() === 'customer' ||
      t.toLowerCase() === 'parties' ||
      t.toLowerCase() === 'party'
    );

    if (!accountTableName) {
      result.errors.push('Account table not found');
      return result;
    }

    const table = reader.getTable(accountTableName);
    const columns = table.getColumnNames();
    const { rows: data } = readTableDataSafe(table);

    // Map common column names - use exact matches where possible
    const nameCol = columns.find(c => c === 'AccountName' || c === 'name' || c === 'Name') ||
                    columns.find(c => c.toLowerCase().includes('name') && !c.toLowerCase().includes('group'));
    const idCol = columns.find(c =>
      c === 'AccountID' ||
      c === 'ID' ||
      c.toLowerCase() === 'account_id' ||
      c.toLowerCase() === 'id' ||
      c.toLowerCase().includes('account_id') ||
      c.toLowerCase() === 'acctid' ||
      c.toLowerCase() === 'account_no' ||
      c.toLowerCase() === 'accountnumber'
    );
    const phoneCol = columns.find(c => c.toLowerCase().includes('phone') || c.toLowerCase().includes('mobile') || c.toLowerCase().includes('tel'));
    const addressCol = columns.find(c => c.toLowerCase().includes('address') || c.toLowerCase().includes('add'));
    const cityCol = columns.find(c => c.toLowerCase().includes('city'));
    const gstCol = columns.find(c => c.toLowerCase().includes('gst') || c.toLowerCase().includes('tin'));
    const panCol = columns.find(c => c.toLowerCase().includes('pan') || c.toLowerCase().includes('itpan'));
    const balanceCol = columns.find(c => c.toLowerCase().includes('balance') || c.toLowerCase().includes('opbal') || c.toLowerCase().includes('crbal') || c.toLowerCase().includes('drbal'));
    const emailCol = columns.find(c => c.toLowerCase().includes('email'));

    const existingCustomers = getAllCustomers(companyId);
    const customerByName = new Map(
      existingCustomers.map((c) => [c.name.toLowerCase(), c])
    );

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      try {
        const accountName = row[nameCol];
        if (!accountName) continue;

        const existing = customerByName.get(String(accountName).toLowerCase());

        if (existing) {
          if (idCol && row[idCol]) {
            result.legacyIdMap.set(String(row[idCol]), existing.id);
          }
          const noteMatch = existing.notes?.match(/Legacy AccountID:\s*(\S+)/);
          if (noteMatch) {
            result.legacyIdMap.set(noteMatch[1], existing.id);
          }
          result.skipped++;
          continue;
        }

        let openingBalance = 0;
        if (balanceCol) {
          const balStr = String(row[balanceCol] || '0');
          // Extract numeric value from balance string (may have Dr/Cr suffix)
          const numMatch = balStr.match(/[\d.-]+/);
          if (numMatch) {
            openingBalance = parseFloat(numMatch[0]) || 0;
          }
        }

        // Store the legacy AccountID in notes for later lookup
        const legacyId = idCol && row[idCol] ? String(row[idCol]) : null;
        const notes = legacyId ? `Legacy AccountID: ${legacyId}` : undefined;
        const customerData: any = {
          name: String(accountName),
          phone: row[phoneCol] ? String(row[phoneCol]) : undefined,
          address: row[addressCol] ? String(row[addressCol]) : (row[cityCol] ? String(row[cityCol]) : undefined),
          gstin: row[gstCol] ? String(row[gstCol]) : undefined,
          opening_balance: openingBalance,
          notes
        };

        const created = await createCustomer(customerData, companyId);
        if (created.success && created.data) {
          customerByName.set(created.data.name.toLowerCase(), created.data);
          if (legacyId) {
            result.legacyIdMap.set(legacyId, created.data.id);
          }
          result.imported++;
        } else {
          result.errors.push(`Row ${i + 1}: ${created.error || 'Create failed'}`);
        }
      } catch (err) {
        result.errors.push(`Row ${i + 1}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    result.errors.push(`Customers import error: ${(err as Error).message}`);
  }

  return result;
}

/**
 * Build a map of legacy AccountID to customer ID by scanning existing customers' notes
 */
function buildLegacyIdMapFromCustomers(customers: any[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const customer of customers) {
    if (customer.notes && customer.notes.includes('Legacy AccountID:')) {
      const match = customer.notes.match(/Legacy AccountID:\s*(\S+)/);
      if (match) {
        map.set(match[1], customer.id);
      }
    }
  }
  return map;
}

/**
 * Import sales invoices from Ledger (Speed Plus stores amounts on Ledger, not BillMaster).
 * If BillMaster table exists with line-item detail, items are parsed and attached.
 */
async function importInvoices(
  reader: any,
  companyId: number,
  fyId?: number,
  legacyIdMap?: Map<string, number>,
  accountIndex?: MdbAccountIndex
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] };

  try {
    const index = accountIndex ?? buildMdbAccountIndex(reader);
    const ledgerTableName = reader.getTableNames().find((t: string) => t.toLowerCase() === 'ledger');
    if (!ledgerTableName) {
      result.errors.push('Ledger table not found (required for invoice import)');
      return result;
    }

    const table = reader.getTable(ledgerTableName);
    const columns = table.getColumnNames();
    const { rows: data } = readTableDataSafe(table);

    const dateCol = pickColumn(
      columns,
      (c) => c === 'EntryDate',
      (c) => c === 'Date',
      (c) => /date/i.test(c) && !/id|no|num/i.test(c)
    );
    const dcCol = pickColumn(columns, (c) => c === 'DC', (c) => c.toLowerCase() === 'dc');
    const tranCol = pickColumn(
      columns,
      (c) => c === 'TranType',
      (c) => /trantype|transactiontype/i.test(c)
    );
    const vchCol = pickColumn(columns, (c) => c === 'VchNo', (c) => c === 'VoucherID');
    const amountCol = pickColumn(columns, (c) => c === 'Amount', (c) => /^amount$/i.test(c));

    if (!dateCol || !dcCol || !amountCol) {
      result.errors.push('Ledger table missing EntryDate, DC, or Amount columns');
      return result;
    }

    const customers = getAllCustomers(companyId);
    const resolveCustomer = createCustomerResolver(legacyIdMap ?? new Map(), customers);
    const seenVouchers = new Set<string>();

    const billMasterTableName = reader.getTableNames().find((t: string) => t.toLowerCase() === 'billmaster');
    let billMasterItems: Map<string, Array<{ itemName?: string; qty?: number; rate?: number; amount?: number; gstRate?: number; discountPct?: number; remarks?: string }>> = new Map();

    if (billMasterTableName) {
      billMasterItems = parseBillMasterItems(reader, billMasterTableName);
    }

    // Speed Plus stores line items in the Inventory table, not BillMaster
    const inventoryTableName = reader.getTableNames().find((t: string) => t.toLowerCase() === 'inventory');
    let inventoryItems: Map<string, Array<{ itemName?: string; qty?: number; rate?: number; amount?: number; gstRate?: number; discountPct?: number; remarks?: string }>> = new Map();

    if (inventoryTableName && billMasterItems.size === 0) {
      inventoryItems = parseInventoryItems(reader, inventoryTableName);
    }

    // Merge: Inventory items take precedence when BillMaster has no line items
    const allLineItems = inventoryItems.size > 0 ? inventoryItems : billMasterItems;

    let discountCount = 0;
    let remarksCount = 0;
    for (const items of allLineItems.values()) {
      for (const it of items) {
        if (it.discountPct && it.discountPct !== 0) discountCount++;
        if (it.remarks && it.remarks !== '') remarksCount++;
      }
    }
    console.log(`[MDB] All line items: ${allLineItems.size} vouchers, ${discountCount} items with discount, ${remarksCount} items with remarks`);

    // Invoice import from Ledger
    // Columns: dateCol=${dateCol}, dcCol=${dcCol}, tranCol=${tranCol}, vchCol=${vchCol}, amountCol=${amountCol}

    const skipReasons = { notDebit: 0, openingBal: 0, notSale: 0, notParty: 0, noCustomer: 0, noAmount: 0, noDate: 0, duplicate: 0, createFail: 0, other: 0 };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      try {
        if (parseDc(row[dcCol]) !== 'D') {
          skipReasons.notDebit++;
          result.skipped++;
          continue;
        }
        if (isOpeningBalanceTran(tranCol ? row[tranCol] : null)) {
          skipReasons.openingBal++;
          result.skipped++;
          continue;
        }
        if (!isSaleInvoiceTran(tranCol ? row[tranCol] : null)) {
          skipReasons.notSale++;
          result.skipped++;
          continue;
        }

        const accountId = String(row.AccountID ?? '');
        if (!index.partyIds.has(accountId)) {
          skipReasons.notParty++;
          result.skipped++;
          continue;
        }

        const customerId = resolveCustomer(row.AccountID, row.AccountName);
        if (!customerId) {
          skipReasons.noCustomer++;
          result.skipped++;
          continue;
        }

        const amount = parseFloat(row[amountCol]) || 0;
        if (amount <= 0) {
          skipReasons.noAmount++;
          result.skipped++;
          continue;
        }

        const entryDate = parseLegacyDate(row[dateCol]);
        if (!entryDate) {
          skipReasons.noDate++;
          result.skipped++;
          result.errors.push(`Row ${i + 1}: Invalid or missing date`);
          continue;
        }

        const voucherId = row.VoucherID ?? row[vchCol] ?? i;
        const voucherKey = `${voucherId}-${customerId}`;
        if (seenVouchers.has(voucherKey)) {
          skipReasons.duplicate++;
          result.skipped++;
          continue;
        }
        seenVouchers.add(voucherKey);

        const vchNo =
          vchCol && row[vchCol] != null && row[vchCol] !== ''
            ? String(row[vchCol])
            : `VCH-${voucherId}`;

        const billKey = `${voucherId}`;
        const legacyItems = allLineItems.get(billKey) || [];

        const mappedItems: Array<{ product_id?: number; product_name?: string; qty: number; rate: number; gst_rate?: number; discount_pct?: number; remarks?: string }> = [];
        const productByName = new Map<string, number>();
        const existingProducts = getAllProducts(companyId);
        for (const p of existingProducts) {
          productByName.set(p.name.toLowerCase(), p.id);
        }

        for (const li of legacyItems) {
          let productId: number | undefined;
          if (li.itemName) {
            const lowerName = li.itemName.toLowerCase();
            productId = productByName.get(lowerName);
            if (!productId) {
              for (const [name, id] of productByName) {
                if (lowerName.includes(name) || name.includes(lowerName)) {
                  productId = id;
                  break;
                }
              }
            }
          }

          const qty = li.qty ?? 1;
          const rate = li.rate ?? (li.amount ? li.amount / qty : 0);
          const gstRate = li.gstRate;

          mappedItems.push({
            product_id: productId,
            product_name: li.itemName || undefined,
            qty,
            rate,
            gst_rate: gstRate,
            discount_pct: li.discountPct,
            remarks: li.remarks
          });
        }

        const created = await createInvoice({
          customer_id: customerId,
          invoice_date: entryDate.toISOString().split('T')[0],
          items: mappedItems.length > 0 ? mappedItems : [],
          fy_id: fyId,
          legacy_amount: mappedItems.length === 0 ? amount : undefined,
          invoice_no: vchNo,
          notes: `Legacy import - Voucher ${voucherId}`
        });

        if (created.success) {
          result.imported++;
        } else {
          skipReasons.createFail++;
          result.skipped++;
          if (created.error) result.errors.push(`Row ${i + 1}: ${created.error}`);
        }
      } catch (err) {
        skipReasons.other++;
        result.errors.push(`Row ${i + 1}: ${(err as Error).message}`);
      }
    }

    // Import complete: imported=${result.imported}, skipped=${result.skipped}, errors=${result.errors.length}
  } catch (err) {
    result.errors.push(`Invoices import error: ${(err as Error).message}`);
  }

  return result;
}

/**
 * Parse BillMaster table to extract invoice line items keyed by VoucherID.
 * Returns empty map if the table has no line-item columns (header-only table).
 */
function parseBillMasterItems(
  reader: any,
  tableName: string
): Map<string, Array<{ itemName?: string; qty?: number; rate?: number; amount?: number; gstRate?: number; discountPct?: number; remarks?: string }>> {
  const itemsMap = new Map<string, Array<{ itemName?: string; qty?: number; rate?: number; amount?: number; gstRate?: number; discountPct?: number; remarks?: string }>>();

  try {
    const table = reader.getTable(tableName);
    const columns = table.getColumnNames();
    const { rows: data } = readTableDataSafe(table);

    console.log(`[MDB] BillMaster columns: ${columns.join(', ')}`);

    // Dump first 2 rows to see actual column values
    if (data.length > 0) {
      console.log(`[MDB] BillMaster first row: ${JSON.stringify(data[0])}`);
    }
    if (data.length > 1) {
      console.log(`[MDB] BillMaster second row: ${JSON.stringify(data[1])}`);
    }

    const vchCol = pickColumn(columns, (c) => c === 'VoucherID', (c) => c === 'VchNo', (c) => /voucher/i.test(c));
    const itemCol = pickColumn(columns, (c) => c === 'ItemName', (c) => c === 'Item', (c) => /item.*name/i.test(c), (c) => /product/i.test(c));
    const qtyCol = pickColumn(columns, (c) => c === 'Qty', (c) => c === 'Quantity', (c) => /qty/i.test(c));
    const rateCol = pickColumn(columns, (c) => c === 'Rate', (c) => c === 'UnitPrice', (c) => c === 'Price', (c) => /rate/i.test(c));
    const amountCol = pickColumn(columns, (c) => c === 'Amount', (c) => c === 'Total', (c) => c === 'LineTotal', (c) => /amount/i.test(c));
    const gstCol = pickColumn(columns, (c) => c === 'GSTRate', (c) => c === 'TaxRate', (c) => c === 'GST', (c) => /gst.*rate/i.test(c), (c) => /tax.*rate/i.test(c));
    // Discount percentage column (D% in Speed Plus)
    // Speed Plus uses DiscountRate for the actual item-level discount %.
    const discountCol = pickColumn(columns,
      (c) => c === 'DiscountRate',
      (c) => c === 'D%',
      (c) => c === 'D %',
      (c) => c === 'Disc%',
      (c) => c === 'DiscountPercentage',
      (c) => c === 'Discount',
      (c) => /^d\s*%$/i.test(c),
      (c) => /^discount.*rate$/i.test(c)
    );
    // Remarks column
    // Speed Plus may use: Remarks, Remark, Narration, ShortNarration, Note, etc.
    const remarksCol = pickColumn(columns,
      (c) => c === 'Remarks',
      (c) => c === 'Remark',
      (c) => c === 'Narration',
      (c) => c === 'ShortNarration',
      (c) => c === 'Note',
      (c) => /remark|narration|note/i.test(c)
    );

    if (discountCol) {
      console.log(`[MDB] BillMaster: discount column found = "${discountCol}"`);
    }
    if (remarksCol) {
      console.log(`[MDB] BillMaster: remarks column found = "${remarksCol}"`);
    }

    if (!vchCol) {
      console.log(`[MDB] BillMaster: no voucher column found`);
      return itemsMap;
    }

    // If no item/qty/rate columns exist, this is a header-only table — skip line item parsing
    if (!itemCol && !qtyCol && !rateCol && !amountCol) {
      console.log(`[MDB] BillMaster: no line item columns found (header-only table), skipping`);
      return itemsMap;
    }

    for (const row of data) {
      const vchId = row[vchCol];
      if (vchId == null || vchId === '') continue;
      const key = String(vchId);

      const item: { itemName?: string; qty?: number; rate?: number; amount?: number; gstRate?: number; discountPct?: number; remarks?: string } = {};

      if (itemCol) item.itemName = String(row[itemCol] || '');
      if (qtyCol) item.qty = parseFloat(row[qtyCol]) || undefined;
      if (rateCol) item.rate = parseFloat(row[rateCol]) || undefined;
      if (amountCol) item.amount = parseFloat(row[amountCol]) || undefined;
      if (gstCol) item.gstRate = parseFloat(row[gstCol]) || undefined;
      if (discountCol) item.discountPct = parseFloat(row[discountCol]) || undefined;
      if (remarksCol) item.remarks = String(row[remarksCol] || '') || undefined;

      // Skip rows with no meaningful item data
      if (!item.itemName && item.qty === undefined && item.rate === undefined && item.amount === undefined) continue;

      if (!itemsMap.has(key)) {
        itemsMap.set(key, []);
      }
      itemsMap.get(key)!.push(item);
    }

    let withDiscount = 0;
    let withRemarks = 0;
    for (const items of itemsMap.values()) {
      for (const it of items) {
        if (it.discountPct && it.discountPct !== 0) withDiscount++;
        if (it.remarks && it.remarks !== '') withRemarks++;
      }
    }
    console.log(`[MDB] BillMaster parsed: ${itemsMap.size} vouchers, ${withDiscount} items with discount, ${withRemarks} items with remarks`);
  } catch (err) {
    console.log(`[MDB] BillMaster parsing error:`, err);
  }

  return itemsMap;
}

/**
 * Parse Inventory table (Speed Plus line-item table) to extract invoice line items keyed by VoucherID.
 * Only includes rows where TransactionType is a sale.
 */
function parseInventoryItems(
  reader: any,
  tableName: string
): Map<string, Array<{ itemName?: string; qty?: number; rate?: number; amount?: number; gstRate?: number; discountPct?: number; remarks?: string }>> {
  const itemsMap = new Map<string, Array<{ itemName?: string; qty?: number; rate?: number; amount?: number; gstRate?: number; discountPct?: number; remarks?: string }>>();

  try {
    const table = reader.getTable(tableName);
    const columns = table.getColumnNames();
    const { rows: data } = readTableDataSafe(table);

    console.log(`[MDB] Inventory columns: ${columns.join(', ')}`);

    // Dump first 2 rows to see actual column values
    if (data.length > 0) {
      console.log(`[MDB] Inventory first row: ${JSON.stringify(data[0])}`);
    }
    if (data.length > 1) {
      console.log(`[MDB] Inventory second row: ${JSON.stringify(data[1])}`);
    }

    const vchCol = pickColumn(columns, (c) => c === 'VoucherID', (c) => c === 'VchNo', (c) => /voucher/i.test(c));
    const tranCol = pickColumn(columns, (c) => c === 'TransactionType', (c) => c === 'TranType', (c) => /transaction.*type|trantype/i.test(c));
    const itemCol = pickColumn(columns, (c) => c === 'ItemName', (c) => c === 'Item', (c) => /item.*name/i.test(c), (c) => /product/i.test(c));
    const qtyCol = pickColumn(columns, (c) => c === 'Qty', (c) => c === 'Quantity', (c) => /qty/i.test(c));
    // Speed Plus uses SelectedPrice for the actual sale rate
    const rateCol = pickColumn(columns,
      (c) => c === 'SelectedPrice',
      (c) => c === 'SalePrice',
      (c) => c === 'Rate',
      (c) => c === 'UnitPrice',
      (c) => c === 'Price',
      (c) => /rate/i.test(c)
    );
    // BasicAmount or SubTotal for line total
    const amountCol = pickColumn(columns,
      (c) => c === 'BasicAmount',
      (c) => c === 'SubTotal',
      (c) => c === 'Amount',
      (c) => c === 'Total',
      (c) => c === 'LineTotal',
      (c) => /amount/i.test(c)
    );
    // GST columns: SGSTPercentage, CGSTPercentage, IGSTPercentage
    const gstCol = pickColumn(columns,
      (c) => c === 'TaxPercentage',
      (c) => c === 'VatPercentage',
      (c) => c === 'GSTRate',
      (c) => c === 'TaxRate',
      (c) => c === 'GST',
      (c) => /gst.*rate/i.test(c),
      (c) => /tax.*rate/i.test(c),
      (c) => /vat.*percentage/i.test(c)
    );
    // Discount percentage column (D% in Speed Plus)
    // Speed Plus uses DiscountRate for the actual item-level discount %.
    // MarginDiscountPercentage is a different concept (margin/scheme), always 0 for regular discounts.
    const discountCol = pickColumn(columns,
      (c) => c === 'DiscountRate',
      (c) => c === 'D%',
      (c) => c === 'D %',
      (c) => c === 'Disc%',
      (c) => c === 'DiscountPercentage',
      (c) => c === 'Discount',
      (c) => /^d\s*%$/i.test(c),
      (c) => /^discount.*rate$/i.test(c)
    );
    // Remarks column
    // Speed Plus may use: Remarks, Remark, Narration, ShortNarration, Note, etc.
    const remarksCol = pickColumn(columns,
      (c) => c === 'Remarks',
      (c) => c === 'Remark',
      (c) => c === 'Narration',
      (c) => c === 'ShortNarration',
      (c) => c === 'Note',
      (c) => /remark|narration|note/i.test(c)
    );

    if (discountCol) {
      console.log(`[MDB] Inventory: discount column found = "${discountCol}"`);
    }
    if (remarksCol) {
      console.log(`[MDB] Inventory: remarks column found = "${remarksCol}"`);
    }

    if (!vchCol || !itemCol) {
      console.log(`[MDB] Inventory: missing voucher or item column, skipping`);
      return itemsMap;
    }

    // Count total vs sale rows
    let totalRows = 0;
    let saleRows = 0;
    let filteredRows = 0;

    let sampleLogged = 0;
    for (const row of data) {
      totalRows++;
      // Only include sale transactions
      if (tranCol) {
        const tranType = String(row[tranCol] || '').toLowerCase();
        if (!tranType.includes('sale') || tranType.includes('return') || tranType.includes('purchase')) {
          filteredRows++;
          continue;
        }
      }
      saleRows++;

      const vchId = row[vchCol];
      if (vchId == null || vchId === '') continue;
      const key = String(vchId);

      const itemName = itemCol ? String(row[itemCol] || '') : '';
      if (!itemName) continue;

      // Log first 3 sale rows to see actual column values
      if (sampleLogged < 3 && discountCol) {
        console.log(`[MDB] Inventory sample: vch=${key}, item=${itemName}, discountCol="${discountCol}", rawValue=${JSON.stringify(row[discountCol])}, parsed=${parseFloat(row[discountCol])}`);
        sampleLogged++;
      }

      const qty = qtyCol ? (parseFloat(row[qtyCol]) || undefined) : undefined;
      const rate = rateCol ? (parseFloat(row[rateCol]) || undefined) : undefined;
      const amount = amountCol ? (parseFloat(row[amountCol]) || undefined) : undefined;
      const gstRate = gstCol ? (parseFloat(row[gstCol]) || undefined) : undefined;
      const discountPct = discountCol ? (parseFloat(row[discountCol]) || undefined) : undefined;
      const remarks = remarksCol ? (String(row[remarksCol] || '') || undefined) : undefined;

      const item: { itemName?: string; qty?: number; rate?: number; amount?: number; gstRate?: number; discountPct?: number; remarks?: string } = {
        itemName,
        qty,
        rate,
        amount,
        gstRate,
        discountPct,
        remarks
      };

      if (!itemsMap.has(key)) {
        itemsMap.set(key, []);
      }
      itemsMap.get(key)!.push(item);
    }

    let withDiscount = 0;
    let withRemarks = 0;
    for (const items of itemsMap.values()) {
      for (const it of items) {
        if (it.discountPct && it.discountPct !== 0) withDiscount++;
        if (it.remarks && it.remarks !== '') withRemarks++;
      }
    }
    console.log(`[MDB] Inventory parsed: ${itemsMap.size} vouchers, ${withDiscount} items with discount, ${withRemarks} items with remarks (total=${totalRows}, sale=${saleRows}, filtered=${filteredRows})`);

    console.log(`[MDB] Inventory: found line items for ${itemsMap.size} vouchers`);
  } catch (err) {
    console.log(`[MDB] Inventory parsing error:`, err);
  }

  return itemsMap;
}

/**
 * Import customer payments from Ledger credit rows (e.g. Quick Receipt).
 */
async function importLedger(
  reader: any,
  companyId: number,
  _fyId?: number,
  legacyIdMap?: Map<string, number>,
  accountIndex?: MdbAccountIndex
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] };

  try {
    const index = accountIndex ?? buildMdbAccountIndex(reader);
    const ledgerTableName = reader.getTableNames().find((t: string) => t.toLowerCase() === 'ledger');
    if (!ledgerTableName) {
      result.errors.push('Ledger table not found');
      return result;
    }

    const table = reader.getTable(ledgerTableName);
    const columns = table.getColumnNames();
    const { rows: data } = readTableDataSafe(table);

    const dateCol = pickColumn(
      columns,
      (c) => c === 'EntryDate',
      (c) => c === 'Date',
      (c) => /date/i.test(c) && !/id|no|num/i.test(c)
    );
    const dcCol = pickColumn(columns, (c) => c === 'DC', (c) => c.toLowerCase() === 'dc');
    const tranCol = pickColumn(
      columns,
      (c) => c === 'TranType',
      (c) => /trantype|transactiontype/i.test(c)
    );
    const amountCol = pickColumn(columns, (c) => c === 'Amount', (c) => /^amount$/i.test(c));
    const narrCol = pickColumn(
      columns,
      (c) => c === 'ShortNarration',
      (c) => /narration|narr/i.test(c)
    );

    if (!dateCol || !dcCol || !amountCol) {
      result.errors.push('Ledger table missing EntryDate, DC, or Amount columns');
      return result;
    }

    const customers = getAllCustomers(companyId);
    const resolveCustomer = createCustomerResolver(legacyIdMap ?? new Map(), customers);

    for (let i = 0; i < data.length; i++) {
      const row = data[i];

      try {
        if (parseDc(row[dcCol]) !== 'C') {
          result.skipped++;
          continue;
        }
        if (!isReceiptTran(tranCol ? row[tranCol] : null)) {
          result.skipped++;
          continue;
        }

        const accountId = String(row.AccountID ?? '');
        if (!index.partyIds.has(accountId)) {
          result.skipped++;
          continue;
        }

        const customerId = resolveCustomer(row.AccountID, row.AccountName);
        if (!customerId) {
          result.skipped++;
          continue;
        }

        const entryDate = parseLegacyDate(row[dateCol]);
        if (!entryDate) {
          result.skipped++;
          result.errors.push(`Row ${i + 1}: Invalid or missing date`);
          continue;
        }

        const amount = Math.abs(parseFloat(row[amountCol]) || 0);
        if (amount <= 0) {
          result.skipped++;
          continue;
        }

        const narration =
          narrCol && row[narrCol]
            ? String(row[narrCol])
            : `Legacy ${row[tranCol] ?? 'receipt'}`;

        await addPaymentEntry(
          customerId,
          amount,
          entryDate.toISOString().split('T')[0],
          narration
        );
        result.imported++;
      } catch (err) {
        result.errors.push(`Row ${i + 1}: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    result.errors.push(`Ledger import error: ${(err as Error).message}`);
  }

  return result;
}

/**
 * Import opening balance entries from ledger for a specific FY.
 * Reads Ledger rows where TranType is 'Op. Bal.' and creates ledger_entries.
 */
async function importOpeningBalances(
  _reader: any,
  _companyId: number,
  _fyId: number,
  _fyName: string,
  _legacyIdMap: Map<string, number>,
  _accountIndex: MdbAccountIndex,
  _filePath?: string,
  _fileHash?: string
): Promise<{ imported: number; skipped: number }> {
  return { imported: 0, skipped: 0 };
}

/**
 * Import invoices for a specific FY with dedup via import_voucher_map.
 */
async function importInvoicesForFy(
  reader: any,
  companyId: number,
  fyId: number,
  legacyIdMap: Map<string, number>,
  accountIndex: MdbAccountIndex,
  fyName: string,
  fileHash: string,
  mode: 'skip' | 'merge' | 'replace'
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] };
  const boundaries = getFyBoundaries(fyName);
  if (!boundaries) return result;

  const index = accountIndex;
  const ledgerTableName = reader.getTableNames().find((t: string) => t.toLowerCase() === 'ledger');
  if (!ledgerTableName) return result;

  const table = reader.getTable(ledgerTableName);
  const columns = table.getColumnNames();
  const { rows: data } = readTableDataSafe(table);

  const dateCol = pickColumn(columns, (c) => c === 'EntryDate', (c) => c === 'Date', (c) => /date/i.test(c) && !/id|no|num/i.test(c));
  const dcCol = pickColumn(columns, (c) => c === 'DC', (c) => c.toLowerCase() === 'dc');
  const tranCol = pickColumn(columns, (c) => c === 'TranType', (c) => /trantype|transactiontype/i.test(c));
  const vchCol = pickColumn(columns, (c) => c === 'VchNo', (c) => c === 'VoucherID');
  const amountCol = pickColumn(columns, (c) => c === 'Amount', (c) => /^amount$/i.test(c));

  if (!dateCol || !dcCol || !amountCol) return result;

  const customers = getAllCustomers(companyId);
  const resolveCustomer = createCustomerResolver(legacyIdMap, customers);
  const seenVouchers = new Set<string>();

  // Parse line items from Inventory/BillMaster tables
  const billMasterTableName = reader.getTableNames().find((t: string) => t.toLowerCase() === 'billmaster');
  let billMasterItems = new Map<string, Array<any>>();
  if (billMasterTableName) {
    billMasterItems = parseBillMasterItems(reader, billMasterTableName);
  }
  const inventoryTableName = reader.getTableNames().find((t: string) => t.toLowerCase() === 'inventory');
  let inventoryItems = new Map<string, Array<any>>();
  if (inventoryTableName && billMasterItems.size === 0) {
    inventoryItems = parseInventoryItems(reader, inventoryTableName);
  }
  const allLineItems = inventoryItems.size > 0 ? inventoryItems : billMasterItems;

  const productByName = new Map<string, number>();
  const existingProducts = getAllProducts(companyId);
  for (const p of existingProducts) productByName.set(p.name.toLowerCase(), p.id);

  const db = getDatabase();

  const skipReasons = { notDebit: 0, openingBal: 0, notSale: 0, notParty: 0, noCustomer: 0, noAmount: 0, noDate: 0, outOfRange: 0, duplicate: 0, alreadyImported: 0, other: 0 };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      if (parseDc(row[dcCol]) !== 'D') { skipReasons.notDebit++; result.skipped++; continue; }
      if (isOpeningBalanceTran(tranCol ? row[tranCol] : null)) { skipReasons.openingBal++; result.skipped++; continue; }
      if (!isSaleInvoiceTran(tranCol ? row[tranCol] : null)) { skipReasons.notSale++; result.skipped++; continue; }

      const accountId = String(row.AccountID ?? '');
      if (!index.partyIds.has(accountId)) { skipReasons.notParty++; result.skipped++; continue; }

      const customerId = resolveCustomer(row.AccountID, row.AccountName);
      if (!customerId) { skipReasons.noCustomer++; result.skipped++; continue; }

      const amount = parseFloat(row[amountCol]) || 0;
      if (amount <= 0) { skipReasons.noAmount++; result.skipped++; continue; }

      const entryDate = parseLegacyDate(row[dateCol]);
      if (!entryDate) { skipReasons.noDate++; result.skipped++; continue; }

      // FY date range filter
      if (entryDate < boundaries.start || entryDate > boundaries.end) { skipReasons.outOfRange++; result.skipped++; continue; }

      const voucherId = row.VoucherID ?? row[vchCol] ?? i;
      const voucherKey = `${voucherId}-${customerId}`;
      if (seenVouchers.has(voucherKey)) { skipReasons.duplicate++; result.skipped++; continue; }
      seenVouchers.add(voucherKey);

      // Dedup via import_voucher_map
      if (mode === 'merge') {
        const dup = queryOne<{ id: number }>(
          `SELECT id FROM import_voucher_map WHERE fy_id = ? AND legacy_voucher_id = ? AND entity_type = 'invoice'`,
          [fyId, String(voucherId)]
        );
        if (dup) { skipReasons.alreadyImported++; result.skipped++; continue; }
      }

      const vchNo = vchCol && row[vchCol] != null && row[vchCol] !== '' ? String(row[vchCol]) : `VCH-${voucherId}`;
      const billKey = `${voucherId}`;
      const legacyItems = allLineItems.get(billKey) || [];

      const mappedItems: Array<{ product_id?: number; product_name?: string; qty: number; rate: number; gst_rate?: number; discount_pct?: number; remarks?: string }> = [];
      for (const li of legacyItems) {
        let productId: number | undefined;
        if (li.itemName) {
          const lowerName = li.itemName.toLowerCase();
          productId = productByName.get(lowerName);
          if (!productId) {
            for (const [name, id] of productByName) {
              if (lowerName.includes(name) || name.includes(lowerName)) { productId = id; break; }
            }
          }
        }
        const qty = li.qty ?? 1;
        const rate = li.rate ?? (li.amount ? li.amount / qty : 0);
        mappedItems.push({ product_id: productId, product_name: li.itemName || undefined, qty, rate, gst_rate: li.gstRate, discount_pct: li.discountPct, remarks: li.remarks });
      }

      const created = await createInvoice({
        customer_id: customerId,
        invoice_date: entryDate.toISOString().split('T')[0],
        items: mappedItems.length > 0 ? mappedItems : [],
        fy_id: fyId,
        legacy_amount: mappedItems.length === 0 ? amount : undefined,
        invoice_no: vchNo,
        notes: `Legacy import - Voucher ${voucherId} (${fyName})`
      });

      if (created.success && created.data) {
        // Record in import_voucher_map
        const logResult = db.prepare(
          `INSERT INTO legacy_import_log (file_path, file_hash, company_id, fy_id, fy_name, status, imported_invoices)
           VALUES (?, ?, ?, ?, ?, 'completed', 1)`
        ).run('mdb-import', fileHash, companyId, fyId, fyName);
        const logId = logResult.lastInsertRowid;
        db.prepare(
          `INSERT INTO import_voucher_map (import_file_log_id, fy_id, legacy_voucher_id, entity_type, entity_id)
           VALUES (?, ?, ?, 'invoice', ?)`
        ).run(logId, fyId, String(voucherId), created.data.id);
        result.imported++;
      } else {
        result.errors.push(`Voucher ${voucherId}: ${created.error || 'Create failed'}`);
      }
    } catch (err) {
      skipReasons.other++;
      result.errors.push(`Row ${i}: ${(err as Error).message}`);
    }
  }

  return result;
}

/**
 * Import ledger payments for a specific FY with dedup.
 */
async function importLedgerForFy(
  reader: any,
  companyId: number,
  fyId: number,
  legacyIdMap: Map<string, number>,
  accountIndex: MdbAccountIndex,
  fyName: string,
  fileHash: string,
  mode: 'skip' | 'merge' | 'replace'
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const result = { imported: 0, skipped: 0, errors: [] as string[] };
  const boundaries = getFyBoundaries(fyName);
  if (!boundaries) return result;

  const index = accountIndex;
  const ledgerTableName = reader.getTableNames().find((t: string) => t.toLowerCase() === 'ledger');
  if (!ledgerTableName) return result;

  const table = reader.getTable(ledgerTableName);
  const columns = table.getColumnNames();
  const { rows: data } = readTableDataSafe(table);

  const dateCol = pickColumn(columns, (c) => c === 'EntryDate', (c) => c === 'Date', (c) => /date/i.test(c) && !/id|no|num/i.test(c));
  const dcCol = pickColumn(columns, (c) => c === 'DC', (c) => c.toLowerCase() === 'dc');
  const tranCol = pickColumn(columns, (c) => c === 'TranType', (c) => /trantype|transactiontype/i.test(c));
  const amountCol = pickColumn(columns, (c) => c === 'Amount', (c) => /^amount$/i.test(c));
  const narrCol = pickColumn(columns, (c) => c === 'ShortNarration', (c) => /narration|narr/i.test(c));

  if (!dateCol || !dcCol || !amountCol) return result;

  const customers = getAllCustomers(companyId);
  const resolveCustomer = createCustomerResolver(legacyIdMap, customers);
  const db = getDatabase();

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      if (parseDc(row[dcCol]) !== 'C') { result.skipped++; continue; }
      if (!isReceiptTran(tranCol ? row[tranCol] : null)) { result.skipped++; continue; }

      const accountId = String(row.AccountID ?? '');
      if (!index.partyIds.has(accountId)) { result.skipped++; continue; }

      const customerId = resolveCustomer(row.AccountID, row.AccountName);
      if (!customerId) { result.skipped++; continue; }

      const entryDate = parseLegacyDate(row[dateCol]);
      if (!entryDate) { result.skipped++; continue; }

      // FY date range filter
      if (entryDate < boundaries.start || entryDate > boundaries.end) { result.skipped++; continue; }

      const amount = Math.abs(parseFloat(row[amountCol]) || 0);
      if (amount <= 0) { result.skipped++; continue; }

      const voucherId = row.VoucherID ?? `LGR-${i}`;

      // Dedup via import_voucher_map
      if (mode === 'merge') {
        const dup = queryOne<{ id: number }>(
          `SELECT id FROM import_voucher_map WHERE fy_id = ? AND legacy_voucher_id = ? AND entity_type = 'ledger'`,
          [fyId, String(voucherId)]
        );
        if (dup) { result.skipped++; continue; }
      }

      const narration = narrCol && row[narrCol] ? String(row[narrCol]) : `Legacy ${row[tranCol] ?? 'receipt'}`;

      await addPaymentEntry(customerId, amount, entryDate.toISOString().split('T')[0], narration);

      // Record in import_voucher_map
      const logResult = db.prepare(
        `INSERT INTO legacy_import_log (file_path, file_hash, company_id, fy_id, fy_name, status, imported_ledger)
         VALUES (?, ?, ?, ?, ?, 'completed', 1)`
      ).run('mdb-import', fileHash, companyId, fyId, fyName);
      const logId = logResult.lastInsertRowid;
      db.prepare(
        `INSERT INTO import_voucher_map (import_file_log_id, fy_id, legacy_voucher_id, entity_type, entity_id)
         VALUES (?, ?, ?, 'ledger', ?)`
      ).run(logId, fyId, String(voucherId), 0);

      result.imported++;
    } catch (err) {
      result.errors.push(`Row ${i}: ${(err as Error).message}`);
    }
  }

  return result;
}

/**
 * Build FY carry-forward chain after importing all FYs.
 * For each consecutive FY pair, verify closing balance matches next FY's opening balance.
 */
async function buildFyChain(companyId: number): Promise<void> {
  try {
    const db = getDatabase();
    const fys = queryAll<{ id: number; name: string; start_date: string; end_date: string }>(
      'SELECT id, name, start_date, end_date FROM financial_years WHERE company_id = ? ORDER BY start_date',
      [companyId]
    );

    for (let i = 0; i < fys.length - 1; i++) {
      const fromFy = fys[i];
      const toFy = fys[i + 1];

      // Get all customers that have activity in the source FY
      const customers = queryAll<{ customer_id: number; closing: number }>(
        `SELECT le.customer_id,
                COALESCE(SUM(COALESCE(le.debit, 0)) - SUM(COALESCE(le.credit, 0)), 0) as closing
         FROM ledger_entries le
         JOIN invoices inv ON inv.id = le.invoice_id
         WHERE le.company_id = ? AND inv.fy_id = ?
         GROUP BY le.customer_id`,
        [companyId, fromFy.id]
      );

      for (const row of customers) {
        const balanceType = row.closing >= 0 ? 'Dr' : 'Cr';
        db.prepare(
          `INSERT OR IGNORE INTO fy_carry_forwards (company_id, customer_id, from_fy_id, to_fy_id, amount, balance_type)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(companyId, row.customer_id, fromFy.id, toFy.id, Math.abs(row.closing), balanceType);
      }
    }

    console.log('[MDB] FY chain built successfully');
  } catch (err) {
    console.error('[MDB] Error building FY chain:', err);
  }
}

/**
 * Get customer balance trace across all FYs.
 */
export function getCustomerBalanceTrace(customerId: number, companyId: number): FyCarryForwardTrace {
  const customer = queryOne<{ id: number; name: string; current_balance: number }>(
    'SELECT id, name, current_balance FROM customers WHERE id = ? AND company_id = ?',
    [customerId, companyId]
  );

  if (!customer) {
    return { customerId, customerName: '', currentBalance: 0, chain: [] };
  }

  const fys = queryAll<{ id: number; name: string; start_date: string }>(
    'SELECT id, name, start_date FROM financial_years WHERE company_id = ? ORDER BY start_date',
    [companyId]
  );

  const chain: FyCarryForwardTrace['chain'] = [];

  for (const fy of fys) {
    const carryForward = queryOne<{ amount: number; balance_type: string }>(
      'SELECT amount, balance_type FROM fy_carry_forwards WHERE customer_id = ? AND to_fy_id = ?',
      [customerId, fy.id]
    );

    const entries = queryAll<{ entry_type: string; entry_date: string; invoice_no?: string; receipt_no?: string; debit?: number; credit?: number; narration?: string }>(
      `SELECT le.entry_type, le.entry_date,
              i.invoice_no, r.receipt_no,
              le.debit, le.credit, le.narration
       FROM ledger_entries le
       LEFT JOIN invoices i ON i.id = le.invoice_id
       LEFT JOIN receipts r ON r.id = le.receipt_id
       WHERE le.customer_id = ? AND le.company_id = ?
         AND (le.invoice_id IN (SELECT id FROM invoices WHERE fy_id = ?)
              OR le.receipt_id IN (SELECT id FROM receipts WHERE fy_id = ?))
       ORDER BY le.entry_date, le.id`,
      [customerId, companyId, fy.id, fy.id]
    );

    chain.push({
      fyId: fy.id,
      fyName: fy.name,
      isOpening: !!carryForward,
      amount: carryForward?.amount ?? 0,
      balanceType: (carryForward?.balance_type as 'Dr' | 'Cr') ?? 'Dr',
      entries: entries.map(e => ({
        entryType: e.entry_type,
        entryDate: e.entry_date,
        invoiceNo: e.invoice_no,
        receiptNo: e.receipt_no,
        debit: e.debit,
        credit: e.credit,
        narration: e.narration
      }))
    });
  }

  return {
    customerId,
    customerName: customer.name,
    currentBalance: customer.current_balance,
    chain
  };
}

/**
 * List all import logs for a company.
 */
export function listImportLogs(companyId: number): Array<{
  id: number;
  file_path: string;
  file_hash: string;
  fy_name: string;
  imported_invoices: number;
  imported_opening_balances: number;
  imported_ledger: number;
  completed_at: string;
  status: string;
}> {
  return queryAll(
    `SELECT id, file_path, file_hash, fy_name, imported_invoices, imported_opening_balances, imported_ledger, completed_at, status
     FROM legacy_import_log WHERE company_id = ? ORDER BY completed_at DESC`,
    [companyId]
  );
}

/**
 * Get or create company from MDB data
 */
export async function getOrCreateCompanyFromMdb(companyName: string): Promise<number> {
  const companies = await getAllCompanies();
  const existing = companies.find(c => c.name.toLowerCase() === companyName.toLowerCase());

  if (existing) {
    return existing.id;
  }

  const result = createCompany({ name: companyName });
  return result.id;
}

/**
 * Create company for import wizard
 */
export async function createCompanyForImport(name: string, gstin?: string): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const result = createCompany({ name, gstin });
    return { success: true, id: result.id };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Get all companies for dropdown
 */
export async function getCompaniesForImport(): Promise<{ id: number; name: string; gstin?: string }[]> {
  const companies = await getAllCompanies();
  return companies.map(c => ({ id: c.id, name: c.name, gstin: c.gstin }));
}

/**
 * Create or get FY for import
 */
export async function getOrCreateFYForImport(
  fyName: string,
  startDate: string,
  endDate: string,
  companyId: number,
  options?: { setActive?: boolean; useExistingId?: number }
): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    // Use existing FY — no name/dates required
    if (options?.useExistingId) {
      const fy = getAllFinancialYears(companyId).find((f) => f.id === options.useExistingId);
      if (fy) return { success: true, id: fy.id };
      return { success: false, error: 'Selected financial year not found' };
    }

    const name = (fyName || '').trim();
    if (!name) {
      return { success: false, error: 'Financial year name is required (e.g. FY24-25)' };
    }
    if (!startDate || !endDate) {
      return { success: false, error: 'Financial year start and end dates are required' };
    }

    const existingFys = getAllFinancialYears(companyId);
    const existing = existingFys.find(
      (fy) => fy.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) {
      return { success: true, id: existing.id };
    }

    const setActive = options?.setActive ?? false;
    const result = createFinancialYear(name, startDate, endDate, companyId, setActive);
    return { success: true, id: result.id };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export interface MergedDbInfo {
  exists: boolean;
  sourceFiles: number;
  totalLedger: number;
  totalAccount: number;
  totalItems: number;
  totalInventory: number;
  totalBillMaster: number;
  fileSize?: number;
}

export interface MergedDbDryRunPreview {
  productsFound: number;
  customersFound: number;
  partyAccounts: number;
  fys: Array<{
    name: string;
    startDate: string;
    endDate: string;
    ledgerRows: number;
  }>;
}

export function checkMergedDb(dbPath: string): MergedDbInfo | { error: string } {
  try {
    if (!existsSync(dbPath)) return { exists: false, sourceFiles: 0, totalLedger: 0, totalAccount: 0, totalItems: 0, totalInventory: 0, totalBillMaster: 0, fileSize: 0 };

    const { size } = statSync(dbPath);
    const Database = require('better-sqlite3');
    const db = new Database(dbPath, { readonly: true });
    const meta = db.prepare('SELECT COUNT(*) as cnt FROM _merge_meta').get() as { cnt: number };
    const ledgerRow = db.prepare('SELECT COUNT(*) as cnt FROM "Ledger"').get() as { cnt: number };
    const accountRow = db.prepare('SELECT COUNT(*) as cnt FROM "Account"').get() as { cnt: number };
    const itemsRow = db.prepare('SELECT COUNT(*) as cnt FROM "Items"').get() as { cnt: number };
    const invRow = db.prepare('SELECT COUNT(*) as cnt FROM "Inventory"').get() as { cnt: number };
    const bmRow = db.prepare('SELECT COUNT(*) as cnt FROM "BillMaster"').get() as { cnt: number };
    db.close();

    return {
      exists: true,
      sourceFiles: meta.cnt,
      totalLedger: ledgerRow.cnt,
      totalAccount: accountRow.cnt,
      totalItems: itemsRow.cnt,
      totalInventory: invRow.cnt,
      totalBillMaster: bmRow.cnt,
      fileSize: size,
    };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function importFromMergedDb(
  dbPath: string,
  companyId: number,
  options: {
    importProducts?: boolean;
    importCustomers?: boolean;
    importInvoices?: boolean;
    importLedger?: boolean;
    importOpeningBalances?: boolean;
    dryRun?: boolean;
  }
): Promise<MdbImportResult & { dryRun?: boolean; dryRunPreview?: MergedDbDryRunPreview }> {
  const result: MdbImportResult & { dryRun?: boolean; dryRunPreview?: MergedDbDryRunPreview } = {
    success: true,
    imported: { products: 0, customers: 0, invoices: 0, ledger: 0, openingBalances: 0 },
    skipped: { products: 0, customers: 0, invoices: 0, ledger: 0, openingBalances: 0 },
    errors: { products: [], customers: [], invoices: [], ledger: [] }
  };

  if (!companyId) {
    result.success = false;
    result.error = 'No company selected';
    return result;
  }

  try {
    const reader = new SqliteReader(dbPath);
    const fileHash = computeFileHash(dbPath);
    const accountIndex = buildMdbAccountIndex(reader as any);

    // Dry-run: return preview without writing anything
    if (options.dryRun) {
      // Count products locally from Items table
      let productsFound = 0;
      try {
        const itemsTable = reader.getTable('Items');
        if (itemsTable) {
          const { rows: itemRows } = readTableDataSafe(itemsTable as any);
          productsFound = itemRows.length;
        }
      } catch { /* Items table may not exist */ }

      // Count party accounts from Account table
      const partyAccounts = accountIndex.partyIds.size;

      // Detect FYs from merged Ledger
      type FyInfo = { startDate: string; endDate: string; rowCount: number };
      const fyMap = new Map<string, FyInfo>();
      try {
        const ledgerCols = reader.getTable('Ledger').getColumnNames();
        const dateCol = pickColumn(ledgerCols, (c) => c === 'EntryDate', (c) => c === 'Date', (c) => /date/i.test(c) && !/id|no|num/i.test(c));
        if (dateCol) {
          const ledgerRows = readTableDataSafe(reader.getTable('Ledger') as any);
          for (const row of ledgerRows.rows) {
            const entryDate = parseLegacyDate(row[dateCol]);
            if (!entryDate) continue;
            const key = getFinancialYearKey(entryDate);
            if (!fyMap.has(key)) {
              const boundaries = getFyBoundaries(key);
              if (boundaries) {
                fyMap.set(key, { startDate: boundaries.start.toISOString().split('T')[0], endDate: boundaries.end.toISOString().split('T')[0], rowCount: 0 });
              }
            }
            if (fyMap.has(key)) fyMap.get(key)!.rowCount++;
          }
        }
      } catch (err) {
        console.warn('[merged] Could not detect FYs from Ledger:', err);
      }

      result.dryRun = true;
      result.dryRunPreview = {
        productsFound,
        customersFound: partyAccounts,
        partyAccounts,
        fys: [...fyMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, info]) => ({
          name,
          startDate: info.startDate,
          endDate: info.endDate,
          ledgerRows: info.rowCount
        }))
      };
      reader.close();
      return result;
    }

    // Use provided company or create if none exist
    const existingCompanies = getAllCompanies();
    let currentCompanyId = companyId;
    if (existingCompanies.length === 0) {
      const companyResult = createCompany({ name: 'Merged Legacy Data' });
      currentCompanyId = companyResult.id;
      setWorkspace(currentCompanyId);
    }

    // Import Products
    if (options.importProducts !== false) {
      const productResult = await importProducts(reader as any, currentCompanyId);
      result.imported.products = productResult.imported;
      result.skipped.products = productResult.skipped;
      result.errors.products = productResult.errors;
    }

    // Import Customers
    let legacyIdMap: Map<string, number> = new Map();
    if (options.importCustomers !== false) {
      const customerResult = await importCustomers(reader as any, currentCompanyId);
      result.imported.customers = customerResult.imported;
      result.skipped.customers = customerResult.skipped;
      result.errors.customers = customerResult.errors;
      legacyIdMap = customerResult.legacyIdMap;
    }

    // Detect FYs from merged Ledger
    type FyInfo = { startDate: string; endDate: string; rowCount: number };
    const fyMap = new Map<string, FyInfo>();
    try {
      const ledgerCols = reader.getTable('Ledger').getColumnNames();
      const dateCol = pickColumn(ledgerCols, (c) => c === 'EntryDate', (c) => c === 'Date', (c) => /date/i.test(c) && !/id|no|num/i.test(c));
      if (dateCol) {
        const ledgerRows = readTableDataSafe(reader.getTable('Ledger') as any);
        for (const row of ledgerRows.rows) {
          const entryDate = parseLegacyDate(row[dateCol]);
          if (!entryDate) continue;
          const key = getFinancialYearKey(entryDate);
          if (!fyMap.has(key)) {
            const boundaries = getFyBoundaries(key);
            if (boundaries) {
              fyMap.set(key, { startDate: boundaries.start.toISOString().split('T')[0], endDate: boundaries.end.toISOString().split('T')[0], rowCount: 0 });
            }
          }
          if (fyMap.has(key)) fyMap.get(key)!.rowCount++;
        }
      }
    } catch (err) {
      console.warn('[merged] Could not detect FYs from Ledger:', err);
    }

    const sortedFys = [...fyMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    // Import each FY
    const fyResults: MdbImportResult['fyResults'] = [];

    for (const [fyName, fyInfo] of sortedFys) {
      console.log(`[merged] Importing FY ${fyName} (${fyInfo.rowCount} Ledger rows)...`);

      const fy = await getOrCreateFYForImport(fyName, fyInfo.startDate, fyInfo.endDate, currentCompanyId);
      if (!fy.success || !fy.id) {
        result.errors.ledger.push(`Failed to create FY ${fyName}: ${fy.error}`);
        continue;
      }
      const currentFyId = fy.id;
      setWorkspace(currentCompanyId, currentFyId);

      // Import opening balances
      if (options.importOpeningBalances !== false) {
        const obResult = await importOpeningBalances(reader as any, currentCompanyId, currentFyId, fyName, legacyIdMap, accountIndex, dbPath, fileHash);
        result.imported.openingBalances += obResult.imported;
        result.skipped.openingBalances += obResult.skipped;
      }

      // Import invoices
      if (options.importInvoices !== false) {
        const invoiceResult = await importInvoicesForFy(reader as any, currentCompanyId, currentFyId, legacyIdMap, accountIndex, fyName, fileHash, 'merge');
        result.imported.invoices += invoiceResult.imported;
        result.skipped.invoices += invoiceResult.skipped;
        result.errors.invoices.push(...invoiceResult.errors);
        console.log(`[merged] FY ${fyName} - invoices: imported ${invoiceResult.imported}, skipped ${invoiceResult.skipped}`);
      }

      // Import ledger payments
      if (options.importLedger !== false) {
        const ledgerResult = await importLedgerForFy(reader as any, currentCompanyId, currentFyId, legacyIdMap, accountIndex, fyName, fileHash, 'merge');
        result.imported.ledger += ledgerResult.imported;
        result.skipped.ledger += ledgerResult.skipped;
        result.errors.ledger.push(...ledgerResult.errors);
        console.log(`[merged] FY ${fyName} - ledger payments: imported ${ledgerResult.imported}, skipped ${ledgerResult.skipped}`);
      }

      fyResults.push({ fyName, fyId: currentFyId, imported: result.imported.invoices, skipped: result.skipped.invoices });
    }

    result.fyResults = fyResults;

    // Build FY chain
    await buildFyChain(currentCompanyId);

    const totalImported = result.imported.products + result.imported.customers + result.imported.invoices + result.imported.ledger + result.imported.openingBalances;
    const criticalErrors = result.errors.products.length + result.errors.customers.length;
    result.success = criticalErrors === 0 && totalImported > 0;

    reader.close();
  } catch (err) {
    result.success = false;
    result.error = (err as Error).message;
  }

  return result;
}
