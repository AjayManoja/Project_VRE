/**
 * Universal System Scanner — Detects ALL installed runtimes & tools
 *
 * Scans for: Python, Node.js, Rust, Go, Java, .NET, Ruby, PHP,
 *            Dart, Swift, Elixir, C/C++ toolchains, container runtimes,
 *            databases, and common dev tools.
 */

import { Logger } from '../utils/logger';
import {
    getSystemHardware, getPythonVersion, getNodeVersion,
    getPipPackages, getNpmPackages, binaryExists, getBinaryVersion,
    InstalledPackage, SystemHardware,
} from '../utils/platform';

const LOG_SOURCE = 'SystemScanner';

export interface RuntimeInfo {
    name: string;
    version: string | null;
    available: boolean;
    category: 'language' | 'toolchain' | 'container' | 'database' | 'tool';
}

export interface BinaryInfo {
    name: string;
    path: string | null;
    version: string | null;
    available: boolean;
}

export interface SystemSnapshot {
    scannedAt: string;
    hardware: SystemHardware;
    runtimes: RuntimeInfo[];
    packages: InstalledPackage[];
    binaries: BinaryInfo[];
    detectedLanguages: string[];
}

/** All runtimes/tools to scan — organized by category */
const RUNTIME_CHECKS: Array<{ name: string; category: RuntimeInfo['category']; versionCmd?: string }> = [
    // Languages
    { name: 'python', category: 'language' },
    { name: 'node', category: 'language' },
    { name: 'rustc', category: 'language' },
    { name: 'go', category: 'language' },
    { name: 'java', category: 'language' },
    { name: 'dotnet', category: 'language' },
    { name: 'ruby', category: 'language' },
    { name: 'php', category: 'language' },
    { name: 'dart', category: 'language' },
    { name: 'swift', category: 'language' },
    { name: 'elixir', category: 'language' },
    { name: 'perl', category: 'language' },
    { name: 'lua', category: 'language' },
    // Toolchains & package managers
    { name: 'cargo', category: 'toolchain' },
    { name: 'npm', category: 'toolchain' },
    { name: 'yarn', category: 'toolchain' },
    { name: 'pnpm', category: 'toolchain' },
    { name: 'pip', category: 'toolchain' },
    { name: 'composer', category: 'toolchain' },
    { name: 'gem', category: 'toolchain' },
    { name: 'gradle', category: 'toolchain' },
    { name: 'maven', category: 'toolchain', versionCmd: 'mvn' },
    { name: 'cmake', category: 'toolchain' },
    { name: 'make', category: 'toolchain' },
    { name: 'gcc', category: 'toolchain' },
    { name: 'g++', category: 'toolchain' },
    { name: 'clang', category: 'toolchain' },
    // Containers
    { name: 'docker', category: 'container' },
    { name: 'podman', category: 'container' },
    { name: 'kubectl', category: 'container' },
    // Databases
    { name: 'psql', category: 'database' },
    { name: 'mysql', category: 'database' },
    { name: 'sqlite3', category: 'database' },
    { name: 'redis-cli', category: 'database' },
    { name: 'mongosh', category: 'database' },
    // Dev tools
    { name: 'git', category: 'tool' },
    { name: 'curl', category: 'tool' },
    { name: 'wget', category: 'tool' },
    { name: 'ffmpeg', category: 'tool' },
    { name: 'terraform', category: 'tool' },
];

export function scanSystem(): SystemSnapshot {
    const logger = Logger.getInstance();
    logger.info(LOG_SOURCE, 'Starting universal system scan...');

    const hardware = getSystemHardware();
    logger.info(LOG_SOURCE, `Hardware: ${hardware.cpuCores} cores, ${hardware.totalRamGb}GB RAM, GPU: ${hardware.gpu || 'None'}`);

    // Scan all runtimes
    const runtimes: RuntimeInfo[] = [];
    const detectedLanguages: string[] = [];

    for (const check of RUNTIME_CHECKS) {
        const binName = check.versionCmd || check.name;
        let version: string | null = null;

        // Special cases for version detection
        if (check.name === 'python') {
            version = getPythonVersion();
        } else if (check.name === 'node') {
            version = getNodeVersion();
        } else {
            version = getBinaryVersion(binName);
        }

        const available = version !== null || binaryExists(binName) !== null;

        runtimes.push({ name: check.name, version, available, category: check.category });

        if (available && check.category === 'language') {
            detectedLanguages.push(check.name);
        }
    }

    const foundRuntimes = runtimes.filter(r => r.available);
    logger.info(LOG_SOURCE, `Found ${foundRuntimes.length} runtimes/tools`);
    logger.info(LOG_SOURCE, `Languages: ${detectedLanguages.join(', ') || 'none'}`);

    // Scan packages
    const pipPackages = getPipPackages();
    const npmPackages = getNpmPackages();
    const allPackages = [...pipPackages, ...npmPackages];
    logger.info(LOG_SOURCE, `Packages: ${pipPackages.length} pip, ${npmPackages.length} npm`);

    // Backwards-compatible binaries array
    const binaries: BinaryInfo[] = runtimes
        .filter(r => r.category === 'tool')
        .map(r => ({ name: r.name, path: r.available ? r.name : null, version: r.version, available: r.available }));

    const snapshot: SystemSnapshot = {
        scannedAt: new Date().toISOString(),
        hardware, runtimes, packages: allPackages, binaries, detectedLanguages,
    };

    logger.info(LOG_SOURCE, '✅ Universal system scan complete');
    return snapshot;
}

/** Format snapshot as human-readable text */
export function formatSnapshotText(snapshot: SystemSnapshot): string {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════');
    lines.push('  SYSTEM SNAPSHOT — Universal Environment Inventory');
    lines.push(`  Scanned: ${snapshot.scannedAt}`);
    lines.push('═══════════════════════════════════════════════════════');
    lines.push('');

    // Hardware
    lines.push('HARDWARE:');
    lines.push(`  OS         : ${snapshot.hardware.osVersion}`);
    lines.push(`  CPU        : ${snapshot.hardware.cpuModel}`);
    lines.push(`  CPU Cores  : ${snapshot.hardware.cpuCores}`);
    lines.push(`  RAM Total  : ${snapshot.hardware.totalRamGb} GB`);
    lines.push(`  RAM Free   : ${snapshot.hardware.freeRamGb} GB`);
    if (snapshot.hardware.gpu) {
        lines.push(`  GPU        : ${snapshot.hardware.gpu}`);
        lines.push(`  VRAM Total : ${snapshot.hardware.totalVramGb} GB`);
        lines.push(`  VRAM Free  : ${snapshot.hardware.freeVramGb} GB`);
    } else { lines.push('  GPU        : None detected'); }
    lines.push('');

    // Runtimes by category
    const categories: Array<{ label: string; key: RuntimeInfo['category'] }> = [
        { label: 'LANGUAGES', key: 'language' },
        { label: 'TOOLCHAINS & PACKAGE MANAGERS', key: 'toolchain' },
        { label: 'CONTAINERS', key: 'container' },
        { label: 'DATABASES', key: 'database' },
        { label: 'DEV TOOLS', key: 'tool' },
    ];

    for (const cat of categories) {
        const items = snapshot.runtimes.filter(r => r.category === cat.key);
        const found = items.filter(r => r.available);
        if (found.length === 0) { continue; }
        lines.push(`${cat.label}:`);
        for (const rt of found) {
            lines.push(`  ${rt.name.padEnd(14)} = ✅ ${rt.version || 'found'}`);
        }
        lines.push('');
    }

    // Packages
    lines.push(`INSTALLED PACKAGES (${snapshot.packages.length} total):`);
    const bySource = new Map<string, InstalledPackage[]>();
    for (const p of snapshot.packages) {
        const arr = bySource.get(p.source) || [];
        arr.push(p);
        bySource.set(p.source, arr);
    }
    for (const [source, pkgs] of bySource) {
        lines.push(`  [${source}] (${pkgs.length}):`);
        for (const p of pkgs.slice(0, 50)) { // Cap at 50 per source for readability
            lines.push(`    ${p.name.padEnd(30)} = ${p.version}`);
        }
        if (pkgs.length > 50) { lines.push(`    ... and ${pkgs.length - 50} more`); }
    }

    return lines.join('\n');
}
