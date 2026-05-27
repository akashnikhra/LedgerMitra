import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Company, FinancialYear } from '@shared/types';
import SetupSteps from './SetupSteps';

interface Props {
  company: Company;
  onContinue: () => void;
  onBack: () => void;
  onSignOut: () => void | Promise<void>;
}

function currentIndianFyDefaults(): { name: string; start: string; end: string } {
  const now = new Date();
  const fyStart = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
  const fyEnd = fyStart + 1;
  return {
    name: `FY${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`,
    start: `${fyStart}-04-01`,
    end: `${fyEnd}-03-31`
  };
}

export default function FinancialYearSetup({ company, onContinue, onBack, onSignOut }: Props) {
  const [fys, setFys] = useState<FinancialYear[]>([]);
  const [fyId, setFyId] = useState<number | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    window.electronAPI.getFinancialYears(company.id).then((list) => {
      setFys(list);
      const active = list.find((f) => f.is_active);
      if (active) setFyId(active.id);
      else if (list.length === 1) setFyId(list[0].id);
    });
  }, [company.id]);

  function fillCurrentFy() {
    const d = currentIndianFyDefaults();
    setNewName(d.name);
    setNewStart(d.start);
    setNewEnd(d.end);
    setShowCreate(true);
  }

  async function handleCreate() {
    if (!newName.trim() || !newStart || !newEnd) {
      setError('Enter FY name, start date, and end date');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const fy = await window.electronAPI.createFinancialYear({
        name: newName.trim(),
        start_date: newStart,
        end_date: newEnd,
        company_id: company.id
      });
      setFys((prev) => [...prev, fy]);
      setFyId(fy.id);
      setShowCreate(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleContinue() {
    if (!fyId) {
      setError('Select a financial year or create one');
      return;
    }
    setError('');
    await window.electronAPI.setWorkspace(company.id, fyId as number);
    await window.electronAPI.setActiveFinancialYear(fyId as number, company.id);
    onContinue();
  }

  return (
    <div className="login-page">
      <button
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/>
            <line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )}
      </button>
      <div style={{ width: '100%', maxWidth: 520 }}>
        <SetupSteps current={3} />
        <div className="card">
          <h2 style={{ marginBottom: '0.35rem' }}>Select or create financial year</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
            Step 3 of 3 — Company: <strong>{company.name}</strong>
          </p>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label>Select existing financial year</label>
            <select
              value={fyId}
              onChange={(e) => {
                setFyId(e.target.value ? Number(e.target.value) : '');
                setError('');
              }}
            >
              <option value="">— Choose financial year —</option>
              {fys.map((fy) => (
                <option key={fy.id} value={fy.id}>
                  {fy.name} ({fy.start_date} → {fy.end_date})
                </option>
              ))}
            </select>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />

          {!showCreate ? (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
              <button type="button" className="btn-secondary btn" onClick={() => setShowCreate(true)}>
                + Create new FY
              </button>
              <button type="button" className="btn-secondary btn" onClick={fillCurrentFy}>
                Create current FY (Apr–Mar)
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
                Create financial year (e.g. older years for legacy import)
              </p>
              <div className="form-group">
                <label>FY name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="FY24-25"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Start date</label>
                  <input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>End date</label>
                  <input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
                <button type="button" className="btn" disabled={creating} onClick={handleCreate}>
                  {creating ? 'Saving…' : 'Save financial year'}
                </button>
                <button type="button" className="btn-secondary btn" onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
              </div>
            </>
          )}

          <div className="row-actions" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn-secondary btn" onClick={onBack}>
                ← Back
              </button>
              <button type="button" className="btn-secondary btn" onClick={() => void onSignOut()}>
                Sign out
              </button>
            </div>
            <button type="button" className="btn" onClick={handleContinue}>
              Open dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
