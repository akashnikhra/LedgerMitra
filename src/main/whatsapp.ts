import { Client, MessageMedia, LocalAuth } from 'whatsapp-web.js';
import { BrowserWindow, app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync, rmSync } from 'fs';
import { queryOne } from './database';
import { getActiveCompanyId } from './session';
import QRCode from 'qrcode';

let client: Client | null = null;
let isReady = false;
let qrCodeData: string | null = null;
let status: 'disconnected' | 'connecting' | 'qr' | 'ready' | 'error' = 'disconnected';
let statusMessage = '';
let mainWindow: BrowserWindow | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
let initTimeout: NodeJS.Timeout | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;

function getAuthDir(): string {
  const dir = join(app.getPath('userData'), 'whatsapp-session');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanupPuppeteerLocks(): void {
  const authDir = getAuthDir();
  try {
    const entries = readdirSync(authDir);
    for (const entry of entries) {
      const fullPath = join(authDir, entry);
      try {
        if (entry.endsWith('.lock') || entry === 'SingletonLock' || entry === 'SingletonSocket' || entry === 'SingletonCookie') {
          unlinkSync(fullPath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  } catch {
    // Ignore if directory doesn't exist
  }
}

function getSetting(key: string): string | null {
  const result = queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return result?.value || null;
}

function formatPhoneNumber(raw: string): string {
  const cleaned = raw.replace(/[\s\-\(\)\+]/g, '');
  if (cleaned.length === 10) {
    const countryCode = getSetting('whatsapp_country_code') || '91';
    return `${countryCode}${cleaned}@c.us`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `${cleaned}@c.us`;
  }
  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return `${cleaned}@c.us`;
  }
  return '';
}

function buildMessage(opts: {
  companyName: string;
  customerName: string;
  docType: 'invoice' | 'receipt' | 'ledger';
  docNo: string;
  date: string;
  amount: string;
}): string {
  const template = getSetting('whatsapp_message_template');
  if (template) {
    let msg = template
      .replace('{company_name}', opts.companyName)
      .replace('{customer_name}', opts.customerName)
      .replace('{doc_type}', opts.docType.toUpperCase())
      .replace('{doc_no}', opts.docNo)
      .replace('{date}', opts.date)
      .replace('{amount}', opts.amount);
    if (!opts.amount) {
      msg = msg.split('\n').filter(l => !l.trim().startsWith('Amount:')).join('\n');
    }
    return msg;
  }
  const lines = [`Dear ${opts.customerName},`, opts.companyName, `${opts.docType.toUpperCase()} ${opts.docNo} dated ${opts.date}`];
  if (opts.amount) lines.push(`Amount: ${opts.amount}`);
  lines.push('Thank you for your business.');
  return lines.join('\n');
}

function notifyRenderer(event: string, data: unknown = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(`whatsapp:${event}`, data);
  }
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    if (status !== 'ready' || !client) return;
    try {
      const info = (client as any).info;
      if (!info || !info.pushname) {
        status = 'disconnected';
        statusMessage = 'Connection lost (heartbeat check). Reconnecting...';
        notifyRenderer('status', { status, message: statusMessage });
        client = null;
        isReady = false;
        stopHeartbeat();
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttempts++;
          setTimeout(() => initializeClient(), 3000);
        }
      }
    } catch {
      // Silently ignore heartbeat check errors
    }
  }, 60000);
}

function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export function initWhatsApp(win: BrowserWindow): void {
  mainWindow = win;
  initializeClient();
}

function initializeClient(): void {
  if (client) return;

  if (initTimeout) clearTimeout(initTimeout);
  cleanupPuppeteerLocks();

  status = 'connecting';
  statusMessage = 'Initializing WhatsApp...';
  notifyRenderer('status', { status, message: statusMessage });

  try {
    let executablePath: string | undefined;
    try {
      const pptr = require('puppeteer');
      executablePath = pptr.executablePath();
    } catch {
      const systemPaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Chromium\\Application\\chrome.exe'
      ];
      for (const p of systemPaths) {
        if (existsSync(p)) { executablePath = p; break; }
      }
    }

    client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'ledgermitra',
        dataPath: getAuthDir()
      }),
      puppeteer: {
        headless: true,
        executablePath,
        args: [
          '--disable-features=VizDisplayCompositor',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-component-extensions-with-bg-pages',
          '--disable-extensions',
          '--disable-sync',
          '--hide-scrollbars',
          '--no-first-run',
          '--no-default-browser-check',
          '--mute-audio'
        ],
        defaultViewport: null,
        timeout: 0
      }
    });

    initTimeout = setTimeout(() => {
      if (status === 'connecting') {
        status = 'error';
        statusMessage = 'Connection timed out. Click "Connect WhatsApp" to retry.';
        notifyRenderer('status', { status, message: statusMessage });
        if (client) {
          client.destroy().catch(() => {});
          client = null;
        }
        isReady = false;
        reconnectAttempts = 0;
      }
    }, 60000);

    client.initialize().catch((err) => {
      if (initTimeout) clearTimeout(initTimeout);
      const errMsg = err.message || '';
      if (errMsg.includes('already running') || errMsg.includes('Target closed') || errMsg.includes('Protocol error')) {
        status = 'error';
        statusMessage = 'Browser crashed. Session cleared. Click "Connect WhatsApp" to retry.';
        try {
          rmSync(getAuthDir(), { recursive: true, force: true });
          mkdirSync(getAuthDir(), { recursive: true });
        } catch {
          // Ignore cleanup errors
        }
      } else {
        status = 'error';
        statusMessage = `Failed to start: ${errMsg}`;
      }
      notifyRenderer('status', { status, message: statusMessage });
      client = null;
      isReady = false;
      reconnectAttempts = 0;
    });

    client.on('qr', async (qr: string) => {
      if (initTimeout) clearTimeout(initTimeout);
      qrCodeData = qr;
      status = 'qr';
      statusMessage = 'Scan QR code to connect';
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
        notifyRenderer('qr', { qr: qrDataUrl });
      } catch {
        notifyRenderer('qr', { qr });
      }
      notifyRenderer('status', { status, message: statusMessage });
    });

    client.on('ready', () => {
      if (initTimeout) clearTimeout(initTimeout);
      isReady = true;
      qrCodeData = null;
      reconnectAttempts = 0;
      status = 'ready';
      statusMessage = `Connected as ${(client as any).info?.pushname || 'WhatsApp'}`;
      notifyRenderer('status', { status, message: statusMessage });
      startHeartbeat();
    });

    client.on('disconnected', (reason: string) => {
      if (initTimeout) clearTimeout(initTimeout);
      stopHeartbeat();
      isReady = false;
      status = 'disconnected';
      statusMessage = `Disconnected: ${reason}`;
      qrCodeData = null;
      notifyRenderer('status', { status, message: statusMessage });
      client = null;

      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        setTimeout(() => initializeClient(), 5000);
      } else {
        statusMessage = 'Connection lost. Click "Connect WhatsApp" to retry.';
        notifyRenderer('status', { status, message: statusMessage });
      }
    });

    client.on('auth_failure', (msg: string) => {
      if (initTimeout) clearTimeout(initTimeout);
      stopHeartbeat();
      status = 'error';
      statusMessage = `Session expired. Please reconnect.`;
      notifyRenderer('status', { status, message: statusMessage });
      client = null;
      isReady = false;
      reconnectAttempts = 0;
    });

    client.on('error', (err: Error) => {
      if (initTimeout) clearTimeout(initTimeout);
      status = 'error';
      statusMessage = err.message;
      notifyRenderer('status', { status, message: statusMessage });
    });
  } catch (e) {
    if (initTimeout) clearTimeout(initTimeout);
    status = 'error';
    statusMessage = (e as Error).message;
    notifyRenderer('status', { status, message: statusMessage });
  }
}

export function getWhatsAppStatus(): { status: string; message: string; qr?: string | null } {
  return { status, message: statusMessage, qr: qrCodeData };
}

export async function disconnectWhatsApp(): Promise<{ success: boolean; error?: string }> {
  try {
    if (client) {
      try { await client.destroy(); } catch {}
      client = null;
    }
    isReady = false;
    qrCodeData = null;
    status = 'disconnected';
    statusMessage = 'Disconnected by user';
    notifyRenderer('status', { status, message: statusMessage });
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function reconnectWhatsApp(): Promise<{ success: boolean; error?: string }> {
  try {
    if (initTimeout) clearTimeout(initTimeout);
    stopHeartbeat();
    if (client) {
      try { await client.destroy(); } catch {}
      client = null;
    }
    isReady = false;
    qrCodeData = null;
    reconnectAttempts = 0;
    initializeClient();
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export async function sendWhatsAppDocument(opts: {
  phone: string;
  message: string;
  html: string;
  filename: string;
  companyName: string;
  customerName: string;
  docType: 'invoice' | 'receipt' | 'ledger';
  docNo: string;
  date: string;
  amount: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!client || !isReady) {
    return { success: false, error: 'WhatsApp not connected. Connect in Settings first.' };
  }

  const formattedPhone = formatPhoneNumber(opts.phone);
  if (!formattedPhone) {
    return { success: false, error: `Invalid phone number: ${opts.phone}. Use 10-digit number or include country code.` };
  }

  const chatId = formattedPhone;

  const tempDir = join(app.getPath('temp'), 'ledgermitra-whatsapp');
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
  const pdfPath = join(tempDir, opts.filename);

  try {
    const { generatePdf } = await import('./print');
    const pdf = await generatePdf(opts.html, { pageSize: 'A5' });
    writeFileSync(pdfPath, pdf);

    const finalMessage = opts.message || buildMessage({
      companyName: opts.companyName,
      customerName: opts.customerName,
      docType: opts.docType,
      docNo: opts.docNo,
      date: opts.date,
      amount: opts.amount
    });

    const media = MessageMedia.fromFilePath(pdfPath);

    const contact = await client.getContactById(chatId);
    if (!contact || !contact.isWAContact) {
      return { success: false, error: `Phone number not registered on WhatsApp. Verify ${opts.phone} is correct.` };
    }

    const chat = await client.getChatById(chatId);
    const sentMsg = await Promise.race([
      chat.sendMessage(media, { caption: finalMessage }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Send timed out after 60 seconds')), 60000))
    ]) as any;

    if (!sentMsg || !sentMsg.id) {
      return { success: false, error: 'Message failed to send. Please try again.' };
    }

    return { success: true };
  } catch (e) {
    const errMsg = (e as Error).message;
    if (errMsg.includes('timed out')) {
      return { success: false, error: 'Send timed out. Check your internet connection and try again.' };
    }
    if (errMsg.includes('not found') || errMsg.includes('invalid')) {
      return { success: false, error: `Phone number not found on WhatsApp. Verify ${opts.phone} is correct.` };
    }
    return { success: false, error: errMsg };
  } finally {
    if (existsSync(pdfPath)) {
      try { unlinkSync(pdfPath); } catch { /* ignore cleanup errors */ }
    }
  }
}

export function shutdownWhatsApp(): void {
  if (initTimeout) clearTimeout(initTimeout);
  stopHeartbeat();
  if (client) {
    client.destroy();
    client = null;
  }
  isReady = false;
  qrCodeData = null;
  reconnectAttempts = 0;
  status = 'disconnected';
  statusMessage = '';
  mainWindow = null;
}
