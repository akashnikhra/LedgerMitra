import { useState, useEffect, useRef } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  template: string;
  id: number | string;
  ledgerData?: { customerId?: number; fyId?: number; entries?: unknown[]; summary?: unknown };
}

export default function PrintPreviewModal({ isOpen, onClose, template, id, ledgerData }: Props) {
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-focus Close button on mount
  useEffect(() => {
    if (isOpen) setTimeout(() => modalRef.current?.querySelector<HTMLButtonElement>('.btn')?.focus(), 0);
  }, [isOpen]);

  // Escape to close, focus trap
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (waModalOpen && !waSending) setWaModalOpen(false);
        else onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const els = modalRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, waModalOpen, waSending]);

  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waMessage, setWaMessage] = useState('');
  const [waSending, setWaSending] = useState(false);
  const [waError, setWaError] = useState('');
  const [waSuccess, setWaSuccess] = useState(false);
  const [waCustomerPhone, setWaCustomerPhone] = useState('');
  const [waCustomerName, setWaCustomerName] = useState('');
  const [waDocNo, setWaDocNo] = useState('');
  const [waDocDate, setWaDocDate] = useState('');
  const [waAmount, setWaAmount] = useState('');

  useEffect(() => {
    if (isOpen && template) loadPreview();
  }, [isOpen, template, id]);

  async function loadPreview() {
    setLoading(true);
    try {
      let rendered = '';
      if (template === 'invoice') rendered = await window.electronAPI.printInvoice(id);
      else if (template === 'receipt') rendered = await window.electronAPI.printReceipt(id);
      else if (template === 'ledger') rendered = await window.electronAPI.printLedger(ledgerData || {});
      setHtml(rendered || '<p>No data to render.</p>');
    } catch (e) {
      console.error('Failed to render template:', e);
      setHtml('<p>Error rendering preview.</p>');
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    if (previewRef.current?.contentWindow) {
      previewRef.current.contentWindow.print();
    }
  }

  async function handleSavePdf() {
    try {
      const result = await window.electronAPI.savePdf(html, `${template}_${id || 'ledger'}.pdf`);
      if (result?.success) {
        alert(`PDF saved to: ${result.path}`);
      } else {
        alert('Save cancelled.');
      }
    } catch (e) {
      console.error('Failed to save PDF:', e);
      alert('Failed to save PDF.');
    }
  }

  async function openWhatsAppSend() {
    setWaError('');
    setWaSuccess(false);

    let docNo = '';
    let docDate = '';
    let amount = '';
    let custName = '';
    let custPhone = '';

    try {
      if (template === 'invoice') {
        const inv = await window.electronAPI.getInvoice(id);
        if (inv) {
          docNo = inv.invoice_no;
          docDate = inv.invoice_date;
          amount = `\u20b9 ${inv.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
          const cust = await window.electronAPI.getCustomer(inv.customer_id);
          if (cust) {
            custName = cust.name;
            custPhone = cust.phone || '';
          }
        }
      } else if (template === 'receipt') {
        const r = await window.electronAPI.getReceipt(id);
        if (r?.receipt) {
          docNo = r.receipt.receipt_no;
          docDate = r.receipt.receipt_date;
          amount = `\u20b9 ${r.receipt.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
          const cust = await window.electronAPI.getCustomer(r.receipt.customer_id);
          if (cust) {
            custName = cust.name;
            custPhone = cust.phone || '';
          }
        }
      } else if (template === 'ledger' && ledgerData?.customerId) {
        const cust = await window.electronAPI.getCustomer(ledgerData.customerId);
        if (cust) {
          custName = cust.name;
          custPhone = cust.phone || '';
          docNo = 'Ledger';
          docDate = new Date().toLocaleDateString('en-IN');
        }
      }

      setWaDocNo(docNo);
      setWaDocDate(docDate);
      setWaAmount(amount);
      setWaCustomerName(custName);
      setWaCustomerPhone(custPhone);

      const company = await window.electronAPI.getSetting('company_name') || 'LedgerMitra';
      const savedTemplate = await window.electronAPI.getSetting('whatsapp_message_template');
      const docType = template === 'invoice' ? 'Invoice' : template === 'receipt' ? 'Receipt' : 'Ledger';

      if (savedTemplate) {
        let msg = savedTemplate
          .replace('{company_name}', company)
          .replace('{customer_name}', custName || 'Customer')
          .replace('{doc_type}', docType)
          .replace('{doc_no}', docNo)
          .replace('{date}', docDate)
          .replace('{amount}', amount);
        if (!amount) {
          msg = msg.split('\n').filter(l => !l.trim().startsWith('Amount:')).join('\n');
        }
        setWaMessage(msg);
      } else {
        const lines = [`Dear ${custName || 'Customer'},`, company, `${docType} ${docNo} dated ${docDate}`];
        if (amount) lines.push(`Amount: ${amount}`);
        lines.push('Thank you for your business.');
        setWaMessage(lines.join('\n'));
      }

      setWaModalOpen(true);
    } catch (e) {
      setWaError((e as Error).message);
    }
  }

  async function handleSendWhatsApp() {
    if (!waCustomerPhone) {
      setWaError('Customer phone number is missing. Please update the customer record.');
      return;
    }
    setWaSending(true);
    setWaError('');
    setWaSuccess(false);

    const docType = template === 'invoice' ? 'invoice' : template === 'receipt' ? 'receipt' : 'ledger';
    const filename = `${docType}_${waDocNo || id}.pdf`;

    const company = await window.electronAPI.getSetting('company_name') || 'LedgerMitra';

    const result = await window.electronAPI.whatsappSend({
      phone: waCustomerPhone,
      message: waMessage,
      html,
      filename,
      companyName: company,
      customerName: waCustomerName || 'Customer',
      docType,
      docNo: waDocNo || String(id),
      date: waDocDate || '',
      amount: waAmount || ''
    });

    setWaSending(false);
    if (result.success) {
      setWaSuccess(true);
      setTimeout(() => {
        setWaModalOpen(false);
        setWaSuccess(false);
      }, 2000);
    } else {
      setWaError(result.error || 'Failed to send');
    }
  }

  if (!isOpen) return null;

  return (
    <>
      <div className="modal-overlay modal-overlay-large" onClick={onClose}>
        <div className="modal-content modal-large" ref={modalRef} onClick={e => e.stopPropagation()} tabIndex={-1}>
          <div className="modal-header">
            <h3>Print Preview</h3>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
          <div className="modal-body">
            {loading ? (
              <p className="muted">Generating preview...</p>
            ) : (
              <iframe
                ref={previewRef}
                srcDoc={html}
                className="print-preview-frame"
                title="Print Preview"
              />
            )}
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={onClose}>Close</button>
            <button className="btn" onClick={handleSavePdf}>Save PDF</button>
            <button className="btn" onClick={openWhatsAppSend} style={{ backgroundColor: '#25D366', color: '#fff', border: 'none' }}>Send WhatsApp</button>
            <button className="btn btn-primary" onClick={handlePrint}>Print</button>
          </div>
        </div>
      </div>

      {waModalOpen && (
        <div className="modal-overlay" onClick={() => { if (!waSending) setWaModalOpen(false); }}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3>Send via WhatsApp</h3>
              <button className="modal-close" onClick={() => { if (!waSending) setWaModalOpen(false); }}>&times;</button>
            </div>
            <div className="modal-body">
              {waSuccess ? (
                <div className="alert alert-success" style={{ textAlign: 'center', padding: '2rem' }}>
                  <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>&#10003;</p>
                  <p>Sent successfully!</p>
                </div>
              ) : (
                <>
                  {waError && <div className="alert alert-error">{waError}</div>}

                  <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: 6 }}>
                    <p style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}><strong>To:</strong> {waCustomerName} ({waCustomerPhone || 'No phone'})</p>
                    <p style={{ fontSize: '0.85rem', marginBottom: 0 }}><strong>Document:</strong> {waDocNo} {waDocDate && `dated ${waDocDate}`}</p>
                    {waAmount && <p style={{ fontSize: '0.85rem', marginBottom: 0 }}><strong>Amount:</strong> {waAmount}</p>}
                  </div>

                  <div className="form-group">
                    <label>Phone number</label>
                    <input
                      type="text"
                      value={waCustomerPhone}
                      onChange={(e) => setWaCustomerPhone(e.target.value)}
                      placeholder="e.g. 9876543210"
                    />
                  </div>

                  <div className="form-group">
                    <label>Message</label>
                    <textarea
                      value={waMessage}
                      onChange={(e) => setWaMessage(e.target.value)}
                      rows={5}
                      style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              {!waSuccess && (
                <>
                  <button className="btn" onClick={() => setWaModalOpen(false)} disabled={waSending}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSendWhatsApp} disabled={waSending || !waCustomerPhone}>
                    {waSending ? 'Sending...' : 'Send'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
