/**
 * ═══════════════════════════════════════════════════════════════════
 *  Delta Engine — Computes the gap between project needs and system
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Takes the output of requirementScanner (what the project needs)
 *    and systemScanner (what the system has), and computes delta.X:
 *    the precise gap of what is missing, what is satisfied, and what
 *    conflicts. This is the most important file for LLM consumption.
 *
 *  OUTPUT:
 *    - DeltaReport object (structured)
 *    - delta.X text file (LLM-friendly)
 *    - env.setup text file (human-friendly install plan)
 *
 *  USED BY:
 *    - src/migrate/index.ts  (orchestrates everything)
 *
 *  VERSIONING LOGIC:
 *    Uses semver-like comparison:
 *    - ">=1.9.0" → installed 2.0.1 satisfies (2.0.1 >= 1.9.0)
 *    - "==1.21.0" → installed 1.24.3 does NOT satisfy exact match
 *    - "^2.0.0" → installed 2.3.0 satisfies (same major)
 *    - "~1.5.0" → installed 1.5.9 satisfies (same major.minor)
 *    - "*" → any version satisfies
 * ═══════════════════════════════════════════════════════════════════
 */

import { ProjectRequirement } from './requirementScanner';
import { SystemSnapshot } from './systemScanner';
import { Logger } from '../utils/logger';

const LOG_SOURCE = 'DeltaEngine';

export type DeltaStatus = 'satisfied' | 'missing' | 'version_mismatch';

export interface DeltaItem {
    name: string;
    required: string;
    installed: string | null;
    status: DeltaStatus;
    source: string;
    note: string;
}

export interface DeltaReport {
    generatedAt: string;
    projectPath: string;
    satisfied: DeltaItem[];
    missing: DeltaItem[];
    mismatched: DeltaItem[];
    hardwareCheck: {
        ramSufficient: boolean;
        vramSufficient: boolean;
        ramAvailableGb: number;
        vramAvailableGb: number | null;
    };
}

/**
 * Parse a version string into numeric components [major, minor, patch].
 * Returns [0,0,0] if parsing fails.
 */
function parseVersion(version: string): [number, number, number] {
    const clean = version.replace(/^[v=]/, '').trim();
    const parts = clean.split('.').map(Number);
    return [
        parts[0] || 0,
        parts[1] || 0,
        parts[2] || 0,
    ];
}

/**
 * Compare two version tuples.
 * Returns: -1 if a < b, 0 if a === b, 1 if a > b
 */
function compareVersions(a: [number, number, number], b: [number, number, number]): number {
    for (let i = 0; i < 3; i++) {
        if (a[i] < b[i]) { return -1; }
        if (a[i] > b[i]) { return 1; }
    }
    return 0;
}

/**
 * Check if an installed version satisfies a version specifier.
 *
 * Supported specifiers:
 *   "*"        → any version
 *   ">=1.9.0"  → greater than or equal
 *   "<=2.0.0"  → less than or equal
 *   "==1.21.0" → exact match
 *   "!=1.0.0"  → not equal
 *   "^2.0.0"   → compatible (same major)
 *   "~1.5.0"   → approximately (same major.minor)
 *   ">1.0.0"   → strictly greater
 *   "<2.0.0"   → strictly less
 *   "1.9.0"    → treated as >=
 */
function satisfiesVersion(installed: string, spec: string): boolean {
    if (spec === '*' || !spec) { return true; }

    const installedVer = parseVersion(installed);

    // Handle compound specs: ">=1.0.0,<2.0.0"
    if (spec.includes(',')) {
        return spec.split(',').every(s => satisfiesVersion(installed, s.trim()));
    }

    // Exact match
    if (spec.startsWith('==')) {
        const required = parseVersion(spec.substring(2));
        return compareVersions(installedVer, required) === 0;
    }

    // Not equal
    if (spec.startsWith('!=')) {
        const required = parseVersion(spec.substring(2));
        return compareVersions(installedVer, required) !== 0;
    }

    // Greater or equal
    if (spec.startsWith('>=')) {
        const required = parseVersion(spec.substring(2));
        return compareVersions(installedVer, required) >= 0;
    }

    // Less or equal
    if (spec.startsWith('<=')) {
        const required = parseVersion(spec.substring(2));
        return compareVersions(installedVer, required) <= 0;
    }

    // Strictly greater
    if (spec.startsWith('>') && !spec.startsWith('>=')) {
        const required = parseVersion(spec.substring(1));
        return compareVersions(installedVer, required) > 0;
    }

    // Strictly less
    if (spec.startsWith('<') && !spec.startsWith('<=')) {
        const required = parseVersion(spec.substring(1));
        return compareVersions(installedVer, required) < 0;
    }

    // Caret ^: compatible with same major version
    if (spec.startsWith('^')) {
        const required = parseVersion(spec.substring(1));
        return installedVer[0] === required[0] && compareVersions(installedVer, required) >= 0;
    }

    // Tilde ~: approximately same major.minor
    if (spec.startsWith('~')) {
        const required = parseVersion(spec.substring(1));
        return installedVer[0] === required[0]
            && installedVer[1] === required[1]
            && compareVersions(installedVer, required) >= 0;
    }

    // Bare version number: treat as >=
    if (/^\d/.test(spec)) {
        const required = parseVersion(spec);
        return compareVersions(installedVer, required) >= 0;
    }

    // Unknown spec format — assume not satisfied to be safe
    return false;
}

/**
 * Compute the delta between project requirements and system snapshot.
 */
export function computeDelta(
    requirements: ProjectRequirement[],
    snapshot: SystemSnapshot,
    projectPath: string
): DeltaReport {
    const logger = Logger.getInstance();
    logger.info(LOG_SOURCE, `Computing delta for ${requirements.length} requirements`);

    const satisfied: DeltaItem[] = [];
    const missing: DeltaItem[] = [];
    const mismatched: DeltaItem[] = [];

    // Build lookup maps for quick searching
    const pipMap = new Map<string, string>();
    const npmMap = new Map<string, string>();
    const runtimeMap = new Map<string, string | null>();
    const binaryMap = new Map<string, string | null>();

    for (const pkg of snapshot.packages) {
        if (pkg.source === 'pip') { pipMap.set(pkg.name, pkg.version); }
        if (pkg.source === 'npm') { npmMap.set(pkg.name, pkg.version); }
    }
    for (const rt of snapshot.runtimes) {
        runtimeMap.set(rt.name, rt.version);
    }
    for (const bin of snapshot.binaries) {
        binaryMap.set(bin.name, bin.version);
    }

    for (const req of requirements) {
        let installedVersion: string | null = null;

        // Check runtimes first (python, node)
        if (runtimeMap.has(req.name)) {
            installedVersion = runtimeMap.get(req.name) || null;
        }
        // Then packages
        else if (req.source === 'pip') {
            installedVersion = pipMap.get(req.name) || null;
        }
        else if (req.source === 'npm') {
            installedVersion = npmMap.get(req.name) || null;
        }
        // Then system binaries
        else if (req.source === 'system' || req.source === 'engines') {
            if (req.name === 'node') {
                installedVersion = runtimeMap.get('node') || null;
            } else if (req.name === 'python') {
                installedVersion = runtimeMap.get('python') || null;
            } else {
                installedVersion = binaryMap.get(req.name) || null;
            }
        }

        if (installedVersion === null) {
            // Package not found at all
            missing.push({
                name: req.name,
                required: req.versionSpec,
                installed: null,
                status: 'missing',
                source: req.source,
                note: `${req.name} not found on system`,
            });
        } else if (satisfiesVersion(installedVersion, req.versionSpec)) {
            // Installed version satisfies the requirement
            satisfied.push({
                name: req.name,
                required: req.versionSpec,
                installed: installedVersion,
                status: 'satisfied',
                source: req.source,
                note: `${installedVersion} satisfies ${req.versionSpec}`,
            });
        } else {
            // Installed but version doesn't match
            mismatched.push({
                name: req.name,
                required: req.versionSpec,
                installed: installedVersion,
                status: 'version_mismatch',
                source: req.source,
                note: `${installedVersion} does NOT satisfy ${req.versionSpec}`,
            });
        }
    }

    const report: DeltaReport = {
        generatedAt: new Date().toISOString(),
        projectPath,
        satisfied,
        missing,
        mismatched,
        hardwareCheck: {
            ramSufficient: snapshot.hardware.freeRamGb >= 4,
            vramSufficient: snapshot.hardware.freeVramGb !== null ? snapshot.hardware.freeVramGb >= 2 : true,
            ramAvailableGb: snapshot.hardware.freeRamGb,
            vramAvailableGb: snapshot.hardware.freeVramGb,
        },
    };

    logger.info(LOG_SOURCE, `Delta computed: ${satisfied.length} satisfied, ${missing.length} missing, ${mismatched.length} mismatched`);
    return report;
}

/**
 * Format delta report as the LLM-friendly delta.X text file.
 * This is the most important output for AI assistant consumption.
 */
export function formatDeltaX(report: DeltaReport, snapshot: SystemSnapshot): string {
    const lines: string[] = [];

    lines.push('=== VRE delta.X — Environment Gap Report ===');
    lines.push(`Generated: ${report.generatedAt}`);
    lines.push(`Project: ${report.projectPath}`);
    lines.push('');

    // System snapshot summary
    lines.push('SYSTEM SNAPSHOT:');
    lines.push(`  OS: ${snapshot.hardware.osVersion}`);
    for (const rt of snapshot.runtimes) {
        lines.push(`  ${rt.name}: ${rt.available ? rt.version : 'NOT FOUND'}`);
    }
    // Show key packages
    const keyPackages = ['torch', 'tensorflow', 'numpy', 'pandas', 'flask', 'django', 'express', 'react'];
    for (const pkg of snapshot.packages) {
        if (keyPackages.includes(pkg.name)) {
            lines.push(`  ${pkg.name}: ${pkg.version}`);
        }
    }
    lines.push(`  Free RAM: ${snapshot.hardware.freeRamGb} GB`);
    if (snapshot.hardware.gpu) {
        lines.push(`  Free VRAM: ${snapshot.hardware.freeVramGb} GB (GPU: ${snapshot.hardware.gpu})`);
    }
    lines.push('');

    // Project requirements summary
    lines.push('PROJECT REQUIREMENTS:');
    const allItems = [...report.satisfied, ...report.missing, ...report.mismatched];
    for (const item of allItems) {
        lines.push(`  ${item.name} ${item.required}`);
    }
    lines.push('');

    // Gap analysis
    lines.push('GAP ANALYSIS:');

    if (report.satisfied.length > 0) {
        lines.push('  SATISFIED (no action needed):');
        for (const item of report.satisfied) {
            lines.push(`    ${item.name} ${item.installed} ✅ satisfies ${item.required}`);
        }
    }

    lines.push('');

    if (report.missing.length > 0) {
        lines.push('  MISSING (action required):');
        for (const item of report.missing) {
            lines.push(`    ${item.name} ❌ not found on system`);
        }
    }

    if (report.mismatched.length > 0) {
        lines.push('  VERSION MISMATCH (review required):');
        for (const item of report.mismatched) {
            lines.push(`    ${item.name} ⚠️  installed ${item.installed}, requires ${item.required}`);
        }
    }

    if (report.missing.length === 0 && report.mismatched.length === 0) {
        lines.push('  ✅ ALL REQUIREMENTS SATISFIED — no action needed');
    }

    lines.push('');

    // Hardware check
    lines.push('HARDWARE CHECK:');
    lines.push(`  RAM: ${report.hardwareCheck.ramSufficient ? '✅' : '❌'} ${report.hardwareCheck.ramAvailableGb}GB available`);
    if (report.hardwareCheck.vramAvailableGb !== null) {
        lines.push(`  VRAM: ${report.hardwareCheck.vramSufficient ? '✅' : '❌'} ${report.hardwareCheck.vramAvailableGb}GB available`);
    } else {
        lines.push('  VRAM: N/A (no GPU detected)');
    }

    lines.push('');
    lines.push('INSTRUCTION TO LLM:');
    lines.push('  This file describes the exact state of the developer\'s machine.');
    lines.push('  Do not suggest installing anything in the SATISFIED list.');
    lines.push('  Only address items in the MISSING or VERSION MISMATCH lists.');
    lines.push(`  Provide OS-specific install instructions based on OS: ${snapshot.hardware.osVersion}`);
    lines.push('=== END REPORT ===');

    return lines.join('\n');
}

/**
 * Format the env.setup file — human-readable install plan
 * shown to the developer before any installation.
 */
export function formatEnvSetup(report: DeltaReport): string {
    const lines: string[] = [];

    lines.push('─────────────────────────────────────────────────');
    lines.push('  VRE Environment Setup');
    lines.push('─────────────────────────────────────────────────');

    if (report.satisfied.length > 0) {
        lines.push('  Already satisfied (will NOT be touched):');
        for (const item of report.satisfied) {
            lines.push(`    ✅ ${item.name} ${item.installed}`);
        }
    }

    lines.push('');

    if (report.missing.length > 0) {
        lines.push('  Needs installation:');
        for (const item of report.missing) {
            lines.push(`    ❌ ${item.name} — ${item.source} package, not found`);
        }
    }

    if (report.mismatched.length > 0) {
        lines.push('  Version review needed:');
        for (const item of report.mismatched) {
            lines.push(`    ⚠️  ${item.name} — installed ${item.installed}, project wants ${item.required}`);
        }
    }

    if (report.missing.length === 0 && report.mismatched.length === 0) {
        lines.push('  ✅ Everything is already installed. No action needed.');
    } else {
        lines.push('');
        lines.push('  Proceed with install? [Use VRE: Install Missing command]');
    }

    lines.push('─────────────────────────────────────────────────');

    return lines.join('\n');
}
