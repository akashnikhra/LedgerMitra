import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Company } from '@shared/types';
import SetupSteps from './SetupSteps';

interface Props {
  onContinue: (company: Company) => void;
  onSignOut: () => void | Promise<void>;
}

export default function CompanySetup({ onContinue, onSignOut }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<number | ''>('');
  const [newName, setNewName] = useState('');
  const [newGstin, setNewGstin] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    window.electronAPI.getCompanies().then(setCompanies);
  }, []);

  async function handleCreate() {
    if (!newName.trim()) {
      setError('Enter a company name');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const c = await window.electronAPI.createCompany({
        name: newName.trim(),
        gstin: newGstin.trim() || undefined
      });
      setCompanies((prev) => [...prev, c]);
      setCompanyId(c.id);
      setNewName('');
      setNewGstin('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function handleContinue() {
    const company = companies.find((c) => c.id === companyId);
    if (!company) {
      setError('Select a company or create a new one');
      return;
    }
    onContinue(company);
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
        <SetupSteps current={2} />
        <div className="card">
          <h2 style={{ marginBottom: '0.35rem' }}>Select or create company</h2>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
            Step 2 of 3 — Choose which business you are working with.
          </p>

          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label>Select existing company</label>
            <select
              value={companyId}
              onChange={(e) => {
                setCompanyId(e.target.value ? Number(e.target.value) : '');
                setError('');
              }}
            >
              <option value="">— Choose company —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '1.25rem 0' }} />

          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '0.75rem' }}>
            Or create a new company
          </p>
          <div className="form-group">
            <label>Company name</label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. AS ESTIMATE"
            />
          </div>
          <div className="form-group">
            <label>GSTIN (optional)</label>
            <input value={newGstin} onChange={(e) => setNewGstin(e.target.value)} placeholder="22AAAAA0000A1Z5" />
          </div>
          <button
            type="button"
            className="btn-secondary btn"
            style={{ width: '100%', marginBottom: '1.25rem' }}
            disabled={creating}
            onClick={handleCreate}
          >
            {creating ? 'Creating…' : 'Create company'}
          </button>

          <div className="row-actions" style={{ justifyContent: 'space-between' }}>
            <button type="button" className="btn-secondary btn" onClick={() => void onSignOut()}>
              Sign out
            </button>
            <button type="button" className="btn" onClick={handleContinue}>
              Continue to financial year →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
