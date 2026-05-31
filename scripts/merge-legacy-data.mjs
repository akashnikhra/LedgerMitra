import { readFileSync, readdirSync, existsSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';
import MDBReader from 'mdb-reader';
import initSqlJs from 'sql.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Accept --cwd, --data-dir, and --output-dir arguments
const cwdArg = process.argv.find(a => a.startsWith('--cwd='));
const dataDirArg = process.argv.find(a => a.startsWith('--data-dir='));
const outputDirArg = process.argv.find(a => a.startsWith('--output-dir='));
const PROJECT_ROOT = cwdArg ? cwdArg.split('=')[1] : join(__dirname, '..');
const DATA_DIR = dataDirArg ? dataDirArg.split('=')[1] : join(PROJECT_ROOT, 'Upload', 'Data');
const OUTPUT_DIR = outputDirArg ? outputDirArg.split('=')[1] : join(PROJECT_ROOT, 'Upload', 'Merged');
const OUTPUT_PATH = join(OUTPUT_DIR, 'merged.db');

function computeFileHash(filePath) {
  const buffer = readFileSync(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

function collectSourceFiles() {
  const files = [];

  const folders = readdirSync(DATA_DIR)
    .filter(d => d.startsWith('Data '))
    .sort((a, b) => {
      const na = parseInt(a.replace('Data ', ''), 10);
      const nb = parseInt(b.replace('Data ', ''), 10);
      return na - nb;
    });

  for (const folder of folders) {
    const folderPath = join(DATA_DIR, folder);
    if (!statSync(folderPath).isDirectory()) continue;

    const entries = readdirSync(folderPath).filter(f => /\.(mdb|bmw|accdb)$/i.test(f));

    const mainFile = entries.find(f => /^spd\.mdb$/i.test(f));
    const backupFiles = entries.filter(f => f !== mainFile).sort();

    const ordered = [];
    if (mainFile) ordered.push(mainFile);
    ordered.push(...backupFiles);

    for (const entry of ordered) {
      const filePath = join(folderPath, entry);
      const hash = computeFileHash(filePath);

      files.push({
        folder,
        fileName: entry,
        filePath,
        fileHash: hash,
        fileSize: statSync(filePath).size,
        label: `${folder}/${entry}`,
      });
    }
  }

  return files;
}

function getPrefix(sourceFile, allFiles) {
  const folder = sourceFile.folder;
  const folderNum = folder.replace('Data ', '');
  const isBackup = sourceFile.fileName.toLowerCase() !== 'spd.mdb';

  if (!isBackup) return `D${folderNum}`;

  const backups = allFiles
    .filter(f => f.folder === folder && f.fileName.toLowerCase() !== 'spd.mdb')
    .sort((a, b) => a.fileName.localeCompare(b.fileName));

  const idx = backups.indexOf(sourceFile);
  return `D${folderNum}-B${idx + 1}`;
}

function stringifyValue(val) {
  if (val == null) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString();
  return String(val);
}

function remapVoucherId(row, voucherColumn, prefix) {
  const original = String(row[voucherColumn] ?? '').trim();
  if (!original || original === '0' || original === 'null') return original;
  return `${prefix}-${original}`;
}

async function main() {
  console.log('=== LedgerMitra — Legacy Data Merge Utility ===\n');

  if (!existsSync(DATA_DIR)) {
    console.error(`Error: Data directory not found at ${DATA_DIR}`);
    process.exit(1);
  }

  const sourceFiles = collectSourceFiles();
  if (sourceFiles.length === 0) {
    console.error('No MDB files found in Upload/Data/');
    process.exit(1);
  }

  console.log(`Found ${sourceFiles.length} source file(s):`);
  for (const f of sourceFiles) {
    const prefix = getPrefix(f, sourceFiles);
    const sizeMB = (f.fileSize / 1024 / 1024).toFixed(1);
    console.log(`  [${prefix.padEnd(8)}] ${f.label.padEnd(35)} ${sizeMB} MB`);
  }
  console.log('');

  // Init SQL.js — locate wasm relative to this script
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const SQL = await initSqlJs({ locateFile: file => join(scriptDir, file) });

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const db = new SQL.Database();
  db.run('PRAGMA page_size = 4096');
  db.run('PRAGMA synchronous = OFF');

  // Use first file as schema reference
  const refBuf = readFileSync(sourceFiles[0].filePath);
  const refReader = new MDBReader(refBuf);

  // Create tables with trace columns
  const refLedgerCols = refReader.getTable('Ledger').getColumnNames();
  const ledgerColDefs = refLedgerCols.map(c => `"${c}" TEXT`).concat([
    '"_source" TEXT',
    '"_original_voucher_id" TEXT',
    '"_voucher_prefix" TEXT',
  ]);
  db.run(`CREATE TABLE IF NOT EXISTS "Ledger" (${ledgerColDefs.join(', ')})`);

  const refAccountCols = refReader.getTable('Account').getColumnNames();
  const accountColDefs = refAccountCols.map(c => `"${c}" TEXT`).concat(['"_source" TEXT']);
  db.run(`CREATE TABLE IF NOT EXISTS "Account" (${accountColDefs.join(', ')})`);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_account_id ON "Account"("AccountID")`);

  const refItemsCols = refReader.getTable('Items').getColumnNames();
  const itemsColDefs = refItemsCols.map(c => `"${c}" TEXT`).concat(['"_source" TEXT']);
  db.run(`CREATE TABLE IF NOT EXISTS "Items" (${itemsColDefs.join(', ')})`);
  db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_items_id ON "Items"("ItemID")`);

  const refInvCols = refReader.getTable('Inventory').getColumnNames();
  const invColDefs = refInvCols.map(c => `"${c}" TEXT`).concat([
    '"_source" TEXT',
    '"_original_voucher_id" TEXT',
  ]);
  db.run(`CREATE TABLE IF NOT EXISTS "Inventory" (${invColDefs.join(', ')})`);

  const refBMCols = refReader.getTable('BillMaster').getColumnNames();
  const bmColDefs = refBMCols.map(c => `"${c}" TEXT`).concat([
    '"_source" TEXT',
    '"_original_voucher_id" TEXT',
  ]);
  db.run(`CREATE TABLE IF NOT EXISTS "BillMaster" (${bmColDefs.join(', ')})`);

  const fyCols = refReader.getTableNames().includes('FinancialYear')
    ? refReader.getTable('FinancialYear').getColumnNames()
    : ['StartDate', 'EndDate'];
  const fyColDefs = fyCols.map(c => `"${c}" TEXT`).concat(['"_source" TEXT']);
  db.run(`CREATE TABLE IF NOT EXISTS "FinancialYear" (${fyColDefs.join(', ')})`);

  db.run(`CREATE TABLE IF NOT EXISTS "_merge_meta" (
    "source_file" TEXT,
    "file_hash" TEXT,
    "rows_ledger" INTEGER,
    "rows_account" INTEGER,
    "rows_items" INTEGER,
    "rows_inventory" INTEGER,
    "rows_billmaster" INTEGER,
    "processed_at" TEXT
  )`);

  const startTime = Date.now();
  const allStats = [];

  for (const sourceFile of sourceFiles) {
    const prefix = getPrefix(sourceFile, sourceFiles);
    const sourceLabel = sourceFile.label;

    console.log(`Processing: ${sourceLabel} (prefix: ${prefix})...`);

    try {
      const buf = readFileSync(sourceFile.filePath);
      const reader = new MDBReader(buf);

      // === Account (deduped by AccountID) ===
      let accountNew = 0;
      try {
        const table = reader.getTable('Account');
        const cols = table.getColumnNames();
        const data = table.getData();
        const stmt = db.prepare(`INSERT OR IGNORE INTO "Account" (${cols.map(c => `"${c}"`).concat(['"_source"']).join(', ')}) VALUES (${cols.map(() => '?').concat(['?']).join(', ')})`);
        for (const row of data) {
          const idVal = stringifyValue(row.AccountID ?? row.ID);
          if (!idVal) continue;
          const values = cols.map(c => stringifyValue(row[c]));
          values.push(sourceLabel);
          stmt.run(values);
          accountNew++;
        }
        stmt.free();
      } catch (err) {
        console.warn(`  Account: ${err.message}`);
      }

      // === Items (deduped by ItemID) ===
      let itemsNew = 0;
      try {
        const table = reader.getTable('Items');
        const cols = table.getColumnNames();
        const data = table.getData();
        const stmt = db.prepare(`INSERT OR IGNORE INTO "Items" (${cols.map(c => `"${c}"`).concat(['"_source"']).join(', ')}) VALUES (${cols.map(() => '?').concat(['?']).join(', ')})`);
        for (const row of data) {
          const idVal = stringifyValue(row.ItemID);
          if (!idVal) continue;
          const values = cols.map(c => stringifyValue(row[c]));
          values.push(sourceLabel);
          stmt.run(values);
          itemsNew++;
        }
        stmt.free();
      } catch (err) {
        console.warn(`  Items: ${err.message}`);
      }

      // === Ledger (appended with prefixed VoucherID) ===
      let ledgerCount = 0;
      try {
        const table = reader.getTable('Ledger');
        const cols = table.getColumnNames();
        const vchColIdx = cols.indexOf('VoucherID');
        const data = table.getData();
        const outCols = cols.concat(['_source', '_original_voucher_id', '_voucher_prefix']);
        const placeholders = cols.map(() => '?').concat(['?', '?', '?']);
        const stmt = db.prepare(`INSERT INTO "Ledger" (${outCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`);
        for (const row of data) {
          const originalVch = vchColIdx >= 0 ? stringifyValue(row.VoucherID) ?? '' : '';
          const remapped = vchColIdx >= 0 ? remapVoucherId(row, 'VoucherID', prefix) : '';
          const values = cols.map(c => stringifyValue(row[c]));
          if (vchColIdx >= 0) values[vchColIdx] = remapped;
          values.push(sourceLabel, originalVch, prefix);
          stmt.run(values);
          ledgerCount++;
        }
        stmt.free();
      } catch (err) {
        console.warn(`  Ledger: ${err.message}`);
      }

      // === Inventory (appended with remapped VoucherID) ===
      let invCount = 0;
      try {
        const table = reader.getTable('Inventory');
        const cols = table.getColumnNames();
        const vchColIdx = cols.indexOf('VoucherID');
        const data = table.getData();
        const outCols = cols.concat(['_source', '_original_voucher_id']);
        const placeholders = cols.map(() => '?').concat(['?', '?']);
        const stmt = db.prepare(`INSERT INTO "Inventory" (${outCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`);
        for (const row of data) {
          const originalVch = vchColIdx >= 0 ? stringifyValue(row.VoucherID) ?? '' : '';
          const remapped = vchColIdx >= 0 ? remapVoucherId(row, 'VoucherID', prefix) : '';
          const values = cols.map(c => stringifyValue(row[c]));
          if (vchColIdx >= 0) values[vchColIdx] = remapped;
          values.push(sourceLabel, originalVch);
          stmt.run(values);
          invCount++;
        }
        stmt.free();
      } catch (err) {
        console.warn(`  Inventory: ${err.message}`);
      }

      // === BillMaster (appended with remapped VoucherID) ===
      let bmCount = 0;
      try {
        const table = reader.getTable('BillMaster');
        const cols = table.getColumnNames();
        const vchColIdx = cols.indexOf('VoucherID');
        const data = table.getData();
        const outCols = cols.concat(['_source', '_original_voucher_id']);
        const placeholders = cols.map(() => '?').concat(['?', '?']);
        const stmt = db.prepare(`INSERT INTO "BillMaster" (${outCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`);
        for (const row of data) {
          const originalVch = vchColIdx >= 0 ? stringifyValue(row.VoucherID) ?? '' : '';
          const remapped = vchColIdx >= 0 ? remapVoucherId(row, 'VoucherID', prefix) : '';
          const values = cols.map(c => stringifyValue(row[c]));
          if (vchColIdx >= 0) values[vchColIdx] = remapped;
          values.push(sourceLabel, originalVch);
          stmt.run(values);
          bmCount++;
        }
        stmt.free();
      } catch (err) {
        console.warn(`  BillMaster: ${err.message}`);
      }

      // === FinancialYear ===
      let fyCount = 0;
      try {
        if (reader.getTableNames().includes('FinancialYear')) {
          const table = reader.getTable('FinancialYear');
          const cols = table.getColumnNames();
          const data = table.getData();
          const colList = cols.concat(['_source']);
          const vals = cols.map(() => '?').concat(['?']);
          const stmt = db.prepare(`INSERT OR IGNORE INTO "FinancialYear" (${colList.map(c => `"${c}"`).join(', ')}) VALUES (${vals.join(', ')})`);
          for (const row of data) {
            const values = cols.map(c => stringifyValue(row[c]));
            values.push(sourceLabel);
            stmt.run(values);
            fyCount++;
          }
          stmt.free();
        }
      } catch (err) {
        console.warn(`  FinancialYear: ${err.message}`);
      }

      const stats = { source: sourceLabel, ledger: ledgerCount, account: accountNew, items: itemsNew, inventory: invCount, billmaster: bmCount, fy: fyCount };
      allStats.push(stats);
      console.log(`  → Ledger:${ledgerCount} Account:${accountNew} Items:${itemsNew} Inventory:${invCount} BillMaster:${bmCount} FY:${fyCount}`);

      db.run(`INSERT INTO "_merge_meta" (source_file, file_hash, rows_ledger, rows_account, rows_items, rows_inventory, rows_billmaster, processed_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [sourceFile.label, sourceFile.fileHash, ledgerCount, accountNew, itemsNew, invCount, bmCount]);

    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      allStats.push({ source: sourceLabel, ledger: 0, account: 0, items: 0, inventory: 0, billmaster: 0, fy: 0 });
    }
  }

  // Create indexes
  console.log('\nCreating indexes...');
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_ledger_voucher ON "Ledger"("VoucherID")`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ledger_entrydate ON "Ledger"("EntryDate")`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ledger_date ON "Ledger"("Date")`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ledger_account ON "Ledger"("AccountID")`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ledger_trantype ON "Ledger"("TranType")`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_ledger_source ON "Ledger"("_source")`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_inv_voucher ON "Inventory"("VoucherID")`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_bm_voucher ON "BillMaster"("VoucherID")`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_account_name ON "Account"("AccountName")`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_items_name ON "Items"("ItemName")`);
    console.log('Indexes created.');
  } catch (err) {
    console.warn('Index creation warning:', err.message);
  }

  // Write to file
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(OUTPUT_PATH, buffer);
  db.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s.`);

  // Summary
  console.log('\n=== Merge Summary ===\n');
  let tLedger = 0, tAccount = 0, tItems = 0, tInv = 0, tBM = 0;
  console.log('Source files processed:');
  for (const s of allStats) {
    console.log(`  ${s.source.padEnd(35)} Ledger:${String(s.ledger).padStart(6)} Account:${String(s.account).padStart(4)} Items:${String(s.items).padStart(5)}`);
    tLedger += s.ledger; tAccount += s.account; tItems += s.items; tInv += s.inventory; tBM += s.billmaster;
  }
  console.log(`\nTotal: Ledger=${tLedger} Account=${tAccount} (deduped) Items=${tItems} (deduped) Inventory=${tInv} BillMaster=${tBM}`);
  console.log(`\nOutput: ${OUTPUT_PATH}`);
  const sizeMB = (statSync(OUTPUT_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`Size: ${sizeMB} MB`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
