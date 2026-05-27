import Database from 'better-sqlite3';

export class SqliteTable {
  private db: Database.Database;
  private tableName: string;
  private _columnNames: string[];
  private _rowCount: number;
  private _allData: Record<string, unknown>[] | null = null;

  constructor(db: Database.Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;

    const colInfo = db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string }>;
    this._columnNames = colInfo.map(c => c.name);

    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM "${tableName}"`).get() as { cnt: number };
    this._rowCount = countRow.cnt;
  }

  get name(): string {
    return this.tableName;
  }

  get rowCount(): number {
    return this._rowCount;
  }

  getColumnNames(): string[] {
    return this._columnNames;
  }

  getColumn(name: string): { name: string; type: string } {
    return { name, type: 'TEXT' };
  }

  getColumns(): Array<{ name: string; type: string }> {
    return this._columnNames.map(name => ({ name, type: 'TEXT' }));
  }

  getData(options?: { rowLimit?: number; rowOffset?: number }): Record<string, unknown>[] {
    if (!this._allData) {
      this._allData = this.db.prepare(`SELECT * FROM "${this.tableName}"`).all() as Record<string, unknown>[];
    }

    if (!options) return this._allData;

    const offset = options.rowOffset ?? 0;
    const limit = options.rowLimit ?? this._allData.length;

    return this._allData.slice(offset, offset + limit);
  }
}

export class SqliteReader {
  private db: Database.Database;
  private tableCache: Map<string, SqliteTable> = new Map();
  private _tableNames: string[];

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true });

    const tables = this.db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_merge_%' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    ).all() as Array<{ name: string }>;
    this._tableNames = tables.map(t => t.name);
  }

  getTableNames(): string[] {
    return [...this._tableNames];
  }

  getTable(name: string): SqliteTable {
    const normalized = this._tableNames.find(t => t.toLowerCase() === name.toLowerCase());
    if (!normalized) {
      throw new Error(`Table "${name}" not found in merged database`);
    }

    if (!this.tableCache.has(normalized)) {
      this.tableCache.set(normalized, new SqliteTable(this.db, normalized));
    }

    return this.tableCache.get(normalized)!;
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
