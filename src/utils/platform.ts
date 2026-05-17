/**
 * Platform — Async OS introspection with proper error boundaries
 */

import { exec } from 'child_process';
import { execSync } from 'child_process';
import * as os from 'os';
import { promisify } from 'util';

const execAsync = promisify(exec);
const EXEC_TIMEOUT = 15000;

export type OSType = 'windows' | 'linux' | 'macos' | 'unknown';

export interface SystemHardware {
    os: string;
    osVersion: string;
    cpuModel: string;
    cpuCores: number;
    totalRamGb: number;
    freeRamGb: number;
    gpu: string | null;
    totalVramGb: number | null;
    freeVramGb: number | null;
}

export interface InstalledPackage {
    name: string;
    version: string;
    source: 'pip' | 'npm' | 'system';
}

/** Sync exec — used only in non-blocking contexts (init-time) */
export function execSafe(command: string): string | null {
    try {
        return execSync(command, {
            encoding: 'utf-8',
            timeout: EXEC_TIMEOUT,
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        }).trim();
    } catch {
        return null;
    }
}

/** Async exec — preferred for all runtime operations */
export async function execSafeAsync(command: string): Promise<string | null> {
    try {
        const { stdout } = await execAsync(command, {
            timeout: EXEC_TIMEOUT,
            windowsHide: true,
            maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        });
        return stdout.trim();
    } catch {
        return null;
    }
}

export function getOSType(): OSType {
    const p = os.platform();
    if (p === 'win32') { return 'windows'; }
    if (p === 'linux') { return 'linux'; }
    if (p === 'darwin') { return 'macos'; }
    return 'unknown';
}

export function getOSVersion(): string {
    const t = getOSType();
    if (t === 'windows') { return execSafe('ver') || `Windows ${os.release()}`; }
    if (t === 'linux') {
        return execSafe('cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \\"') || `Linux ${os.release()}`;
    }
    if (t === 'macos') { return `macOS ${execSafe('sw_vers -productVersion') || os.release()}`; }
    return os.release();
}

export function getSystemHardware(): SystemHardware {
    const cpus = os.cpus();
    let gpu: string | null = null;
    let totalVram: number | null = null;
    let freeVram: number | null = null;

    const q = execSafe('nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits');
    if (q) {
        const p = q.split(',').map(s => s.trim());
        if (p.length >= 3) {
            gpu = p[0];
            totalVram = Math.round(parseInt(p[1]) / 1024 * 10) / 10;
            freeVram = Math.round(parseInt(p[2]) / 1024 * 10) / 10;
        }
    }

    return {
        os: getOSType(),
        osVersion: getOSVersion(),
        cpuModel: cpus.length > 0 ? cpus[0].model : 'Unknown',
        cpuCores: cpus.length,
        totalRamGb: Math.round(os.totalmem() / (1024 ** 3) * 10) / 10,
        freeRamGb: Math.round(os.freemem() / (1024 ** 3) * 10) / 10,
        gpu, totalVramGb: totalVram, freeVramGb: freeVram,
    };
}

/** Async version for runtime use */
export async function getSystemHardwareAsync(): Promise<SystemHardware> {
    const cpus = os.cpus();
    let gpu: string | null = null;
    let totalVram: number | null = null;
    let freeVram: number | null = null;

    const q = await execSafeAsync('nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits');
    if (q) {
        const p = q.split(',').map(s => s.trim());
        if (p.length >= 3) {
            gpu = p[0];
            totalVram = Math.round(parseInt(p[1]) / 1024 * 10) / 10;
            freeVram = Math.round(parseInt(p[2]) / 1024 * 10) / 10;
        }
    }

    return {
        os: getOSType(),
        osVersion: getOSVersion(),
        cpuModel: cpus.length > 0 ? cpus[0].model : 'Unknown',
        cpuCores: cpus.length,
        totalRamGb: Math.round(os.totalmem() / (1024 ** 3) * 10) / 10,
        freeRamGb: Math.round(os.freemem() / (1024 ** 3) * 10) / 10,
        gpu, totalVramGb: totalVram, freeVramGb: freeVram,
    };
}

export function getPythonVersion(): string | null {
    return execSafe('python --version')?.replace('Python ', '')
        || execSafe('python3 --version')?.replace('Python ', '')
        || null;
}

export function getNodeVersion(): string | null {
    const v = execSafe('node --version');
    return v ? v.replace('v', '') : null;
}

export async function getPipPackagesAsync(): Promise<InstalledPackage[]> {
    const output = await execSafeAsync('pip list --format=json')
        || await execSafeAsync('python -m pip list --format=json')
        || await execSafeAsync('python3 -m pip list --format=json');
    if (!output) { return []; }
    try {
        const parsed = JSON.parse(output) as Array<{ name: string; version: string }>;
        return parsed.map(p => ({ name: p.name.toLowerCase(), version: p.version, source: 'pip' as const }));
    } catch { return []; }
}

export function getPipPackages(): InstalledPackage[] {
    const output = execSafe('pip list --format=json')
        || execSafe('python -m pip list --format=json')
        || execSafe('python3 -m pip list --format=json');
    if (!output) { return []; }
    try {
        const parsed = JSON.parse(output) as Array<{ name: string; version: string }>;
        return parsed.map(p => ({ name: p.name.toLowerCase(), version: p.version, source: 'pip' as const }));
    } catch { return []; }
}

export async function getNpmPackagesAsync(): Promise<InstalledPackage[]> {
    const output = await execSafeAsync('npm list -g --json --depth=0');
    if (!output) { return []; }
    try {
        const parsed = JSON.parse(output);
        const deps = parsed.dependencies || {};
        return Object.entries(deps).map(([name, info]) => ({
            name,
            version: (info as { version?: string }).version || 'unknown',
            source: 'npm' as const,
        }));
    } catch { return []; }
}

export function getNpmPackages(): InstalledPackage[] {
    const output = execSafe('npm list -g --json --depth=0');
    if (!output) { return []; }
    try {
        const parsed = JSON.parse(output);
        const deps = parsed.dependencies || {};
        return Object.entries(deps).map(([name, info]) => ({
            name,
            version: (info as { version?: string }).version || 'unknown',
            source: 'npm' as const,
        }));
    } catch { return []; }
}

export function binaryExists(name: string): string | null {
    const cmd = getOSType() === 'windows' ? `where ${name}` : `which ${name}`;
    return execSafe(cmd);
}

export function getBinaryVersion(name: string): string | null {
    const output = execSafe(`${name} --version`) || execSafe(`${name} -v`);
    if (!output) { return null; }
    const match = output.match(/(\d+\.\d+(?:\.\d+)?)/);
    return match ? match[1] : output.split('\n')[0];
}

export function getCpuUsagePercent(): number {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const cpu of cpus) {
        const t = cpu.times;
        total += t.user + t.nice + t.sys + t.idle + t.irq;
        idle += t.idle;
    }
    return Math.round((1 - idle / total) * 100);
}

export function getGpuMetrics(): { utilizationPercent: number; vramUsedGb: number; vramTotalGb: number } | null {
    const output = execSafe('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits');
    if (!output) { return null; }
    const p = output.split(',').map(s => s.trim());
    if (p.length < 3) { return null; }
    return {
        utilizationPercent: parseInt(p[0]) || 0,
        vramUsedGb: Math.round(parseInt(p[1]) / 1024 * 100) / 100,
        vramTotalGb: Math.round(parseInt(p[2]) / 1024 * 100) / 100,
    };
}

export function getTopProcesses(count: number = 5): Array<{ name: string; cpu: number; memory: number }> {
    const t = getOSType();
    let output: string | null = null;

    if (t === 'windows') {
        output = execSafe(
            `powershell -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First ${count} ProcessName,@{N='CPU';E={[math]::Round($_.CPU,1)}},@{N='Mem';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json"`
        );
    } else {
        output = execSafe(`ps aux --sort=-%cpu | head -${count + 1} | tail -${count} | awk '{print $11","$3","$4}'`);
    }

    if (!output) { return []; }

    try {
        if (t === 'windows') {
            const parsed = JSON.parse(output);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            return arr.map((p: { ProcessName: string; CPU: number; Mem: number }) => ({
                name: p.ProcessName || 'unknown',
                cpu: p.CPU || 0,
                memory: p.Mem || 0,
            }));
        } else {
            return output.split('\n').filter(Boolean).map(line => {
                const parts = line.split(',');
                return { name: parts[0] || 'unknown', cpu: parseFloat(parts[1]) || 0, memory: parseFloat(parts[2]) || 0 };
            });
        }
    } catch { return []; }
}
