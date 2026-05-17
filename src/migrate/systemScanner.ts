/**
 * ═══════════════════════════════════════════════════════════════════
 *  System Scanner — Reads what's already installed on the host
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Queries the developer's machine to build a complete picture of
 *    what is already installed: language runtimes, pip/npm packages,
 *    system binaries, hardware specs. This snapshot is compared
 *    against project requirements by deltaEngine.ts.
 *
 *  OUTPUT:
 *    A SystemSnapshot object containing:
 *      - hardware: CPU, RAM, GPU info
 *      - runtimes: Python, Node versions
 *      - packages: All pip and npm installed packages
 *      - binaries: Whether system tools (ffmpeg, git, etc.) exist
 *
 *  USED BY:
 *    - src/migrate/index.ts     (orchestrates full scan)
 *    - src/migrate/deltaEngine.ts (comparison target)
 * ═══════════════════════════════════════════════════════════════════
 */

import { Logger } from '../utils/logger';
import {
    getSystemHardware,
    getPythonVersion,
    getNodeVersion,
    getPipPackages,
    getNpmPackages,
    binaryExists,
    getBinaryVersion,
    InstalledPackage,
    SystemHardware,
} from '../utils/platform';

const LOG_SOURCE = 'SystemScanner';

export interface RuntimeInfo {
    name: string;
    version: string | null;
    available: boolean;
}

export interface BinaryInfo {
    name: string;
    path: string | null;
    version: string | null;
    available: boolean;
}

export interface SystemSnapshot {
    /** Timestamp of when the scan was performed */
    scannedAt: string;
    /** Hardware information */
    hardware: SystemHardware;
    /** Language runtimes */
    runtimes: RuntimeInfo[];
    /** Installed packages (pip + npm) */
    packages: InstalledPackage[];
    /** System binaries */
    binaries: BinaryInfo[];
}

/** Common system binaries to check for */
const COMMON_BINARIES = [
    'git', 'ffmpeg', 'docker', 'curl', 'wget',
    'gcc', 'g++', 'make', 'cmake',
    'java', 'rustc', 'cargo', 'go',
];

/**
 * Perform a complete system scan.
 * Collects hardware info, installed runtimes, packages, and binaries.
 */
export function scanSystem(): SystemSnapshot {
    const logger = Logger.getInstance();
    logger.info(LOG_SOURCE, 'Starting full system scan...');

    // 1. Hardware
    const hardware = getSystemHardware();
    logger.info(LOG_SOURCE, `Hardware: ${hardware.cpuCores} cores, ${hardware.totalRamGb}GB RAM, GPU: ${hardware.gpu || 'None'}`);

    // 2. Runtimes
    const runtimes: RuntimeInfo[] = [];

    const pythonVer = getPythonVersion();
    runtimes.push({
        name: 'python',
        version: pythonVer,
        available: pythonVer !== null,
    });

    const nodeVer = getNodeVersion();
    runtimes.push({
        name: 'node',
        version: nodeVer,
        available: nodeVer !== null,
    });

    logger.info(LOG_SOURCE, `Runtimes: Python ${pythonVer || 'NOT FOUND'}, Node ${nodeVer || 'NOT FOUND'}`);

    // 3. Packages
    const pipPackages = getPipPackages();
    const npmPackages = getNpmPackages();
    const allPackages = [...pipPackages, ...npmPackages];
    logger.info(LOG_SOURCE, `Packages: ${pipPackages.length} pip, ${npmPackages.length} npm`);

    // 4. System binaries
    const binaries: BinaryInfo[] = [];
    for (const bin of COMMON_BINARIES) {
        const binPath = binaryExists(bin);
        const version = binPath ? getBinaryVersion(bin) : null;
        binaries.push({
            name: bin,
            path: binPath,
            version,
            available: binPath !== null,
        });
    }
    const foundBinaries = binaries.filter(b => b.available).map(b => b.name);
    logger.info(LOG_SOURCE, `Binaries found: ${foundBinaries.join(', ') || 'none'}`);

    const snapshot: SystemSnapshot = {
        scannedAt: new Date().toISOString(),
        hardware,
        runtimes,
        packages: allPackages,
        binaries,
    };

    logger.info(LOG_SOURCE, '✅ System scan complete');
    return snapshot;
}

/**
 * Format a SystemSnapshot as a human-readable text file
 * (written to .migrate/system.snapshot).
 */
export function formatSnapshotText(snapshot: SystemSnapshot): string {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════');
    lines.push('  SYSTEM SNAPSHOT — What this machine already has');
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
    } else {
        lines.push('  GPU        : None detected');
    }
    lines.push('');

    // Runtimes
    lines.push('RUNTIMES:');
    for (const rt of snapshot.runtimes) {
        const status = rt.available ? `✅ ${rt.version}` : '❌ NOT FOUND';
        lines.push(`  ${rt.name.padEnd(12)} = ${status}`);
    }
    lines.push('');

    // Installed packages
    lines.push(`INSTALLED PACKAGES (${snapshot.packages.length} total):`);
    const pipPkgs = snapshot.packages.filter(p => p.source === 'pip');
    const npmPkgs = snapshot.packages.filter(p => p.source === 'npm');

    if (pipPkgs.length > 0) {
        lines.push('  [pip]:');
        for (const p of pipPkgs) {
            lines.push(`    ${p.name.padEnd(30)} = ${p.version}`);
        }
    }
    if (npmPkgs.length > 0) {
        lines.push('  [npm]:');
        for (const p of npmPkgs) {
            lines.push(`    ${p.name.padEnd(30)} = ${p.version}`);
        }
    }
    lines.push('');

    // Binaries
    lines.push('SYSTEM BINARIES:');
    for (const bin of snapshot.binaries) {
        const status = bin.available
            ? `✅ ${bin.version || 'found'}`
            : '❌ NOT FOUND';
        lines.push(`  ${bin.name.padEnd(12)} = ${status}`);
    }

    return lines.join('\n');
}
