/**
 * System Inventory — scans what's already installed on this machine.
 */

import { getHardware, getPipPackages, getNpmPackages, binaryVersion, binaryExists, HardwareInfo, PackageEntry } from '../utils/platform';

export interface RuntimeEntry {
    name: string;
    version: string | null;
    found: boolean;
}

export interface SystemSnapshot {
    scannedAt: string;
    hardware: HardwareInfo;
    runtimes: RuntimeEntry[];
    packages: PackageEntry[];
}

const RUNTIMES = [
    'python', 'node', 'rustc', 'go', 'java', 'dotnet', 'ruby', 'php',
    'dart', 'swift', 'cargo', 'npm', 'pip', 'composer', 'gem',
    'docker', 'git', 'gcc', 'cmake', 'make', 'curl', 'ffmpeg',
    'psql', 'mysql', 'sqlite3', 'redis-cli',
];

export async function scanSystem(): Promise<SystemSnapshot> {
    const hardware = getHardware();

    const runtimes: RuntimeEntry[] = RUNTIMES.map(name => {
        const version = binaryVersion(name);
        return { name, version, found: version !== null || binaryExists(name) };
    });

    const pip = await getPipPackages();
    const npm = await getNpmPackages();

    return {
        scannedAt: new Date().toISOString(),
        hardware,
        runtimes,
        packages: [...pip, ...npm],
    };
}

export function formatSnapshot(snap: SystemSnapshot): string {
    const lines: string[] = [
        `SYSTEM: ${snap.hardware.osVersion}, ${snap.hardware.cores} cores, ${snap.hardware.ramTotalGb}GB RAM`,
    ];
    if (snap.hardware.gpu) lines.push(`GPU: ${snap.hardware.gpu}, ${snap.hardware.vramTotalGb}GB VRAM`);
    else lines.push('GPU: None');

    lines.push('');
    const found = snap.runtimes.filter(r => r.found);
    if (found.length) {
        lines.push('INSTALLED:');
        for (const r of found) lines.push(`  ${r.name}: ${r.version || 'found'}`);
    }

    lines.push('');
    lines.push(`PACKAGES: ${snap.packages.length} total (${snap.packages.filter(p => p.source === 'pip').length} pip, ${snap.packages.filter(p => p.source === 'npm').length} npm)`);
    return lines.join('\n');
}
