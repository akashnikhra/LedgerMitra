#!/usr/bin/env node

/**
 * LedgerMitra License Generator (Developer Only)
 *
 * Usage:
 *   npx tsx scripts/license-gen.ts
 *
 * This script generates license keys for LedgerMitra premium features.
 * It uses RSA-2048 to sign license payloads.
 *
 * NEVER share the private key. The public key is embedded in the app.
 */

import { generateKeyPairSync, createSign, randomBytes } from 'crypto';
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
    console.log('  Loading existing key pair...');
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
  console.log('  ⚠️  NEVER share private.pem with anyone!');

  return { privateKey, publicKey };
}

// Base64url encode
function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Generate license key
function generateLicenseKey(payload: LicensePayload, privateKey: string): string {
  const data = JSON.stringify(payload);
  const signer = createSign('RSA-SHA256');
  signer.update(data);
  const signature = signer.sign(privateKey, 'base64url');
  const encodedPayload = base64UrlEncode(data);
  return `LM-${encodedPayload}.${signature}`;
}

// Interactive prompt
function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function main() {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║   LedgerMitra License Generator           ║');
  console.log('  ║   Developer Use Only                      ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');

  const { privateKey, publicKey } = getKeyPair();
  console.log('');
  console.log(`  Public key (embed in license.ts):`);
  console.log(`  ${publicKey.substring(0, 80)}...`);
  console.log('');

  const rl = createPrompt();

  try {
    // Customer name
    const customer = await ask(rl, '  Customer name: ');
    if (!customer) {
      console.log('  Error: Customer name is required');
      process.exit(1);
    }

    // License type
    console.log('');
    console.log('  License types:');
    console.log('    1. Perpetual (one-time purchase, never expires)');
    console.log('    2. Subscription (yearly, expires after period)');
    const typeChoice = await ask(rl, '  Select type (1 or 2): ');
    const type = typeChoice === '2' ? 'subscription' : 'perpetual';

    // Expiry date for subscriptions
    let expiry: string | null = null;
    if (type === 'subscription') {
      const expiryInput = await ask(rl, '  Expiry date (YYYY-MM-DD): ');
      const expiryDate = new Date(expiryInput);
      if (isNaN(expiryDate.getTime())) {
        console.log('  Error: Invalid date format');
        process.exit(1);
      }
      expiry = expiryDate.toISOString().split('T')[0];
    }

    // Features
    console.log('');
    console.log('  Available premium features:');
    PREMIUM_FEATURES.forEach((f, i) => {
      console.log(`    ${i + 1}. ${f.name} (${f.id})`);
    });
    console.log('    a. All features');
    const featuresInput = await ask(rl, '  Select features (comma-separated numbers or "a" for all): ');

    let features: string[];
    if (featuresInput.toLowerCase() === 'a') {
      features = PREMIUM_FEATURES.map(f => f.id);
    } else {
      const indices = featuresInput.split(',').map(s => parseInt(s.trim()) - 1);
      features = indices
        .filter(i => i >= 0 && i < PREMIUM_FEATURES.length)
        .map(i => PREMIUM_FEATURES[i].id);
    }

    if (features.length === 0) {
      console.log('  Error: At least one feature must be selected');
      process.exit(1);
    }

    // Max activations
    const maxActivationsInput = await ask(rl, '  Max activations (default: 3): ');
    const activations_max = parseInt(maxActivationsInput) || 3;

    // Generate license
    const payload: LicensePayload = {
      customer,
      type,
      features,
      activations_max,
      expiry,
      issued: new Date().toISOString().split('T')[0],
      id: randomBytes(8).toString('hex')
    };

    const licenseKey = generateLicenseKey(payload, privateKey);

    console.log('');
    console.log('  ═══════════════════════════════════════════');
    console.log('');
    console.log('  License generated successfully!');
    console.log('');
    console.log('  Customer:', customer);
    console.log('  Type:', type);
    console.log('  Features:', features.join(', '));
    console.log('  Activations:', activations_max);
    if (expiry) console.log('  Expires:', expiry);
    console.log('');
    console.log('  License key:');
    console.log('');
    console.log(`  ${licenseKey}`);
    console.log('');
    console.log('  ═══════════════════════════════════════════');
    console.log('');

    // Copy to clipboard hint
    console.log('  Copy the key above and share it with the customer.');
    console.log('  They can activate it in: Settings > License > Activate');
    console.log('');

  } finally {
    rl.close();
  }
}

main().catch(console.error);
