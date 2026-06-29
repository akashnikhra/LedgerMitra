import { app } from 'electron';
import { join, parse } from 'path';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readdirSync, statSync } from 'fs';

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

    const driveLetter = drive.replace(':\\', ':');

    // Method 1: Try PowerShell (works on all modern Windows)
    try {
      const psResult = execSync(
        `powershell -NoProfile -Command "(Get-Volume -DriveLetter '${driveLetter[0]}').DriveType"`,
        { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).toString().trim();
      if (psResult === 'Removable') return true;
      if (psResult && psResult !== 'Fixed' && psResult !== 'CD-ROM') return true;
    } catch {
      // PowerShell failed, try next method
    }

    // Method 2: Try wmic (legacy, may not work on newer Windows)
    try {
      const wmicResult = execSync(
        `wmic logicaldisk where "DeviceID='${driveLetter}'" get DriveType /value`,
        { timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
      ).toString();
      const match = wmicResult.match(/DriveType=(\d+)/);
      if (match && parseInt(match[1], 10) === 2) return true;
    } catch {
      // wmic failed, continue
    }

    // Method 3: Check if running from a folder that looks like USB layout
    // (has LedgerMitra.exe sibling or is on a non-C drive with specific markers)
    const exeDir = join(exePath, '..');
    const hasPortableMarker = existsSync(join(exeDir, 'portable.txt')) || existsSync(join(exeDir, '.portable'));
    if (hasPortableMarker) return true;

  } catch {
    // Detection failed — standard mode
  }

  return false;
}

export function setupPortable(): void {
  console.log(`[Portable] process.execPath: ${process.execPath}`);
  console.log(`[Portable] LEDGERMITRA_PORTABLE env: ${process.env.LEDGERMITRA_PORTABLE}`);

  if (!detectRemovableDrive()) {
    console.log('[Portable] Not running from removable drive — standard mode');
    return;
  }

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
  console.log(`[Portable] app.getPath('userData') after redirect: ${app.getPath('userData')}`);
  console.log(`[Portable] LEDGERMITRA_DATA_DIR: ${process.env.LEDGERMITRA_DATA_DIR}`);
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
