import { app } from 'electron';
import { join, parse } from 'path';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync } from 'fs';

let _isPortable = false;
let _usbRoot = '';

export function isPortable(): boolean {
  return _isPortable;
}

export function getUsbRoot(): string {
  return _usbRoot;
}

function detectRemovableDrive(): boolean {
  // If explicitly set, respect it
  if (process.env.LEDGERMITRA_PORTABLE === '1') return true;

  try {
    const exePath = process.execPath;
    const drive = parse(exePath).root; // e.g. "E:\"

    if (!drive || drive === 'C:\\') return false;

    // Check Windows drive type via wmic: DriveType 2 = Removable
    const driveLetter = drive.replace(':\\', ':');
    const result = execSync(
      `wmic logicaldisk where "DeviceID='${driveLetter}'" get DriveType /value`,
      { timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).toString();

    const match = result.match(/DriveType=(\d+)/);
    if (match && parseInt(match[1], 10) === 2) {
      return true;
    }
  } catch {
    // wmic failed — fall back to false
  }

  return false;
}

export function setupPortable(): void {
  if (!detectRemovableDrive()) return;

  _isPortable = true;

  // USB root = directory containing the executable
  _usbRoot = join(process.execPath, '..');

  // Redirect Electron userData (WhatsApp session, etc.)
  app.setPath('userData', join(_usbRoot, 'LedgerMitra'));

  // Redirect temp (WhatsApp PDFs)
  app.setPath('temp', join(_usbRoot, 'LedgerMitra', 'temp'));

  // Redirect database location
  process.env.LEDGERMITRA_DATA_DIR = join(_usbRoot, 'LedgerMitra', 'data');

  // Create required directories
  const dirs = [
    join(_usbRoot, 'LedgerMitra'),
    join(_usbRoot, 'LedgerMitra', 'data'),
    join(_usbRoot, 'LedgerMitra', 'temp'),
    join(_usbRoot, 'LedgerMitra', 'Upload', 'Merged'),
  ];
  for (const dir of dirs) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  console.log('[Portable] Detected removable drive — all data will be stored on USB');
  console.log(`[Portable] USB root: ${_usbRoot}`);
  console.log(`[Portable] Database: ${process.env.LEDGERMITRA_DATA_DIR}`);
}

export function cleanupPortableTemp(): void {
  if (!_isPortable) return;

  const tempDir = join(_usbRoot, 'LedgerMitra', 'temp');
  try {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  } catch {
    // Best effort — USB may already be removed
  }
}
