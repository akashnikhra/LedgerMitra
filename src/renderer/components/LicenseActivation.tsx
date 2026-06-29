import { useState, useEffect, useRef } from 'react';

interface LicenseStatusData {
  valid: boolean;
  type: 'trial' | 'perpetual' | 'subscription' | 'none';
  customer?: string;
  features: string[];
  expiry?: string;
  daysLeft?: number;
  activationsUsed: number;
  activationsMax: number;
  trialDaysLeft: number;
}

interface Props {
  onClose: () => void;
  onActivated: () => void;
}

export default function LicenseActivation({ onClose, onActivated }: Props) {
  const [licenseKey, setLicenseKey] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-focus license key input on mount
  useEffect(() => {
    if (!success) setTimeout(() => modalRef.current?.querySelector<HTMLInputElement>('input')?.focus(), 0);
  }, [success]);

  // Escape to close, Ctrl+Enter to activate, focus trap
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !verifying && !activating) { e.preventDefault(); onClose(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!verifying && !activating && licenseKey.trim()) handleActivate();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const els = modalRef.current.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, verifying, activating, licenseKey]);
  const [status, setStatus] = useState<LicenseStatusData | null>(null);

  useEffect(() => {
    window.electronAPI.getLicenseStatus().then(setStatus);
  }, []);

  async function handleActivate() {
    if (!licenseKey.trim()) {
      setError('Please enter a license key');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      // First verify
      const result = await window.electronAPI.verifyLicense(licenseKey.trim());
      if (!result.valid) {
        setError(result.error || 'Invalid license key');
        setVerifying(false);
        return;
      }

      // Then activate
      setActivating(true);
      const activateResult = await window.electronAPI.activateLicense(licenseKey.trim());
      if (activateResult.success) {
        setSuccess(true);
        setTimeout(() => {
          onActivated();
          onClose();
        }, 2000);
      } else {
        setError(activateResult.error || 'Activation failed');
      }
    } catch (e) {
      setError('Failed to verify license. Please check your key and try again.');
    } finally {
      setVerifying(false);
      setActivating(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(15,0,0,0.6)', display: 'flex',
      justifyContent: 'center', alignItems: 'center',
      padding: 24
    }}>
      <div ref={modalRef} style={{
        background: 'var(--canvas)', border: '1px solid var(--hairline)',
        borderRadius: 4, maxWidth: 480, width: '100%', padding: 32
      }} tabIndex={-1}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          {success ? 'License Activated!' : 'Activate Premium License'}
        </h2>

        {success ? (
          <div style={{
            padding: 16, background: 'var(--success)', color: '#fff',
            borderRadius: 4, textAlign: 'center', marginTop: 16
          }}>
            <p style={{ fontWeight: 500 }}>License activated successfully!</p>
            <p style={{ fontSize: 13, marginTop: 4 }}>Restarting in a moment...</p>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>
              Enter your license key to unlock premium features.
            </p>

            {status && status.type === 'trial' && status.trialDaysLeft > 0 && (
              <div style={{
                padding: '8px 12px', background: 'var(--surface-soft)',
                borderRadius: 4, marginBottom: 16, fontSize: 13
              }}>
                <span style={{ color: 'var(--warning)' }}>⏱ Trial: </span>
                <span style={{ color: 'var(--muted)' }}>
                  {status.trialDaysLeft} days remaining. All features available during trial.
                </span>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                License Key
              </label>
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => { setLicenseKey(e.target.value); setError(''); }}
                placeholder="LM-xxxxxxxxxxxx.xxxxxxxxxxxxxxxx"
                style={{
                  width: '100%', padding: '8px 12px',
                  border: '1px solid var(--hairline)', borderRadius: 4,
                  background: 'var(--surface-soft)', color: 'var(--ink)',
                  fontFamily: 'var(--font-mono)', fontSize: 13
                }}
                disabled={verifying || activating}
              />
            </div>

            {error && (
              <div style={{
                padding: '8px 12px', background: 'var(--danger)', color: '#fff',
                borderRadius: 4, marginBottom: 16, fontSize: 13
              }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-outline"
                onClick={onClose}
                disabled={verifying || activating}
              >
                Cancel
              </button>
              <button
                className="btn"
                onClick={handleActivate}
                disabled={verifying || activating || !licenseKey.trim()}
              >
                {verifying ? 'Verifying...' : activating ? 'Activating...' : 'Activate'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
