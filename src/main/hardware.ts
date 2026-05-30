import { execSync } from 'child_process';
import { createHash } from 'crypto';

function wmiQuery(property: string, wmiClass: string): string {
  try {
    const result = execSync(
      `powershell -Command "(Get-WmiObject ${wmiClass}).${property}"`,
      { timeout: 5000, windowsHide: true }
    ).toString().trim();
    return result.split('\r\n')[0].trim();
  } catch {
    return '';
  }
}

export function generateHardwareId(): string {
  const parts: string[] = [];

  // Motherboard serial
  const boardSerial = wmiQuery('SerialNumber', 'Win32_BaseBoard');
  if (boardSerial) parts.push(`board:${boardSerial}`);

  // CPU processor ID
  const cpuId = wmiQuery('ProcessorId', 'Win32_Processor');
  if (cpuId) parts.push(`cpu:${cpuId}`);

  // System UUID
  const uuid = wmiQuery('UUID', 'Win32_ComputerSystemProduct');
  if (uuid) parts.push(`uuid:${uuid}`);

  // BIOS serial
  const biosSerial = wmiQuery('SerialNumber', 'Win32_BIOS');
  if (biosSerial) parts.push(`bios:${biosSerial}`);

  if (parts.length === 0) {
    // Fallback: use hostname + username
    const hostname = process.env.COMPUTERNAME || 'unknown';
    const username = process.env.USERNAME || 'unknown';
    parts.push(`host:${hostname}`);
    parts.push(`user:${username}`);
  }

  return createHash('sha256').update(parts.join('|')).digest('hex').substring(0, 16);
}

export function getHardwareInfo(): { boardSerial: string; cpuId: string; uuid: string; biosSerial: string } {
  return {
    boardSerial: wmiQuery('SerialNumber', 'Win32_BaseBoard'),
    cpuId: wmiQuery('ProcessorId', 'Win32_Processor'),
    uuid: wmiQuery('UUID', 'Win32_ComputerSystemProduct'),
    biosSerial: wmiQuery('SerialNumber', 'Win32_BIOS')
  };
}
