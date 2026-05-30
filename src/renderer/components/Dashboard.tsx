import { useEffect, useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import type { Company, DashboardInsights, FinancialYear } from '@shared/types';
import LegacyImportWizard from './LegacyImportWizard';
import Settings from './Settings';
import CustomersPanel from './CustomersPanel';
import InvoicesPanel from './InvoicesPanel';
import SuppliersPanel from './SuppliersPanel';
import PurchaseInvoicesPanel from './PurchaseInvoicesPanel';
import ProductsPanel from './ProductsPanel';
import ReceiptsPanel from './ReceiptsPanel';
import LedgerPanel from './LedgerPanel';
import LicenseActivation from './LicenseActivation';
import LicenseStatus from './LicenseStatus';
import PremiumBadge from './PremiumBadge';

type Tab = 'home' | 'import' | 'products' | 'customers' | 'invoices' | 'suppliers' | 'purchases' | 'receipts' | 'ledger' | 'settings';

interface Props {
  company: Company | null;
  onSignOut: () => void | Promise<void>;
  onChangeWorkspace: () => void;
}

function formatINR(n: number): string {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: string; color?: string }) {
  const c = color || '#3b82f6';
  return (
    <div className="stat-card">
      <div className="stat-top-border" style={{ background: c }} />
      <div className="stat-row">
        <div className="stat-icon" style={{ background: c + '18', color: c }}>{icon}</div>
        <span className="stat-value">{value}</span>
      </div>
      <span className="stat-label">{label}</span>
    </div>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function AgingBar({ bucket, amount, count, maxAmount }: { bucket: string; amount: number; count: number; maxAmount: number }) {
  const pct = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
  const color = bucket === '0-30' ? '#22c55e' : bucket === '31-60' ? '#f59e0b' : bucket === '61-90' ? '#f97316' : '#ef4444';
  return (
    <div className="aging-row">
      <span className="aging-label">{bucket} days</span>
      <div className="aging-bar-track">
        <div className="aging-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="aging-amount">{formatINR(amount)}</span>
      <span className="aging-count">({count})</span>
    </div>
  );
}

export default function Dashboard({ company, onSignOut, onChangeWorkspace }: Props) {
  const [tab, setTab] = useState<Tab>('home');
  const [insights, setInsights] = useState<DashboardInsights | null>(null);
  const [activeFy, setActiveFy] = useState<FinancialYear | null>(null);
  const [pendingInvoiceId, setPendingInvoiceId] = useState<number | null>(null);
  const { theme, toggleTheme } = useTheme();
  const [showLicenseModal, setShowLicenseModal] = useState(false);
  const [licenseStatus, setLicenseStatus] = useState<any>(null);

  useEffect(() => {
    window.electronAPI.getLicenseStatus().then(setLicenseStatus);
  }, []);

  async function refresh() {
    const data = await window.electronAPI.getDashboardInsights();
    setInsights(data);
    if (company) {
      const fy = await window.electronAPI.getActiveFinancialYear(company.id);
      setActiveFy(fy || null);
    }
  }

  useEffect(() => {
    refresh();
    if (company?.state) {
      (window as any).__companyState = company.state;
    }
  }, [tab, company?.id]);

  const nav: { id: Tab; label: string; premium?: string }[] = [
    { id: 'home', label: 'Dashboard' },
    { id: 'import', label: 'Legacy import', premium: 'legacy_import' },
    { id: 'products', label: 'Products' },
    { id: 'customers', label: 'Customers' },
    { id: 'invoices', label: 'Sales Invoices' },
    { id: 'suppliers', label: 'Suppliers' },
    { id: 'purchases', label: 'Purchase Invoices' },
    { id: 'receipts', label: 'Receipts' },
    { id: 'ledger', label: 'Ledger' },
    { id: 'settings', label: 'Settings' }
  ];

  const kpi = insights?.kpi;
  const maxRevenue = insights?.monthlyRevenue ? Math.max(...insights.monthlyRevenue.map(m => m.revenue), 1) : 1;
  const maxAging = insights?.invoiceAging ? Math.max(...insights.invoiceAging.map(a => a.amount), 1) : 1;

  return (
    <div className="app-shell">
      <button
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {theme === 'dark' ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )}
      </button>
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>LedgerMitra</h1>
          {company && (
            <p className="sidebar-company">
              {company.name}
              {activeFy && <> &middot; {activeFy.name}</>}
            </p>
          )}
        </div>
        <nav className="sidebar-nav">
          {nav.map((n) => (
            <button key={n.id} className={`nav-btn ${tab === n.id ? 'active' : ''}`} onClick={() => setTab(n.id)}>
              {n.label}
              {n.premium && licenseStatus && !licenseStatus.valid && (
                <PremiumBadge compact />
              )}
            </button>
          ))}
          <button className="nav-btn" onClick={onChangeWorkspace}>Change company / FY</button>
        </nav>
        <div className="sidebar-footer">
          <button className="nav-btn signout-btn" onClick={() => void onSignOut()}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        {tab === 'home' && insights && (
          <div className="dashboard-home">
            <h2 className="dashboard-heading">Overview</h2>

            {/* KPI row */}
            <div className="stats-grid">
              <KpiCard label="Products" value={String(kpi!.products)} icon="📦" />
              <KpiCard label="Customers" value={String(kpi!.customers)} icon="👥" />
              <KpiCard label="Sales Invoices" value={String(kpi!.invoices)} icon="🧾" />
              <KpiCard label="Total Sales" value={formatINR(kpi!.totalSales)} icon="💰" />
              <KpiCard label="Receivables" value={formatINR(kpi!.receivables)} icon="📋" color="#22c55e" />
              <KpiCard label="Supplier Payables" value={formatINR(kpi!.supplierPayables)} icon="🏭" color="#f59e0b" />
            </div>

            {/* Quick links */}
            <div className="quick-links">
              <button className="quick-link-card" onClick={() => setTab('invoices')}>
                <span className="quick-link-icon">🧾</span>
                <span className="quick-link-title">New Invoice</span>
                <span className="quick-link-desc">Create sales invoice</span>
              </button>
              <button className="quick-link-card" onClick={() => setTab('customers')}>
                <span className="quick-link-icon">👥</span>
                <span className="quick-link-title">Customers</span>
                <span className="quick-link-desc">Manage customers</span>
              </button>
              <button className="quick-link-card" onClick={() => setTab('products')}>
                <span className="quick-link-icon">📦</span>
                <span className="quick-link-title">Products</span>
                <span className="quick-link-desc">Manage inventory</span>
              </button>
              <button className="quick-link-card" onClick={() => setTab('receipts')}>
                <span className="quick-link-icon">💳</span>
                <span className="quick-link-title">Receipts</span>
                <span className="quick-link-desc">Record payments</span>
              </button>
              <button className="quick-link-card" onClick={() => setTab('purchases')}>
                <span className="quick-link-icon">📥</span>
                <span className="quick-link-title">Purchases</span>
                <span className="quick-link-desc">Purchase invoices</span>
              </button>
              <button className="quick-link-card" onClick={() => setTab('ledger')}>
                <span className="quick-link-icon">📒</span>
                <span className="quick-link-title">Ledger</span>
                <span className="quick-link-desc">Customer ledger</span>
              </button>
            </div>

            {/* Two-column: Revenue trend + Invoice aging */}
            <div className="dashboard-grid-2">
              {/* Monthly revenue */}
              <div className="dash-card">
                <h3 className="dash-card-title">Monthly Revenue</h3>
                {insights.monthlyRevenue.length > 0 ? (
                  <div className="revenue-chart">
                    {insights.monthlyRevenue.map(m => (
                      <div key={m.month} className="revenue-bar-row">
                        <span className="revenue-bar-label">{MONTH_NAMES[parseInt(m.month.slice(5), 10) - 1]}</span>
                        <div className="revenue-bar-track">
                          <div className="revenue-bar-fill" style={{ width: `${(m.revenue / maxRevenue) * 100}%` }} />
                        </div>
                        <span className="revenue-bar-value">{formatINR(m.revenue)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="dash-empty">No sales data yet</p>
                )}
              </div>

              {/* Invoice aging */}
              <div className="dash-card">
                <h3 className="dash-card-title">Outstanding Aging</h3>
                {insights.invoiceAging.length > 0 ? (
                  <div className="aging-chart">
                    {insights.invoiceAging.map(a => (
                      <AgingBar key={a.bucket} bucket={a.bucket} amount={a.amount} count={a.count} maxAmount={maxAging} />
                    ))}
                  </div>
                ) : (
                  <p className="dash-empty">No outstanding invoices</p>
                )}
              </div>
            </div>

            {/* Two-column: Top debtors + Recent activity */}
            <div className="dashboard-grid-2">
              {/* Top debtors */}
              <div className="dash-card">
                <h3 className="dash-card-title">Top Debtors</h3>
                {insights.topDebtors.length > 0 ? (
                  <table className="dash-table">
                    <thead>
                      <tr><th>#</th><th>Customer</th><th style={{ textAlign: 'right' }}>Balance</th></tr>
                    </thead>
                    <tbody>
                      {insights.topDebtors.map((d, i) => (
                        <tr key={d.id}>
                          <td className="dash-idx">{i + 1}</td>
                          <td>{d.name}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatINR(d.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="dash-empty">No debtors</p>
                )}
              </div>

              {/* Recent activity */}
              <div className="dash-card">
                <h3 className="dash-card-title">Recent Activity</h3>
                {insights.recentActivity.length > 0 ? (
                  <div className="activity-feed">
                    {insights.recentActivity.map((a, i) => (
                      <div
                        key={i}
                        className="activity-row"
                        style={{ cursor: a.id ? 'pointer' : 'default' }}
                        onDoubleClick={() => {
                          if (a.type === 'invoice' && a.id) {
                            setPendingInvoiceId(a.id);
                            setTab('invoices');
                          } else if (a.type === 'receipt') {
                            setTab('receipts');
                          }
                        }}
                        title={a.id ? `Double-click to open ${a.type}` : ''}
                      >
                        <span className={`activity-type-dot ${a.type}`} />
                        <div className="activity-info">
                          <span className="activity-ref">{a.ref}</span>
                          {a.customerName && <span className="activity-customer">{a.customerName}</span>}
                        </div>
                        <span className="activity-amount">{formatINR(a.amount)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="dash-empty">No recent activity</p>
                )}
              </div>
            </div>

            {/* Low stock alerts */}
            {insights.lowStock.length > 0 && (
              <div className="dash-card dash-alert-card">
                <h3 className="dash-card-title">Low Stock Alert</h3>
                <table className="dash-table">
                  <thead>
                    <tr><th>Product</th><th>SKU</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Reorder At</th></tr>
                  </thead>
                  <tbody>
                    {insights.lowStock.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td className="dash-code">{p.sku}</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{p.stockQty}</td>
                        <td style={{ textAlign: 'right' }}>{p.reorderLevel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Legacy import banner */}
            {kpi!.products === 0 && kpi!.invoices === 0 && (
              <div className="alert alert-warn" style={{ marginTop: '1.5rem' }}>
                New install? Open <strong>Legacy import</strong> to bring in Speed Plus data.
              </div>
            )}
          </div>
        )}
        {tab === 'import' && <LegacyImportWizard />}
        {tab === 'settings' && (
          <div>
            <LicenseStatus onActivate={() => setShowLicenseModal(true)} />
            <Settings />
          </div>
        )}
        {tab === 'products' && <ProductsPanel onChanged={refresh} />}
        {tab === 'customers' && <CustomersPanel onChanged={refresh} />}
        {tab === 'invoices' && <InvoicesPanel onChanged={refresh} initialInvoiceId={pendingInvoiceId} onClearInvoiceId={() => setPendingInvoiceId(null)} />}
        {tab === 'suppliers' && <SuppliersPanel onChanged={refresh} />}
        {tab === 'purchases' && <PurchaseInvoicesPanel onChanged={refresh} />}
        {tab === 'receipts' && <ReceiptsPanel onChanged={refresh} />}
        {tab === 'ledger' && <LedgerPanel onChanged={refresh} activeFY={activeFy} companyId={company?.id} />}
      </main>

      {showLicenseModal && (
        <LicenseActivation
          onClose={() => setShowLicenseModal(false)}
          onActivated={() => {
            window.electronAPI.getLicenseStatus().then(setLicenseStatus);
          }}
        />
      )}
    </div>
  );
}
