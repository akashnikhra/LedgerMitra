import { readFileSync } from 'fs';
import MDBReader from 'mdb-reader';
import initSqlJs from 'sql.js';

async function main() {
  const buf = readFileSync('Upload/Data/Data 1/spd.mdb');
  const r = new MDBReader(buf);
  const t = r.getTable('Ledger');
  const data = t.getData({ rowLimit: 5 });
  const cols = t.getColumnNames();

  const SQL = await initSqlJs();
  const db = new SQL.Database();

  const colDefs = cols.map(c => `"${c}" TEXT`);
  db.run(`CREATE TABLE "Ledger" (${colDefs.join(', ')})`);

  // Now alter to add NOT NULL columns
  db.run(`ALTER TABLE "Ledger" ADD COLUMN "_source" TEXT`);
  db.run(`ALTER TABLE "Ledger" ADD COLUMN "_original_voucher_id" TEXT`);
  db.run(`ALTER TABLE "Ledger" ADD COLUMN "_voucher_prefix" TEXT`);

  const outCols = cols.concat(['_source', '_original_voucher_id', '_voucher_prefix']);

  for (let ri = 0; ri < data.length; ri++) {
    const row = data[ri];
    const values = cols.map(c => {
      const v = row[c];
      if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString();
      if (v == null) return null;
      return String(v);
    });

    values.push('Data 1/spd.mdb', String(row.VoucherID ?? ''), 'D1');
    console.log(`Row ${ri}: cols values=${values.length}, null count=${values.filter(v => v === null).length}`);

    const placeholders = outCols.map(() => '?');
    const sql = `INSERT INTO "Ledger" (${outCols.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`;
    console.log(`SQL: ${sql.substring(0, 100)}...`);
    const stmt = db.prepare(sql);
    stmt.run(...values);
    stmt.free();
    console.log(`Row ${ri}: OK`);
  }

  const count = db.exec('SELECT COUNT(*) as c FROM Ledger');
  console.log('Total rows:', JSON.stringify(count[0].values));
  db.close();
}

main().catch(e => console.error(e));
