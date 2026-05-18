import { exec, execSync } from 'child_process';
import * as os from 'os';
import { promisify } from 'util';

const run = promisify(exec);
const TIMEOUT = 15_000;

export type OSType = 'windows' | 'linux' | 'macos' | 'unknown';

export interface HardwareInfo {
    os: OSType;
    osVersion: string;
    cpu: string;
    cores: number;
    ramTotalGb: number;
    ramFreeGb: number;
    gpu: string | null;
    vramTotalGb: number | null;
    vramFreeGb: number | null;
}

export interface PackageEntry {
    name: string;
    version: string;
    source: 'pip' | 'npm';
}

export function getOS(): OSType {
    const p = os.platform();
    if (p === 'win32') return 'windows';
    if (p === 'linux') return 'linux';
    if (p === 'darwin') return 'macos';
    return 'unknown';
}

function execSafe(cmd: string): string | null {
    try {
        return execSync(cmd, { encoding: 'utf-8', timeout: TIMEOUT, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }).trim();
    } catch { return null; }
}

export async function execAsync(cmd: string): Promise<string | null> {
    try {
        const { stdout } = await run(cmd, { timeout: TIMEOUT, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
        return stdout.trim();
    } catch { return null; }
}

export function getHardware(): HardwareInfo {
    const cpus = os.cpus();
    const osType = getOS();

    let osVersion = os.release();
    if (osType === 'windows') osVersion = execSafe('ver') || `Windows ${os.release()}`;
    else if (osType === 'macos') osVersion = `macOS ${execSafe('sw_vers -productVersion') || os.release()}`;
    else if (osType === 'linux') osVersion = execSafe('cat /etc/os-release | grep PRETTY_NAME | cut -d= -f2 | tr -d \\"') || `Linux ${os.release()}`;

    let gpu: string | null = null;
    let vramTotal: number | null = null;
    let vramFree: number | null = null;
    const nv = execSafe('nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv,noheader,nounits');
    if (nv) {
        const parts = nv.split(',').map(s => s.trim());
        if (parts.length >= 3) {
            gpu = parts[0];
            vramTotal = Math.round(parseInt(parts[1]) / 1024 * 10) / 10;
            vramFree = Math.round(parseInt(parts[2]) / 1024 * 10) / 10;
        }
    }

    return {
        os: osType, osVersion,
        cpu: cpus[0]?.model || 'Unknown',
        cores: cpus.length,
        ramTotalGb: Math.round(os.totalmem() / (1024 ** 3) * 10) / 10,
        ramFreeGb: Math.round(os.freemem() / (1024 ** 3) * 10) / 10,
        gpu, vramTotalGb: vramTotal, vramFreeGb: vramFree,
    };
}

export function getCpuPercent(): number {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    for (const c of cpus) {
        const t = c.times;
        total += t.user + t.nice + t.sys + t.idle + t.irq;
        idle += t.idle;
    }
    return Math.round((1 - idle / total) * 100);
}

export function getGpuUsage(): { percent: number; usedGb: number; totalGb: number } | null {
    const out = execSafe('nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits');
    if (!out) return null;
    const p = out.split(',').map(s => s.trim());
    if (p.length < 3) return null;
    return { percent: parseInt(p[0]) || 0, usedGb: Math.round(parseInt(p[1]) / 1024 * 100) / 100, totalGb: Math.round(parseInt(p[2]) / 1024 * 100) / 100 };
}

export async function getPipPackages(): Promise<PackageEntry[]> {
    const out = await execAsync('pip list --format=json') || await execAsync('python -m pip list --format=json');
    if (!out) return [];
    try {
        return (JSON.parse(out) as Array<{ name: string; version: string }>).map(p => ({ name: p.name.toLowerCase(), version: p.version, source: 'pip' as const }));
    } catch { return []; }
}

export async function getNpmPackages(): Promise<PackageEntry[]> {
    const out = await execAsync('npm list -g --json --depth=0');
    if (!out) return [];
    try {
        const deps = JSON.parse(out).dependencies || {};
        return Object.entries(deps).map(([name, info]) => ({ name, version: (info as { version?: string }).version || 'unknown', source: 'npm' as const }));
    } catch { return []; }
}

export function binaryVersion(name: string): string | null {
    const out = execSafe(`${name} --version`) || execSafe(`${name} -v`);
    if (!out) return null;
    const m = out.match(/(\d+\.\d+(?:\.\d+)?)/);
    return m ? m[1] : out.split('\n')[0];
}

export function binaryExists(name: string): boolean {
    const cmd = getOS() === 'windows' ? `where ${name}` : `which ${name}`;
    return execSafe(cmd) !== null;
}
