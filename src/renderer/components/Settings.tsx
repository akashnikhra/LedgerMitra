import { useEffect, useState, useRef } from 'react';

export default function Settings() {
  const [username, setUsername] = useState('admin');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');
  const [backupError, setBackupError] = useState('');

  const [waStatus, setWaStatus] = useState<'disconnected' | 'connecting' | 'qr' | 'ready' | 'error'>('disconnected');
  const [waMessage, setWaMessage] = useState('');
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waLoading, setWaLoading] = useState(false);
  const [waCountryCode, setWaCountryCode] = useState('91');
  const [waTemplate, setWaTemplate] = useState('');
  const [waSaving, setWaSaving] = useState(false);

  // Legacy merge & import
  const [mergedDbPath, setMergedDbPath] = useState('');
  const [mergedInfo, setMergedInfo] = useState<any>(null);
  const [mergeStatus, setMergeStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [mergeProgress, setMergeProgress] = useState<string[]>([]);
  const [mergeResult, setMergeResult] = useState<any>(null);
  const [companies, setCompanies] = useState<{ id: number; name: string }[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | ''>('');
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [importRunning, setImportRunning] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importOpts, setImportOpts] = useState({ products: true, customers: true, invoices: true, ledger: true, openingBalances: true });
  const progressEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.electronAPI.getCurrentUser().then((u) => {
      if (u?.username) setUsername(u.username);
    });
    loadWhatsAppSettings();
    loadWhatsAppStatus();
    loadMergedInfo();
    window.electronAPI.getCompanies().then(setCompanies);

    window.electronAPI.onWhatsAppStatus((data: any) => {
      setWaStatus(data.status);
      setWaMessage(data.message);
    });
    window.electronAPI.onWhatsAppQr((data: any) => {
      setWaQr(data.qr);
      setWaStatus('qr');
    });

    // Merge progress listener
    window.electronAPI.onMergeProgress((data: { line: string; isError?: boolean }) => {
      setMergeProgress((prev) => [...prev, data.line]);
    });

    return () => {
      window.electronAPI.removeMergeProgressListener();
    };
  }, []);

  useEffect(() => {
    if (progressEndRef.current) {
      progressEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mergeProgress]);

  async function loadMergedInfo() {
    const path = await window.electronAPI.getMergedDbPath();
    setMergedDbPath(path);
    const info = await window.electronAPI.checkMergedDb(path);
    setMergedInfo(info);
  }

  async function loadWhatsAppSettings() {
    const [code, template] = await Promise.all([
      window.electronAPI.getSetting('whatsapp_country_code'),
      window.electronAPI.getSetting('whatsapp_message_template')
    ]);
    if (code) setWaCountryCode(code);
    if (template) setWaTemplate(template);
  }

  async function loadWhatsAppStatus() {
    const s = await window.electronAPI.whatsappStatus();
    setWaStatus(s.status);
    setWaMessage(s.message);
    if (s.qr) setWaQr(s.qr);
  }

  async function handleWaReconnect() {
    setWaLoading(true);
    setWaQr(null);
    const res = await window.electronAPI.whatsappReconnect();
    if (!res.success) {
      setWaMessage(res.error || 'Failed to reconnect');
    }
    setWaLoading(false);
  }

  async function handleWaDisconnect() {
    setWaLoading(true);
    await window.electronAPI.whatsappDisconnect();
    setWaStatus('disconnected');
    setWaQr(null);
    setWaLoading(false);
  }

  async function handleWaSaveSettings() {
    setWaSaving(true);
    await Promise.all([
      window.electronAPI.setSetting('whatsapp_country_code', waCountryCode),
      window.electronAPI.setSetting('whatsapp_message_template', waTemplate)
    ]);
    setWaSaving(false);
    setMessage('WhatsApp settings saved');
    setTimeout(() => setMessage(''), 3000);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setSaving(true);
    const res = await window.electronAPI.changePassword(currentPassword, newPassword);
    setSaving(false);

    if (res.success) {
      setMessage('Password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setError(res.error || 'Could not change password');
    }
  }

  async function handleExportBackup() {
    setBackupStatus('Exporting…');
    setBackupError('');
    try {
      const res = await window.electronAPI.exportBackup();
      if (res.success) {
        setBackupStatus(`Backup saved to: ${res.path}`);
      } else {
        setBackupError(res.error || 'Export failed');
        setBackupStatus('');
      }
    } catch (e) {
      setBackupError((e as Error).message);
      setBackupStatus('');
    }
  }

  async function handleImportBackup() {
    if (!confirm('This will replace your current database. The app will restart after import. Continue?')) return;
    setBackupStatus('Importing…');
    setBackupError('');
    try {
      const res = await window.electronAPI.importBackup();
      if (res.success) {
        setBackupStatus('Import successful. Restarting app…');
        setTimeout(() => {
          window.electronAPI.logout();
          window.location.reload();
        }, 1500);
      } else {
        setBackupError(res.error || 'Import failed');
        setBackupStatus('');
      }
    } catch (e) {
      setBackupError((e as Error).message);
      setBackupStatus('');
    }
  }

  async function handleRunMerge() {
    setMergeStatus('running');
    setMergeProgress([]);
    setMergeResult(null);
    setPreview(null);
    setImportResult(null);
    try {
      const res = await window.electronAPI.runMergeLegacy();
      setMergeResult(res);
      setMergeStatus(res.success ? 'done' : 'error');
      if (res.dbInfo) setMergedInfo(res.dbInfo);
    } catch (e) {
      setMergeResult({ success: false, error: (e as Error).message });
      setMergeStatus('error');
    }
  }

  async function handlePreview() {
    const cid = selectedCompanyId as number;
    if (!cid) return;
    setPreviewLoading(true);
    setPreview(null);
    setImportResult(null);
    try {
      const res = await window.electronAPI.previewImportMergedDb({
        dbPath: mergedDbPath,
        companyId: cid,
        options: {}
      });
      setPreview(res);
    } catch (e) {
      setPreview({ success: false, error: (e as Error).message });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleImport() {
    const cid = selectedCompanyId as number;
    if (!cid) return;
    setImportRunning(true);
    setImportResult(null);
    try {
      const res = await window.electronAPI.importMergedDb({
        dbPath: mergedDbPath,
        companyId: cid,
        options: {
          importProducts: importOpts.products,
          importCustomers: importOpts.customers,
          importInvoices: importOpts.invoices,
          importLedger: importOpts.ledger,
          importOpeningBalances: importOpts.openingBalances
        }
      });
      setImportResult(res);
    } catch (e) {
      setImportResult({ success: false, error: (e as Error).message });
    } finally {
      setImportRunning(false);
    }
  }

  function formatBytes(bytes: number) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
  }

  const statusColor = waStatus === 'ready' ? '#22c55e' : waStatus === 'qr' ? '#f59e0b' : waStatus === 'error' ? '#ef4444' : '#9ca3af';
  const statusLabel = waStatus === 'ready' ? 'Connected' : waStatus === 'qr' ? 'Waiting for QR scan' : waStatus === 'connecting' ? 'Connecting...' : waStatus === 'error' ? 'Error' : 'Disconnected';

  return (
    <div>
      <h2 style={{ marginBottom: '0.5rem' }}>Settings</h2>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        Change the login password for this computer. Default on first install is <code>admin123</code>.
      </p>

      <div className="settings-grid">
      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Change password</h3>
        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        <form onSubmit={handleChangePassword}>
          <div className="form-group">
            <label>Username</label>
            <input value={username} readOnly disabled />
          </div>
          <div className="form-group">
            <label>Current password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <div className="form-group">
            <label>New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              required
            />
          </div>
          <div className="form-group">
            <label>Confirm new password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving…' : 'Update password'}
          </button>
        </form>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>WhatsApp</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
          Connect WhatsApp to send invoices, receipts, and ledgers directly to customers.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: statusColor, display: 'inline-block' }}></span>
          <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{statusLabel}</span>
          {waMessage && <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>— {waMessage}</span>}
        </div>

        {waQr && (
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: '#f9fafb', borderRadius: 6, textAlign: 'center' }}>
            <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--muted)' }}>Scan this QR code with WhatsApp → Linked Devices</p>
            <img src={waQr} alt="WhatsApp QR" style={{ display: 'inline-block', backgroundColor: '#fff', padding: '0.5rem', borderRadius: 4, maxWidth: 256 }} />
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <button className="btn" onClick={handleWaReconnect} disabled={waLoading}>
            {waLoading ? 'Connecting...' : waStatus === 'ready' ? 'Reconnect' : 'Connect WhatsApp'}
          </button>
          {waStatus === 'ready' && (
            <button className="btn btn-secondary" onClick={handleWaDisconnect} disabled={waLoading}>
              Disconnect
            </button>
          )}
        </div>

        <div className="form-group">
          <label>Country code (default: 91 for India)</label>
          <input
            type="text"
            value={waCountryCode}
            onChange={(e) => setWaCountryCode(e.target.value.replace(/\D/g, ''))}
            placeholder="91"
            style={{ width: 100 }}
          />
        </div>

        <div className="form-group">
          <label>Message template</label>
          <textarea
            value={waTemplate}
            onChange={(e) => setWaTemplate(e.target.value)}
            rows={4}
            placeholder="Dear {customer_name},&#10;{company_name}&#10;{doc_type} {doc_no} dated {date}&#10;Amount: {amount}&#10;Thank you for your business."
            style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
          />
          <p style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
            Variables: {'{company_name}'} {'{customer_name}'} {'{doc_type}'} {'{doc_no}'} {'{date}'} {'{amount}'}
          </p>
        </div>

        <button className="btn" onClick={handleWaSaveSettings} disabled={waSaving}>
          {waSaving ? 'Saving...' : 'Save WhatsApp settings'}
        </button>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Database backup</h3>
        {backupError && <div className="alert alert-error">{backupError}</div>}
        {backupStatus && <div className="alert alert-success">{backupStatus}</div>}
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
          Export a copy of your database for safekeeping, or restore from a previous backup.
          Importing a backup will replace your current data and restart the app.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button type="button" className="btn" onClick={handleExportBackup}>
            Export backup
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleImportBackup}>
            Import backup
          </button>
        </div>
      </div>

      {/* Legacy Merge & Import */}
      <div className="card">
        <h3 style={{ fontSize: '1rem', marginBottom: '1rem' }}>Legacy data merge & import</h3>

        {mergedInfo && mergedInfo.exists && (
          <div style={{ fontSize: '0.85rem', marginBottom: '1rem', color: 'var(--muted)' }}>
            Merged DB: {formatBytes(mergedInfo.fileSize)} · {mergedInfo.sourceFiles} source files
            · Ledger: {mergedInfo.totalLedger.toLocaleString()} rows
          </div>
        )}

        {mergeStatus === 'running' && (
          <div className="alert alert-info" style={{ marginBottom: '0.75rem' }}>
            Merging legacy data files, please wait…
          </div>
        )}

        {mergeProgress.length > 0 && (
          <pre style={{
            background: 'var(--surface-card)',
            padding: '0.75rem',
            borderRadius: 4,
            fontSize: '0.75rem',
            maxHeight: 200,
            overflow: 'auto',
            marginBottom: '0.75rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            lineHeight: 1.4
          }}>
            {mergeProgress.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
            <div ref={progressEndRef} />
          </pre>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <button className="btn" onClick={handleRunMerge} disabled={mergeStatus === 'running'}>
            {mergeStatus === 'running' ? 'Merging…' : 'Run legacy merge'}
          </button>
          <button className="btn btn-secondary" onClick={loadMergedInfo} disabled={mergeStatus === 'running'}>
            Check status
          </button>
        </div>

        {mergeResult && !mergeResult.success && (
          <div className="alert alert-error" style={{ marginBottom: '0.75rem' }}>
            Merge failed: {mergeResult.error}
          </div>
        )}

        {mergedInfo && mergedInfo.exists && (mergeStatus === 'done' || mergeStatus === 'idle') && !preview && !importResult && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <div className="form-group">
              <label>Select company for import</label>
              <select
                value={selectedCompanyId}
                onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : '')}
                style={{ padding: '0.4rem 0.5rem', fontSize: '0.9rem' }}
              >
                <option value="">— Select —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '0.4rem' }}>Import options</label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '1rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={importOpts.products} onChange={(e) => setImportOpts({ ...importOpts, products: e.target.checked })} /> Products
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '1rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={importOpts.customers} onChange={(e) => setImportOpts({ ...importOpts, customers: e.target.checked })} /> Customers
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '1rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={importOpts.invoices} onChange={(e) => setImportOpts({ ...importOpts, invoices: e.target.checked })} /> Invoices
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '1rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={importOpts.ledger} onChange={(e) => setImportOpts({ ...importOpts, ledger: e.target.checked })} /> Ledger
              </label>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', marginRight: '1rem', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={importOpts.openingBalances} onChange={(e) => setImportOpts({ ...importOpts, openingBalances: e.target.checked })} /> Opening Balances
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={handlePreview} disabled={!selectedCompanyId || previewLoading}>
                {previewLoading ? 'Analyzing…' : 'Preview import'}
              </button>
              <button className="btn" onClick={handleImport} disabled={!selectedCompanyId || importRunning}>
                {importRunning ? 'Importing…' : 'Import merged data'}
              </button>
            </div>
          </div>
        )}

        {previewLoading && (
          <div className="alert alert-info" style={{ marginTop: '0.5rem' }}>
            Analyzing merged data…
          </div>
        )}

        {preview && preview.dryRun && preview.dryRunPreview && (
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <h4 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Import Preview</h4>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.5rem' }}>
              Products: {preview.dryRunPreview.productsFound} ·
              Party accounts: {preview.dryRunPreview.partyAccounts} ·
              Customers (est.): {preview.dryRunPreview.customersFound}
            </div>
            {preview.dryRunPreview.fys.length > 0 && (
              <table style={{ fontSize: '0.85rem', width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>FY</th>
                    <th style={{ textAlign: 'right' }}>Ledger rows</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.dryRunPreview.fys.map((fy: any) => (
                    <tr key={fy.name}>
                      <td>{fy.name}</td>
                      <td style={{ textAlign: 'right' }}>{fy.ledgerRows.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {importResult && (
          <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
            <div className={`alert ${importResult.success ? 'alert-success' : 'alert-error'}`}>
              Import {importResult.success ? 'completed successfully' : 'finished with issues'}
              {importResult.error ? `: ${importResult.error}` : ''}
            </div>
            {importResult.success && (
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
                Products: {importResult.imported.products} ·
                Customers: {importResult.imported.customers} ·
                Invoices: {importResult.imported.invoices} ·
                Ledger: {importResult.imported.ledger} ·
                Opening balances: {importResult.imported.openingBalances}
              </div>
            )}
            {importResult.fyResults && importResult.fyResults.length > 0 && (
              <table style={{ fontSize: '0.85rem', width: '100%', marginTop: '0.5rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>FY</th>
                    <th style={{ textAlign: 'right' }}>Imported</th>
                    <th style={{ textAlign: 'right' }}>Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {importResult.fyResults.map((fy: any) => (
                    <tr key={fy.fyName}>
                      <td>{fy.fyName}</td>
                      <td style={{ textAlign: 'right' }}>{fy.imported}</td>
                      <td style={{ textAlign: 'right' }}>{fy.skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <button className="btn btn-secondary" style={{ marginTop: '0.75rem' }} onClick={() => { setImportResult(null); setPreview(null); setMergeResult(null); loadMergedInfo(); }}>
              Done
            </button>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
