#!/usr/bin/env node

/**
 * LedgerMitra License Generator (Developer Only)
 *
 * Usage:
 *   npx tsx scripts/license-gen.ts                    # Generate new key
 *   npx tsx scripts/license-gen.ts --regenerate       # Regenerate lost key
 *   npx tsx scripts/license-gen.ts --verify <key>     # Verify a key
 *
 * This script generates license keys for LedgerMitra premium features.
 * It uses RSA-2048 to sign license payloads.
 *
 * NEVER share the private key. The public key is embedded in the app.
 */

import { generateKeyPairSync, createSign, createVerify, createPublicKey, randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const KEYS_DIR = join(__dirname, 'keys');
const PRIVATE_KEY_PATH = join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = join(KEYS_DIR, 'public.pem');

const PREMIUM_FEATURES = [
  { id: 'whatsapp', name: 'WhatsApp Integration' },
  { id: 'legacy_import', name: 'Legacy Import' },
  { id: 'multi_company', name: 'Multi-Company' },
  { id: 'backup', name: 'Backup & Restore' },
  { id: 'print_pdf', name: 'Print & PDF' }
];

interface LicensePayload {
  customer: string;
  type: 'perpetual' | 'subscription';
  features: string[];
  activations_max: number;
  expiry: string | null;
  issued: string;
  id: string;
}

// Ensure keys directory exists
if (!existsSync(KEYS_DIR)) {
  mkdirSync(KEYS_DIR, { recursive: true });
}

// Generate or load key pair
function getKeyPair(): { privateKey: string; publicKey: string } {
  if (existsSync(PRIVATE_KEY_PATH) && existsSync(PUBLIC_KEY_PATH)) {
    return {
      privateKey: readFileSync(PRIVATE_KEY_PATH, 'utf-8'),
      publicKey: readFileSync(PUBLIC_KEY_PATH, 'utf-8')
    };
  }

  console.log('  Generating new RSA-2048 key pair...');
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  writeFileSync(PRIVATE_KEY_PATH, privateKey);
  writeFileSync(PUBLIC_KEY_PATH, publicKey);
  console.log(`  Keys saved to: ${KEYS_DIR}`);
  console.log('  NEVER share private.pem with anyone!');

  return { privateKey, publicKey };
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): Buffer {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  return Buffer.from(padded, 'base64');
}

function generateLicenseKey(payload: LicensePayload, privateKey: string): string {
  const data = JSON.stringify(payload);
  const signer = createSign('RSA-SHA256');
  signer.update(data);
  const signature = signer.sign(privateKey, 'base64url');
  const encodedPayload = base64UrlEncode(data);
  return `LM-${encodedPayload}.${signature}`;
}

function parseLicenseKey(key: string): { payload: LicensePayload; signature: Buffer } | null {
  const cleaned = key.trim();
  if (!cleaned.startsWith('LM-')) return null;
  const parts = cleaned.substring(3).split('.');
  if (parts.length !== 2) return null;
  try {
    const payload: LicensePayload = JSON.parse(base64UrlDecode(parts[0]).toString('utf-8'));
    const signature = base64UrlDecode(parts[1]);
    return { payload, signature };
  } catch {
    return null;
  }
}

function verifyKey(key: string, publicKey: string): { valid: boolean; payload?: LicensePayload; error?: string } {
  const parsed = parseLicenseKey(key);
  if (!parsed) return { valid: false, error: 'Invalid key format' };
  const { payload, signature } = parsed;
  try {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(JSON.stringify(payload));
    if (!verifier.verify(createPublicKey(publicKey), signature)) {
      return { valid: false, error: 'Invalid signature' };
    }
    if (payload.type === 'subscription' && payload.expiry && new Date(payload.expiry) < new Date()) {
      return { valid: false, error: 'License expired', payload };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, error: 'Verification failed' };
  }
}

function createPrompt(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => { rl.question(question, (answer) => resolve(answer.trim())); });
}

function printPayload(payload: LicensePayload) {
  console.log('');
  console.log('  Customer:', payload.customer);
  console.log('  Type:', payload.type);
  console.log('  Features:', payload.features.join(', '));
  console.log('  Activations:', payload.activations_max);
  console.log('  Issued:', payload.issued);
  if (payload.expiry) console.log('  Expires:', payload.expiry);
}

async function generateNewKey() {
  const { privateKey, publicKey } = getKeyPair();
  const rl = createPrompt();

  try {
    const customer = await ask(rl, '  Customer name: ');
    if (!customer) { console.log('  Error: Customer name is required'); process.exit(1); }

    console.log('');
    console.log('  License types:');
    console.log('    1. Perpetual (one-time purchase, never expires)');
    console.log('    2. Subscription (yearly, expires after period)');
    const typeChoice = await ask(rl, '  Select type (1 or 2): ');
    const type = typeChoice === '2' ? 'subscription' : 'perpetual';

    let expiry: string | null = null;
    if (type === 'subscription') {
      const expiryInput = await ask(rl, '  Expiry date (YYYY-MM-DD): ');
      const expiryDate = new Date(expiryInput);
      if (isNaN(expiryDate.getTime())) { console.log('  Error: Invalid date'); process.exit(1); }
      expiry = expiryDate.toISOString().split('T')[0];
    }

    console.log('');
    console.log('  Available premium features:');
    PREMIUM_FEATURES.forEach((f, i) => { console.log(`    ${i + 1}. ${f.name} (${f.id})`); });
    console.log('    a. All features');
    const featuresInput = await ask(rl, '  Select features (comma-separated or "a" for all): ');

    let features: string[];
    if (featuresInput.toLowerCase() === 'a') {
      features = PREMIUM_FEATURES.map(f => f.id);
    } else {
      const indices = featuresInput.split(',').map(s => parseInt(s.trim()) - 1);
      features = indices.filter(i => i >= 0 && i < PREMIUM_FEATURES.length).map(i => PREMIUM_FEATURES[i].id);
    }
    if (features.length === 0) { console.log('  Error: At least one feature required'); process.exit(1); }

    const maxInput = await ask(rl, '  Max activations (default: 3): ');
    const activations_max = parseInt(maxInput) || 3;

    const payload: LicensePayload = {
      customer, type, features, activations_max, expiry,
      issued: new Date().toISOString().split('T')[0],
      id: randomBytes(8).toString('hex')
    };

    const licenseKey = generateLicenseKey(payload, privateKey);

    console.log('');
    console.log('  ==========================================');
    printPayload(payload);
    console.log('');
    console.log('  License key:');
    console.log('');
    console.log(`  ${licenseKey}`);
    console.log('');
    console.log('  ==========================================');
    console.log('');
    console.log('  Send this key to the customer.');
    console.log('  They activate it in: Settings > License > Activate');

  } finally { rl.close(); }
}

async function regenerateKey() {
  const { privateKey, publicKey } = getKeyPair();
  const rl = createPrompt();

  try {
    console.log('');
    console.log('  Paste the customer lost license key (or partial key):');
    const key = await ask(rl, '  Key: ');
    if (!key) { console.log('  Error: Key is required'); process.exit(1); }

    const parsed = parseLicenseKey(key);
    if (!parsed) { console.log('  Error: Could not parse key. Make sure it starts with LM-'); process.exit(1); }

    const verification = verifyKey(key, publicKey);
    if (!verification.payload) { console.log('  Error: Could not decode payload'); process.exit(1); }

    const payload = verification.payload;
    console.log('');
    console.log('  Found existing license:');
    printPayload(payload);

    console.log('');
    const regen = await ask(rl, '  Regenerate with same details? (Y/N): ');
    if (regen.toUpperCase() !== 'Y') { console.log('  Cancelled.'); process.exit(0); }

    const newKey = generateLicenseKey(payload, privateKey);

    console.log('');
    console.log('  ==========================================');
    console.log('  Regenerated license key (same details):');
    printPayload(payload);
    console.log('');
    console.log(`  ${newKey}`);
    console.log('');
    console.log('  ==========================================');
    console.log('');
    console.log('  Send this key to the customer.');

  } finally { rl.close(); }
}

async function verifyMode(key: string) {
  const { publicKey } = getKeyPair();
  const result = verifyKey(key, publicKey);

  console.log('');
  if (result.valid) {
    console.log('  VALID license');
    if (result.payload) printPayload(result.payload);
  } else {
    console.log('  INVALID:', result.error);
    if (result.payload) {
      console.log('');
      console.log('  (Payload was decoded but license has issues):');
      printPayload(result.payload);
    }
  }
  console.log('');
}

// Main
const args = process.argv.slice(2);

if (args[0] === '--verify' && args[1]) {
  verifyMode(args[1]).catch(console.error);
} else if (args[0] === '--regenerate') {
  regenerateKey().catch(console.error);
} else {
  console.log('');
  console.log('  ==========================================');
  console.log('    LedgerMitra License Generator');
  console.log('    Developer Use Only');
  console.log('  ==========================================');
  console.log('');
  console.log('  Modes:');
  console.log('    npx tsx scripts/license-gen.ts                 Generate new key');
  console.log('    npx tsx scripts/license-gen.ts --regenerate    Regenerate lost key');
  console.log('    npx tsx scripts/license-gen.ts --verify <key>  Verify a key');
  console.log('');

  if (args[0] === '--regenerate') {
    regenerateKey().catch(console.error);
  } else if (args[0] === '--verify' && args[1]) {
    verifyMode(args[1]).catch(console.error);
  } else {
    generateNewKey().catch(console.error);
  }
}
