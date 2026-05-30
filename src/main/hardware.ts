import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { networkInterfaces } from 'os';

let cachedHardwareId: string | null = null;

function getMacAddress(): string {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        return iface.mac;
      }
    }
  }
  return '';
}

function getWmicValue(query: string): string {
  try {
    const result = execSync(`wmic ${query}`, {
      timeout: 3000,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    }).toString().trim();
    // Skip header line, get first data line
    const lines = result.split('\r\n').filter(l => l.trim());
    return lines.length > 1 ? lines[1].trim() : '';
  } catch {
    return '';
  }
}

export function generateHardwareId(): string {
  if (cachedHardwareId) return cachedHardwareId;

  const parts: string[] = [];

  // Fast: environment variables (instant)
  const computerName = process.env.COMPUTERNAME || '';
  const username = process.env.USERNAME || '';
  const processorId = process.env.PROCESSOR_IDENTIFIER || '';

  if (computerName) parts.push(`host:${computerName}`);
  if (username) parts.push(`user:${username}`);

  // Medium: MAC address (fast)
  const mac = getMacAddress();
  if (mac) parts.push(`mac:${mac}`);

  // Slow: WMI queries (only if we need more entropy)
  if (parts.length < 2) {
    const boardSerial = getWmicValue('baseboard get serialnumber');
    if (boardSerial) parts.push(`board:${boardSerial}`);

    const biosSerial = getWmicValue('bios get serialnumber');
    if (biosSerial) parts.push(`bios:${biosSerial}`);
  }

  if (parts.length === 0) {
    parts.push('fallback:default');
  }

  cachedHardwareId = createHash('sha256').update(parts.join('|')).digest('hex').substring(0, 16);
  return cachedHardwareId;
}

export function getHardwareInfo(): { boardSerial: string; cpuId: string; uuid: string; biosSerial: string } {
  return {
    boardSerial: getWmicValue('baseboard get serialnumber'),
    cpuId: getWmicValue('cpu get processorid'),
    uuid: getWmicValue('csproduct get uuid'),
    biosSerial: getWmicValue('bios get serialnumber')
  };
}
