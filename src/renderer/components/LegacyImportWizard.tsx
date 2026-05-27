import { useEffect, useState } from 'react';
import type { MdbFileInfo, MdbFullAnalysis, MdbImportResult, DetectedFY, MdbFileImportStatus } from '@shared/types';
import DataTableModal from './DataTableModal';
import SearchableSelect from './SearchableSelect';

type ImportMode = 'skip' | 'merge' | 'replace';

interface FySelection {
  fy: DetectedFY;
  checked: boolean;
  mode: ImportMode;
  status: 'pending' | 'importing' | 'done' | 'error';
  result?: { imported: number; skipped: number };
}

const STEPS = ['Select file', 'Analyze', 'Company & FY', 'Import'];

const COLUMNS: Record<string, { key: string; label: string; editable?: boolean }[]> = {
  products: [
    { key: 'name', label: 'Name', editable: true },
    { key: 'code', label: 'Code', editable: true },
    { key: 'price', label: 'Price', editable: true },
    { key: 'stock', label: 'Stock', editable: true }
  ],
  customers: [
    { key: 'name', label: 'Name', editable: true },
    { key: 'email', label: 'Email', editable: true },
    { key: 'phone', label: 'Phone', editable: true },
    { key: 'balance', label: 'Balance', editable: true }
  ],
  invoices: [
    { key: 'number', label: 'Number', editable: true },
    { key: 'date', label: 'Date', editable: true },
    { key: 'customer', label: 'Customer', editable: true },
    { key: 'amount', label: 'Amount', editable: true },
    { key: 'status', label: 'Status', editable: true }
  ],
  ledger: [
    { key: 'date', label: 'Date', editable: true },
    { key: 'account', label: 'Account', editable: true },
    { key: 'debit', label: 'Debit', editable: true },
    { key: 'credit', label: 'Credit', editable: true },
    { key: 'description', label: 'Description', editable: true }
  ]
};

export default function LegacyImportWizard() {
  const [step, setStep] = useState(1);
  const [files, setFiles] = useState<MdbFileInfo[]>([]);
  const [selected, setSelected] = useState<MdbFileInfo | null>(null);
  const [password, setPassword] = useState('allthebest');
  const [analysis, setAnalysis] = useState<MdbFullAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importStatus, setImportStatus] = useState<MdbFileImportStatus | null>(null);
  const [fySelections, setFySelections] = useState<FySelection[]>([]);
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
  const [companyId, setCompanyId] = useState<number | ''>('');
  const [newCompany, setNewCompany] = useState('');
  const [importing, setImporting] = useState(false);
  const [overallResult, setOverallResult] = useState<MdbImportResult | null>(null);
  const [error, setError] = useState('');
  const [previewData, setPreviewData] = useState<{
    products: unknown[];
    customers: unknown[];
    invoices: unknown[];
    ledger: unknown[];
  }>({ products: [], customers: [], invoices: [], ledger: [] });
  const [previewColumns, setPreviewColumns] = useState<{
    products: { key: string; label: string; editable?: boolean }[];
    customers: { key: string; label: string; editable?: boolean }[];
    invoices: { key: string; label: string; editable?: boolean }[];
    ledger: { key: string; label: string; editable?: boolean }[];
  }>({ products: [], customers: [], invoices: [], ledger: [] });

  const [modalType, setModalType] = useState<'products' | 'customers' | 'invoices' | 'ledger' | null>(null);
  const [legacyPaths, setLegacyPaths] = useState<string[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(true);

  async function loadFiles() {
    setLoadingFiles(true);
    setError('');
    try {
      const [list, paths] = await Promise.all([
        window.electronAPI.mdbListFiles(),
        window.electronAPI.mdbLegacyPaths()
      ]);
      setFiles(list);
      setLegacyPaths(paths);
    } catch (e) {
      setError((e as Error).message || 'Could not scan legacy folders');
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  }

  useEffect(() => {
    loadFiles();
    window.electronAPI.mdbGetCompanies().then(setCompanies);
  }, []);

  async function analyze() {
    if (!selected) return;
    setAnalyzing(true);
    setError('');
    try {
      const [res, status] = await Promise.all([
        window.electronAPI.mdbAnalyze(selected.path, password) as Promise<MdbFullAnalysis>,
        window.electronAPI.mdbCheckImportStatus(selected.path) as Promise<MdbFileImportStatus>
      ]);

      if (!res.success) {
        setError(res.error || 'Analysis failed');
        return;
      }

      setAnalysis(res);
      setImportStatus(status);

      // Initialize FY selections from detected FYs
      if (status.detectedFYs.length > 0) {
        const selections: FySelection[] = status.detectedFYs.map((fy) => {
          const prevImport = status.previouslyImportedFYs.find(
            (p) => p.fyName === fy.name
          );
          return {
            fy,
            checked: !prevImport, // auto-check if not previously imported
            mode: prevImport ? 'merge' as ImportMode : 'replace' as ImportMode,
            status: 'pending' as const,
            result: undefined
          };
        });
        setFySelections(selections);
      }

      // Populate preview data from analysis tables
      const tables = res.tables || [];
      const productTable = tables.find((t) => t.name.toLowerCase() === 'items' || t.name.toLowerCase().includes('product'));
      const customerTable = tables.find((t) => t.name.toLowerCase() === 'account' || t.name.toLowerCase().includes('customer'));
      const invoiceTable = tables.find((t) => t.name.toLowerCase() === 'billmaster' || t.name.toLowerCase().includes('invoice'));
      const ledgerTable = tables.find((t) => t.name.toLowerCase() === 'ledger');

      function makeColumns(cols: string[]) {
        return cols.map((c) => ({ key: c, label: c, editable: true }));
      }

      setPreviewData({
        products: productTable?.sampleRows?.slice(0, 50) || [],
        customers: customerTable?.sampleRows?.slice(0, 50) || [],
        invoices: invoiceTable?.sampleRows?.slice(0, 50) || [],
        ledger: ledgerTable?.sampleRows?.slice(0, 50) || []
      });
      setPreviewColumns({
        products: productTable ? makeColumns(productTable.columns) : COLUMNS.products,
        customers: customerTable ? makeColumns(customerTable.columns) : COLUMNS.customers,
        invoices: invoiceTable ? makeColumns(invoiceTable.columns) : COLUMNS.invoices,
        ledger: ledgerTable ? makeColumns(ledgerTable.columns) : COLUMNS.ledger
      });

      if (res.companyName && !newCompany) setNewCompany(res.companyName);
      setStep(2);
    } finally {
      setAnalyzing(false);
    }
  }

  async function resolveCompanyId(): Promise<number | null> {
    let cid = companyId as number;
    if (!cid && newCompany.trim()) {
      const cr = await window.electronAPI.mdbCreateCompany(newCompany.trim());
      if (!cr.success || !cr.id) {
        setError(cr.error || 'Could not create company');
        return null;
      }
      cid = cr.id;
      setCompanyId(cid);
    }
    if (!cid) {
      setError('Select or create a company');
      return null;
    }
    return cid;
  }

  async function runImport() {
    if (!selected || !analysis) return;

    const cid = await resolveCompanyId();
    if (!cid) return;

    const checkedFys = fySelections.filter((s) => s.checked);
    if (checkedFys.length === 0) {
      setError('Select at least one financial year to import');
      return;
    }

    setImporting(true);
    setError('');
    setOverallResult(null);
    setStep(4);

    // Mark all selected FYs as 'importing'
    setFySelections((prev) =>
      prev.map((s) => (s.checked ? { ...s, status: 'importing' as const } : s))
    );

    let totalImported = 0;
    let totalSkipped = 0;
    const fyResults: MdbImportResult['fyResults'] = [];

    for (const selection of checkedFys) {
      try {
        const res = (await window.electronAPI.mdbImportFy({
          filePath: selected.path,
          password,
          companyId: cid,
          fyName: selection.fy.name,
          fyStartDate: selection.fy.startDate,
          fyEndDate: selection.fy.endDate,
          options: {
            mode: selection.mode,
            importProducts: true,
            importCustomers: true,
            importInvoices: true,
            importLedger: true,
            importOpeningBalances: true
          }
        })) as MdbImportResult;

        setFySelections((prev) =>
          prev.map((s) =>
            s.fy.name === selection.fy.name
              ? { ...s, status: 'done' as const, result: { imported: res.imported.invoices + res.imported.openingBalances, skipped: res.skipped.invoices } }
              : s
          )
        );
        fyResults.push({
          fyName: selection.fy.name,
          fyId: 0,
          imported: res.imported.invoices + res.imported.openingBalances,
          skipped: res.skipped.invoices
        });
        totalImported += res.imported.invoices + res.imported.openingBalances;
        totalSkipped += res.skipped.invoices;

        if (!res.success) {
          setError(`FY ${selection.fy.name}: ${res.error || 'Issues during import'}`);
        }
      } catch (e) {
        setFySelections((prev) =>
          prev.map((s) =>
            s.fy.name === selection.fy.name
              ? { ...s, status: 'error' as const }
              : s
          )
        );
        setError(`FY ${selection.fy.name}: ${(e as Error).message}`);
      }
    }

    setOverallResult({
      success: totalImported > 0,
      imported: { products: 0, customers: 0, invoices: totalImported, ledger: 0, openingBalances: 0 },
      skipped: { products: 0, customers: 0, invoices: totalSkipped, ledger: 0, openingBalances: 0 },
      errors: { products: [], customers: [], invoices: [], ledger: [] },
      fyResults
    });
    setImporting(false);
  }

  const detectedName = analysis?.suggestedFY?.name;

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>Legacy data import</h2>
      <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        Select file → Analyze → Choose company & financial year → Import products, customers, invoices, and ledger.
      </p>

      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`wizard-step ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Step 1: Select legacy file */}
      {step === 1 && (
        <div className="card">
          {legacyPaths.length > 0 && (
            <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
              Scanning: {legacyPaths.join(' · ')}
            </p>
          )}
          <div className="form-group">
            <label>MDB password</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Size</th>
                <th>Modified</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr
                  key={f.path}
                  className={selected?.path === f.path ? 'selected' : ''}
                  onClick={() => setSelected(f)}
                >
                  <td>{f.name}</td>
                  <td>{(f.size / 1024 / 1024).toFixed(1)} MB</td>
                  <td>{new Date(f.modifiedDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loadingFiles && <p style={{ marginTop: '1rem', color: 'var(--muted)' }}>Scanning…</p>}
          {!loadingFiles && files.length === 0 && (
            <p style={{ marginTop: '1rem', color: 'var(--muted)' }}>No MDB/BMW files found.</p>
          )}
          <div className="row-actions">
            <button type="button" className="btn-secondary btn" onClick={loadFiles}>
              Refresh
            </button>
            <button className="btn" disabled={!selected || analyzing} onClick={analyze}>
              {analyzing ? 'Analyzing…' : 'Analyze file →'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Analysis results */}
      {step === 2 && analysis && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Analysis results</h3>
          <p>
            <strong>File:</strong> {selected?.name}
          </p>
          <p style={{ marginTop: '0.5rem' }}>
            <strong>Detected company:</strong> {analysis.companyName || '—'}
          </p>
          {analysis.dateRange?.min && (
            <p style={{ fontSize: '0.9rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
              Date range: {new Date(analysis.dateRange.min).toLocaleDateString()}
              {analysis.dateRange.max &&
                ` – ${new Date(analysis.dateRange.max).toLocaleDateString()}`}
            </p>
          )}
          {detectedName && (
            <p style={{ marginTop: '0.5rem' }}>
              <strong>Suggested FY:</strong> {detectedName} ({analysis.suggestedFY.startDate} –{' '}
              {analysis.suggestedFY.endDate})
            </p>
          )}
          {analysis.suggestedFY.warnings?.map((w) => (
            <div key={w} className="alert alert-warn" style={{ marginTop: '0.75rem' }}>
              {w}
            </div>
          ))}
          <table style={{ marginTop: '1.25rem' }}>
            <thead>
              <tr>
                <th>Data type</th>
                <th>Rows in file</th>
                <th className="actions-col">Preview</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Products</td>
                <td>{analysis.dataSummary.products}</td>
                <td>
                  <button
                    className="btn-icon"
                    onClick={() => setModalType('products')}
                  >
                    View
                  </button>
                </td>
              </tr>
              <tr>
                <td>Customers</td>
                <td>{analysis.dataSummary.customers}</td>
                <td>
                  <button
                    className="btn-icon"
                    onClick={() => setModalType('customers')}
                  >
                    View
                  </button>
                </td>
              </tr>
              <tr>
                <td>Invoices</td>
                <td>{analysis.dataSummary.invoices}</td>
                <td>
                  <button
                    className="btn-icon"
                    onClick={() => setModalType('invoices')}
                  >
                    View
                  </button>
                </td>
              </tr>
              <tr>
                <td>Ledger entries</td>
                <td>{analysis.dataSummary.ledgerEntries}</td>
                <td>
                  <button
                    className="btn-icon"
                    onClick={() => setModalType('ledger')}
                  >
                    View
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="row-actions">
            <button className="btn-secondary btn" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn" onClick={() => setStep(3)}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Company & FY */}
      {step === 3 && analysis && (
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>Company & financial year</h3>

          <div className="form-group">
            <label>Company</label>
            <SearchableSelect
              options={companies.map(c => ({ value: c.id, label: c.name }))}
              value={companyId}
              onChange={(v) => setCompanyId(v as number)}
              placeholder="— Select —"
            />
          </div>
          <div className="form-group">
            <label>Or create new company</label>
            <input
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              placeholder={analysis.companyName || 'Company name'}
            />
          </div>

          {importStatus && fySelections.length > 0 && (
            <>
              <h4 style={{ marginTop: '1rem', marginBottom: '0.75rem' }}>Financial Years detected</h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                Select the FYs to import. Opening balances will carry forward automatically.
              </p>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>FY</th>
                    <th>Period</th>
                    <th>Entries</th>
                    <th>Status</th>
                    <th>Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {fySelections.map((sel) => (
                    <tr key={sel.fy.name}>
                      <td>
                        <input
                          type="checkbox"
                          checked={sel.checked}
                          onChange={() =>
                            setFySelections((prev) =>
                              prev.map((s) =>
                                s.fy.name === sel.fy.name ? { ...s, checked: !s.checked } : s
                              )
                            )
                          }
                        />
                      </td>
                      <td><strong>{sel.fy.name}</strong></td>
                      <td style={{ fontSize: '0.85rem' }}>
                        {new Date(sel.fy.startDate).toLocaleDateString()} – {new Date(sel.fy.endDate).toLocaleDateString()}
                      </td>
                      <td>{sel.fy.rowCount}</td>
                      <td>
                        {(() => {
                          const prev = importStatus.previouslyImportedFYs.find(
                            (p) => p.fyName === sel.fy.name
                          );
                          if (prev) {
                            return <span style={{ color: 'var(--warning)' }}>Previously imported ({prev.invoiceCount} invoices)</span>;
                          }
                          return <span style={{ color: 'var(--success)' }}>New</span>;
                        })()}
                      </td>
                      <td>
                        <select
                          value={sel.mode}
                          onChange={(e) =>
                            setFySelections((prev) =>
                              prev.map((s) =>
                                s.fy.name === sel.fy.name
                                  ? { ...s, mode: e.target.value as ImportMode }
                                  : s
                              )
                            )
                          }
                          style={{ fontSize: '0.85rem', padding: '2px 4px' }}
                        >
                          <option value="replace">Replace</option>
                          <option value="merge">Merge</option>
                          <option value="skip">Skip</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {(!importStatus || importStatus.detectedFYs.length === 0) && (
            <div className="alert alert-warn">
              <p>No financial years detected in this file. The Ledger table may be empty or missing date columns.</p>
            </div>
          )}

          <div className="row-actions" style={{ marginTop: '1.5rem' }}>
            <button className="btn-secondary btn" onClick={() => setStep(2)}>
              Back
            </button>
            <button
              className="btn"
              onClick={runImport}
              disabled={fySelections.filter((s) => s.checked).length === 0}
            >
              Import {fySelections.filter((s) => s.checked).length} FY(s) →
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Multi-FY Import progress & results */}
      {step === 4 && (
        <div className="card">
          {importing && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>
                Importing selected FYs…
              </p>
              {fySelections
                .filter((s) => s.checked)
                .map((sel) => (
                  <div key={sel.fy.name} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <strong>{sel.fy.name}</strong>
                      <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                        {sel.status === 'importing' && 'Importing...'}
                        {sel.status === 'done' && `✓ ${sel.result?.imported ?? 0} imported`}
                        {sel.status === 'error' && '✗ Failed'}
                        {sel.status === 'pending' && 'Waiting...'}
                      </span>
                    </div>
                    <div
                      style={{
                        height: '6px',
                        background: 'var(--surface-card)',
                        borderRadius: '3px',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: sel.status === 'done' ? '100%' : sel.status === 'importing' ? '60%' : '0%',
                          background: sel.status === 'error' ? 'var(--danger)' : 'var(--accent)',
                          borderRadius: '3px',
                          transition: 'width 0.3s'
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}

          {overallResult && !importing && (
            <>
              <div className={`alert ${overallResult.success ? 'alert-success' : 'alert-warn'}`}>
                Import {overallResult.success ? 'completed successfully' : 'finished with issues'}
              </div>

              {importStatus && (
                <div style={{ marginTop: '1rem' }}>
                  <h4 style={{ marginBottom: '0.75rem' }}>FY Chain</h4>
                  {overallResult.fyResults && overallResult.fyResults.length > 1 && (
                    <div className="alert alert-info" style={{ marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                      Opening balances have been chained across {overallResult.fyResults.length} FYs.
                      Balances carry forward automatically — use the ledger view to trace.
                    </div>
                  )}
                  <table>
                    <thead>
                      <tr>
                        <th>FY</th>
                        <th>Imported</th>
                        <th>Skipped</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overallResult.fyResults || []).map((r) => (
                        <tr key={r.fyName}>
                          <td><strong>{r.fyName}</strong></td>
                          <td>{r.imported}</td>
                          <td>{r.skipped}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {error && <div className="alert alert-error" style={{ marginTop: '0.75rem' }}>{error}</div>}
            </>
          )}

          {!importing && (
            <div className="row-actions" style={{ marginTop: '1.5rem' }}>
              <button
                className="btn"
                onClick={() => {
                  setStep(1);
                  setOverallResult(null);
                  setAnalysis(null);
                  setImportStatus(null);
                  setFySelections([]);
                  setSelected(null);
                  setError('');
                  setPreviewData({ products: [], customers: [], invoices: [], ledger: [] });
                  setPreviewColumns({ products: [], customers: [], invoices: [], ledger: [] });
                  setModalType(null);
                  setNewCompany('');
                  setCompanyId('');
                }}
              >
                Import another file
              </button>
            </div>
          )}
        </div>
      )}

      {modalType && (
        <DataTableModal
          isOpen={!!modalType}
          onClose={() => setModalType(null)}
          title={`Preview: ${modalType.charAt(0).toUpperCase() + modalType.slice(1)}`}
          columns={previewColumns[modalType]}
          data={previewData[modalType]}
          onUpdate={(updated) => {
            setPreviewData((prev) => ({ ...prev, [modalType]: updated }));
          }}
        />
      )}
    </div>
  );
}
