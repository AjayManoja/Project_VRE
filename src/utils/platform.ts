/**
 * ═══════════════════════════════════════════════════════════════════
 *  VRE Platform — OS-specific helpers for system introspection
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Abstracts all OS-specific command invocations (pip, npm, python,
 *    nvidia-smi, wmic, etc.) behind a clean interface. Each method
 *    returns structured data regardless of the underlying OS.
 *
 *  USED BY:
 *    - src/migrate/systemScanner.ts   (reads installed packages)
 *    - src/monitor/metricsCollector.ts (reads CPU/RAM/GPU live stats)
 *    - src/vre/containerManager.ts    (reads host capacity)
 *
 *  DESIGN DECISION:
 *    Uses child_process.execSync for simplicity in the MVP. A future
 *    version should use async exec to avoid blocking the extension host.
 * ═══════════════════════════════════════════════════════════════════
 */

import { execSync } from 'child_process';
import * as os from 'os';

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

/**
 * Run a shell command and return trimmed stdout.
 * Returns null on failure instead of throwing.
 */
export function execSafe(command: string): string | null {
    try {
        return execSync(command, {
            encoding: 'utf-8',
            timeout: 15000,
            stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
    } catch {
        return null;
    }
}

/** Detect the current operating system */
export function getOSType(): OSType {
    const platform = os.platform();
    if (platform === 'win32') { return 'windows'; }
    if (platform === 'linux') { return 'linux'; }
    if (platform === 'darwin') { return 'macos'; }
    return 'unknown';
}

/** Get detailed OS version string */
export function getOSVersion(): string {
    const osType = getOSType();
    if (osType === 'windows') {
        const ver = execSafe('ver');
        return ver || `Windows ${os.release()}`;
    }
    if (osType === 'linux') {
        const pretty = execSafe('cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \\"');
        return pretty || `Linux ${os.release()}`;
    }
    if (osType === 'macos') {
        const ver = execSafe('sw_vers -productVersion');
        return `macOS ${ver || os.release()}`;
    }
    return os.release();
}

/** Get system hardware snapshot */
export function getSystemHardware(): SystemHardware {
    const cpus = os.cpus();
    const totalRam = os.totalmem();
    const freeRam = os.freemem();

    // GPU detection via nvidia-smi
    let gpu: string | null = null;
    let totalVram: number | null = null;
    let freeVram: number | null = null;

    const nvidiaQuery = execSafe(
        'nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits'
    );
    if (nvidiaQuery) {
        const parts = nvidiaQuery.split(',').map(s => s.trim());
        if (parts.length >= 3) {
            gpu = parts[0];
            totalVram = Math.round(parseInt(parts[1]) / 1024 * 10) / 10; // MB to GB
            freeVram = Math.round(parseInt(parts[2]) / 1024 * 10) / 10;
        }
    }

    return {
        os: getOSType(),
        osVersion: getOSVersion(),
        cpuModel: cpus.length > 0 ? cpus[0].model : 'Unknown',
        cpuCores: cpus.length,
        totalRamGb: Math.round(totalRam / (1024 ** 3) * 10) / 10,
        freeRamGb: Math.round(freeRam / (1024 ** 3) * 10) / 10,
        gpu,
        totalVramGb: totalVram,
        freeVramGb: freeVram,
    };
}

/** Get the installed Python version, or null if not found */
export function getPythonVersion(): string | null {
    return execSafe('python --version')?.replace('Python ', '')
        || execSafe('python3 --version')?.replace('Python ', '')
        || null;
}

/** Get the installed Node.js version, or null if not found */
export function getNodeVersion(): string | null {
    const v = execSafe('node --version');
    return v ? v.replace('v', '') : null;
}

/** List all pip-installed packages */
export function getPipPackages(): InstalledPackage[] {
    const output = execSafe('pip list --format=json')
        || execSafe('python -m pip list --format=json')
        || execSafe('python3 -m pip list --format=json');

    if (!output) { return []; }

    try {
        const parsed = JSON.parse(output) as Array<{ name: string; version: string }>;
        return parsed.map(p => ({
            name: p.name.toLowerCase(),
            version: p.version,
            source: 'pip' as const,
        }));
    } catch {
        return [];
    }
}

/** List all globally installed npm packages */
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
    } catch {
        return [];
    }
}

/** Check if a system binary exists on PATH */
export function binaryExists(name: string): string | null {
    const osType = getOSType();
    const cmd = osType === 'windows' ? `where ${name}` : `which ${name}`;
    return execSafe(cmd);
}

/** Get version of a system binary (tries --version and -v) */
export function getBinaryVersion(name: string): string | null {
    const output = execSafe(`${name} --version`) || execSafe(`${name} -v`);
    if (!output) { return null; }
    // Extract version-like pattern from output
    const match = output.match(/(\d+\.\d+(?:\.\d+)?)/);
    return match ? match[1] : output.split('\n')[0];
}

/**
 * Get live CPU usage percentage (averaged across all cores).
 * Uses a 1-second sample window.
 */
export function getCpuUsagePercent(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;
    for (const cpu of cpus) {
        const times = cpu.times;
        totalTick += times.user + times.nice + times.sys + times.idle + times.irq;
        totalIdle += times.idle;
    }
    return Math.round((1 - totalIdle / totalTick) * 100);
}

/**
 * Get live GPU utilization and VRAM usage via nvidia-smi.
 * Returns null if no NVIDIA GPU is available.
 */
export function getGpuMetrics(): { utilizationPercent: number; vramUsedGb: number; vramTotalGb: number } | null {
    const output = execSafe(
        'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits'
    );
    if (!output) { return null; }

    const parts = output.split(',').map(s => s.trim());
    if (parts.length < 3) { return null; }

    return {
        utilizationPercent: parseInt(parts[0]) || 0,
        vramUsedGb: Math.round(parseInt(parts[1]) / 1024 * 100) / 100,
        vramTotalGb: Math.round(parseInt(parts[2]) / 1024 * 100) / 100,
    };
}

/**
 * Get top CPU/memory consuming processes.
 * Returns process name and CPU/memory percentage.
 */
export function getTopProcesses(count: number = 5): Array<{ name: string; cpu: number; memory: number }> {
    const osType = getOSType();
    let output: string | null = null;

    if (osType === 'windows') {
        // Use PowerShell to get top processes by CPU
        output = execSafe(
            `powershell -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First ${count} ProcessName,@{N='CPU';E={[math]::Round($_.CPU,1)}},@{N='Mem';E={[math]::Round($_.WorkingSet64/1MB,1)}} | ConvertTo-Json"`
        );
    } else {
        output = execSafe(
            `ps aux --sort=-%cpu | head -${count + 1} | tail -${count} | awk '{print $11","$3","$4}'`
        );
    }

    if (!output) { return []; }

    try {
        if (osType === 'windows') {
            const parsed = JSON.parse(output);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            return arr.map((p: { ProcessName: string; CPU: number; Mem: number }) => ({
                name: p.ProcessName,
                cpu: p.CPU || 0,
                memory: p.Mem || 0,
            }));
        } else {
            return output.split('\n').filter(Boolean).map(line => {
                const parts = line.split(',');
                return {
                    name: parts[0] || 'unknown',
                    cpu: parseFloat(parts[1]) || 0,
                    memory: parseFloat(parts[2]) || 0,
                };
            });
        }
    } catch {
        return [];
    }
}
