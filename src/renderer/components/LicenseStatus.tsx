import { useState, useEffect } from 'react';

interface LicenseStatusData {
  valid: boolean;
  type: 'trial' | 'perpetual' | 'subscription' | 'expired_subscription' | 'none';
  customer?: string;
  features: string[];
  expiry?: string;
  daysLeft?: number;
  activationsUsed: number;
  activationsMax: number;
  trialDaysLeft: number;
  error?: string;
}

interface Props {
  onActivate: () => void;
}

const FEATURE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp Integration',
  legacy_import: 'Legacy Import',
  multi_company: 'Multi-Company',
  backup: 'Backup & Restore',
  print_pdf: 'Print & PDF'
};

export default function LicenseStatus({ onActivate }: Props) {
  const [status, setStatus] = useState<LicenseStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.getLicenseStatus().then((s) => {
      setStatus(s);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return <div style={{ padding: 16, color: 'var(--muted)' }}>Loading license status...</div>;
  }

  if (!status) return null;

  function getStatusBadge() {
    if (status.type === 'trial') {
      return (
        <span style={{
          display: 'inline-block', padding: '2px 8px',
          background: 'var(--warning)', color: '#fff',
          borderRadius: 4, fontSize: 11, fontWeight: 700
        }}>
          TRIAL
        </span>
      );
    }
    if (status.type === 'perpetual') {
      return (
        <span style={{
          display: 'inline-block', padding: '2px 8px',
          background: 'var(--success)', color: '#fff',
          borderRadius: 4, fontSize: 11, fontWeight: 700
        }}>
          PERPETUAL
        </span>
      );
    }
    if (status.type === 'subscription') {
      return (
        <span style={{
          display: 'inline-block', padding: '2px 8px',
          background: 'var(--accent)', color: '#fff',
          borderRadius: 4, fontSize: 11, fontWeight: 700
        }}>
          SUBSCRIPTION
        </span>
      );
    }
    if (status.type === 'expired_subscription') {
      return (
        <span style={{
          display: 'inline-block', padding: '2px 8px',
          background: 'var(--danger)', color: '#fff',
          borderRadius: 4, fontSize: 11, fontWeight: 700
        }}>
          EXPIRED
        </span>
      );
    }
    return null;
  }

  return (
    <div style={{
      border: '1px solid var(--hairline)', borderRadius: 4,
      padding: 16, marginBottom: 16
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700 }}>License</h3>
        {getStatusBadge()}
      </div>

      {status.type === 'trial' && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            {status.trialDaysLeft > 0 ? (
              <>Trial: <strong>{status.trialDaysLeft}</strong> days remaining</>
            ) : (
              <span style={{ color: 'var(--danger)' }}>Trial expired</span>
            )}
          </p>
          {status.trialDaysLeft > 0 && (
            <div style={{
              marginTop: 8, height: 4, background: 'var(--surface-soft)',
              borderRadius: 2, overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${(status.trialDaysLeft / 30) * 100}%`,
                background: status.trialDaysLeft > 7 ? 'var(--success)' : 'var(--warning)',
                borderRadius: 2
              }} />
            </div>
          )}
        </div>
      )}

      {status.type === 'expired_subscription' && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 13, color: 'var(--danger)' }}>
            Subscription expired{status.expiry ? <> on <strong>{status.expiry}</strong></> : ''}
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Renew your license to restore premium features.
          </p>
        </div>
      )}

      {status.customer && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
          Licensed to: <strong>{status.customer}</strong>
        </p>
      )}

      {status.expiry && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
          Expires: <strong>{status.expiry}</strong>
          {status.daysLeft !== undefined && status.daysLeft <= 30 && (
            <span style={{ color: 'var(--warning)', marginLeft: 8 }}>
              ({status.daysLeft} days left)
            </span>
          )}
        </p>
      )}

      {status.activationsMax > 0 && (
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>
          Activations: {status.activationsUsed} / {status.activationsMax}
        </p>
      )}

      {status.features.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Premium features:</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {status.features.map(f => (
              <span key={f} style={{
                padding: '2px 6px', background: 'var(--success)', color: '#fff',
                borderRadius: 3, fontSize: 11
              }}>
                {FEATURE_LABELS[f] || f}
              </span>
            ))}
          </div>
        </div>
      )}

      <button
        className="btn"
        onClick={onActivate}
        style={{ fontSize: 13, padding: '4px 16px' }}
      >
        {status.valid ? 'Manage License' : 'Activate License'}
      </button>
    </div>
  );
}
