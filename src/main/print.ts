import { queryOne } from './database';
import { getActiveCompanyId } from './session';
import { BrowserWindow } from 'electron';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getCompanyInfo(): { name: string; address?: string; phone?: string; email?: string; gstin?: string; pan?: string; state?: string } | null {
  const companyId = getActiveCompanyId();
  if (!companyId) return null;
  return queryOne('SELECT * FROM company WHERE id = ?', [companyId]) as { name: string; address?: string; phone?: string; email?: string; gstin?: string; pan?: string; state?: string } | null;
}

export function formatCurrency(amount: number): string {
  return `₹ ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function renderInvoiceTemplate(data: Record<string, unknown>): string {
  const invoice = data.invoice as Record<string, unknown>;
  const items = data.items as Record<string, unknown>[];
  const company = data.company as Record<string, unknown>;
  const customer = data.customer as Record<string, unknown>;
  const paymentSummary = data.paymentSummary as Record<string, unknown>;

  const totalAmount = Number(invoice.total_amount) || 0;
  const amountPaid = Number(paymentSummary?.amountPaid) || 0;
  const pendingAmount = Number(paymentSummary?.pendingAmount) || totalAmount;
  const previousOutstanding = Number(paymentSummary?.previousOutstanding) || 0;
  const currentOutstanding = Number(paymentSummary?.currentOutstanding) || 0;

  let statusLabel = 'UNPAID';
  let statusColor = '#ef4444';
  if (pendingAmount <= 0) {
    statusLabel = 'PAID';
    statusColor = '#22c55e';
  } else if (amountPaid > 0) {
    statusLabel = 'PARTIAL';
    statusColor = '#f59e0b';
  }

  const rows = items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(String(item.product_name || item.product_id || ''))}</td>
      <td style="text-align:right">${Number(item.qty).toLocaleString('en-IN')}</td>
      <td style="text-align:right">${formatCurrency(Number(item.rate))}</td>
      <td style="text-align:right">${item.gst_rate ? `${escapeHtml(String(item.gst_rate))}%` : '-'}</td>
      <td style="text-align:right">${formatCurrency(Number(item.amount))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Invoice ${escapeHtml(String(invoice.invoice_no))}</title>
<style>
  body { font-family: 'JetBrains Mono', monospace; font-size: 11px; margin: 0; padding: 20mm; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; }
  .company-name { font-size: 18px; font-weight: bold; }
  .invoice-title { font-size: 16px; font-weight: bold; text-align: right; }
  .invoice-no { font-size: 14px; color: #666; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
  .info-block h4 { margin: 0 0 5px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: bold; }
  .totals { text-align: right; margin-bottom: 20px; }
  .totals div { margin: 3px 0; }
  .totals .total { font-size: 14px; font-weight: bold; border-top: 2px solid #1a1a1a; padding-top: 5px; }
  .payment-summary { border: 1px solid #333; padding: 10px; margin-bottom: 20px; background: #fafafa; }
  .payment-summary h4 { margin: 0 0 8px; }
  .payment-summary .row { display: flex; justify-content: space-between; margin: 3px 0; }
  .payment-summary .pending { font-weight: bold; color: #ef4444; }
  .payment-summary .paid { color: #22c55e; }
  .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; color: white; font-size: 10px; font-weight: bold; background: ${statusColor}; }
  .footer { margin-top: 40px; display: flex; justify-content: space-between; }
  .signature { border-top: 1px solid #333; padding-top: 5px; width: 150px; text-align: center; }
  @media print { body { padding: 10mm; } }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(company?.name || '')}</div>
      <div>${escapeHtml(company?.address || '')}</div>
      ${company?.gstin ? `<div>GSTIN: ${escapeHtml(String(company.gstin))}</div>` : ''}
      ${company?.phone ? `<div>Phone: ${escapeHtml(String(company.phone))}</div>` : ''}
    </div>
    <div>
      <div class="invoice-title">INVOICE</div>
      <div class="invoice-no">${escapeHtml(String(invoice.invoice_no))}</div>
      <div>Date: ${formatDate(String(invoice.invoice_date))}</div>
      <div>Status: <span class="status-badge">${escapeHtml(statusLabel)}</span></div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-block">
      <h4>Bill To</h4>
      <div>${escapeHtml(customer?.name || '')}</div>
      <div>${escapeHtml(customer?.address || '')}</div>
      ${customer?.gstin ? `<div>GSTIN: ${escapeHtml(String(customer.gstin))}</div>` : ''}
      ${customer?.phone ? `<div>Phone: ${escapeHtml(String(customer.phone))}</div>` : ''}
    </div>
    <div class="info-block">
      <h4>Invoice Details</h4>
      <div>Type: ${escapeHtml(String(invoice.invoice_type || 'SALE'))}</div>
      ${invoice.notes ? `<div>Notes: ${escapeHtml(String(invoice.notes))}</div>` : ''}
    </div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Product</th><th style="text-align:right">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">GST</th><th style="text-align:right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div>Subtotal: ${formatCurrency(Number(invoice.subtotal) || 0)}</div>
    ${Number(invoice.discount) > 0 ? `<div>Discount: ${formatCurrency(Number(invoice.discount))}</div>` : ''}
    ${Number(invoice.cgst_amount) > 0 ? `<div>CGST: ${formatCurrency(Number(invoice.cgst_amount))}</div>` : ''}
    ${Number(invoice.sgst_amount) > 0 ? `<div>SGST: ${formatCurrency(Number(invoice.sgst_amount))}</div>` : ''}
    ${Number(invoice.igst_amount) > 0 ? `<div>IGST: ${formatCurrency(Number(invoice.igst_amount))}</div>` : ''}
    <div class="total">Total: ${formatCurrency(totalAmount)}</div>
  </div>
  <div class="payment-summary">
    <h4>Outstanding Summary</h4>
    <div class="row"><span>Previous Outstanding:</span><span>${formatCurrency(previousOutstanding)}</span></div>
    <div class="row"><span>This Invoice:</span><span>${formatCurrency(totalAmount)}</span></div>
    <div class="row"><span>Amount Paid:</span><span class="paid">${formatCurrency(amountPaid)}</span></div>
    <div class="row pending"><span>Current Outstanding:</span><span>${formatCurrency(currentOutstanding)}</span></div>
  </div>
  <div class="footer">
    <div>Notes: ${escapeHtml(String(invoice.notes || 'Thank you for your business.'))}</div>
    <div class="signature">Authorized Signature</div>
  </div>
</body></html>`;
}

export function renderReceiptTemplate(data: Record<string, unknown>): string {
  const receipt = data.receipt as Record<string, unknown>;
  const allocations = data.allocations as Record<string, unknown>[];
  const company = data.company as Record<string, unknown>;
  const customer = data.customer as Record<string, unknown>;

  const allocRows = allocations.map(a => `
    <tr>
      <td>${escapeHtml(String(a.invoice_no))}</td>
      <td style="text-align:right">${formatCurrency(Number(a.allocated_amount))}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Receipt ${escapeHtml(String(receipt.receipt_no))}</title>
<style>
  body { font-family: 'JetBrains Mono', monospace; font-size: 11px; margin: 0; padding: 20mm; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; margin-bottom: 20px; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; }
  .company-name { font-size: 18px; font-weight: bold; }
  .title { font-size: 16px; font-weight: bold; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th, td { border: 1px solid #333; padding: 6px 8px; }
  th { background: #f5f5f5; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
  .detail-row { display: flex; justify-content: space-between; margin: 5px 0; }
  .amount { font-size: 18px; font-weight: bold; margin: 10px 0; }
  .footer { margin-top: 40px; text-align: right; }
  .signature { border-top: 1px solid #333; padding-top: 5px; width: 150px; display: inline-block; text-align: center; }
  @media print { body { padding: 10mm; } }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(company?.name || '')}</div>
      <div>${escapeHtml(company?.address || '')}</div>
      ${company?.phone ? `<div>Phone: ${escapeHtml(String(company.phone))}</div>` : ''}
    </div>
    <div>
      <div class="title">PAYMENT RECEIPT</div>
      <div>${escapeHtml(String(receipt.receipt_no))}</div>
      <div>Date: ${formatDate(String(receipt.receipt_date))}</div>
    </div>
  </div>
  <div class="detail-grid">
    <div>
      <h4>Received From</h4>
      <div>${escapeHtml(customer?.name || '')}</div>
      ${customer?.address ? `<div>${escapeHtml(String(customer.address))}</div>` : ''}
      ${customer?.gstin ? `<div>GSTIN: ${escapeHtml(String(customer.gstin))}</div>` : ''}
    </div>
    <div>
      <h4>Payment Details</h4>
      <div class="detail-row"><span>Method:</span><span>${escapeHtml(String(receipt.payment_method))}</span></div>
      ${receipt.reference_no ? `<div class="detail-row"><span>Reference:</span><span>${escapeHtml(String(receipt.reference_no))}</span></div>` : ''}
      ${receipt.bank_account ? `<div class="detail-row"><span>Bank Account:</span><span>${escapeHtml(String(receipt.bank_account))}</span></div>` : ''}
    </div>
  </div>
  <div class="amount">Amount: ${formatCurrency(Number(receipt.amount))}</div>
  ${allocations.length > 0 ? `
    <h4>Allocation</h4>
    <table>
      <thead><tr><th>Invoice</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${allocRows}</tbody>
    </table>
  ` : ''}
  ${receipt.narration ? `<div>Narration: ${escapeHtml(String(receipt.narration))}</div>` : ''}
  <div class="footer"><div class="signature">Authorized Signature</div></div>
</body></html>`;
}

export function renderLedgerTemplate(data: Record<string, unknown>): string {
  const entries = data.entries as Record<string, unknown>[];
  const company = data.company as Record<string, unknown>;
  const fy = data.financialYear as Record<string, unknown>;
  const customer = data.customer as Record<string, unknown>;
  const openingBalance = Number(data.openingBalance) || 0;
  const closingBalance = Number(data.closingBalance) || 0;
  const summary = data.summary as Record<string, unknown>;

  const rows = entries.map(e => `
    <tr>
      <td>${formatDate(String(e.date || e.entry_date))}</td>
      <td>${escapeHtml(String(e.reference_no || e.receipt_no || e.invoice_no || '-'))}</td>
      <td>${escapeHtml(String(e.type || e.entry_type))}</td>
      <td style="text-align:right">${e.debit ? formatCurrency(Number(e.debit)) : '-'}</td>
      <td style="text-align:right">${e.credit ? formatCurrency(Number(e.credit)) : '-'}</td>
      <td style="text-align:right">${formatCurrency(Number(e.balance) || 0)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Ledger</title>
<style>
  body { font-family: 'JetBrains Mono', monospace; font-size: 10px; margin: 0; padding: 15mm; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 2px solid #1a1a1a; padding-bottom: 10px; }
  .company-name { font-size: 16px; font-weight: bold; }
  .title { font-size: 14px; font-weight: bold; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  th, td { border: 1px solid #333; padding: 4px 6px; }
  th { background: #f5f5f5; }
  .footer-totals { margin-top: 15px; padding-top: 10px; border-top: 2px solid #1a1a1a; }
  .detail-row { display: flex; justify-content: space-between; margin: 3px 0; }
  @media print { body { padding: 10mm; } @page { size: A4 landscape; } }
</style></head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${escapeHtml(company?.name || '')}</div>
      <div>${escapeHtml(company?.address || '')}</div>
    </div>
    <div>
      <div class="title">LEDGER</div>
      <div>${escapeHtml(fy?.name || '')}</div>
      <div>${customer ? `Customer: ${escapeHtml(String(customer.name))}` : 'All Customers'}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Ref No</th><th>Type</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer-totals">
    <div class="detail-row"><span>Opening Balance:</span><span>${formatCurrency(openingBalance)}</span></div>
    <div class="detail-row"><span>Closing Balance:</span><span>${formatCurrency(closingBalance)}</span></div>
    ${summary ? `
      <div class="detail-row"><span>Total Debits:</span><span>${formatCurrency(Number(summary.totalDebit) || 0)}</span></div>
      <div class="detail-row"><span>Total Credits:</span><span>${formatCurrency(Number(summary.totalCredit) || 0)}</span></div>
    ` : ''}
  </div>
  <div style="margin-top:20px;font-size:9px;color:#666">Printed: ${escapeHtml(new Date().toLocaleString('en-IN'))}</div>
</body></html>`;
}

export async function generatePdf(html: string, options?: { pageSize?: 'A4' | 'Letter'; landscape?: boolean }): Promise<Buffer> {
  const win = new BrowserWindow({ show: false, width: 800, height: 600 });
  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const pdf = await win.webContents.printToPDF({
      pageSize: options?.pageSize || 'A4',
      landscape: options?.landscape || false,
      margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
    });

    return pdf;
  } finally {
    win.close();
  }
}

export function savePdf(pdf: Buffer, outputPath: string): string {
  const dir = dirname(outputPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(outputPath, pdf);
  return outputPath;
}
