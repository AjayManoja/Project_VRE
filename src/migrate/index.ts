/**
 * ═══════════════════════════════════════════════════════════════════
 *  Migrate Layer — Orchestrator
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Orchestrates the full dependency scan workflow:
 *      1. Scan project requirements (requirementScanner)
 *      2. Scan system state (systemScanner)
 *      3. Compute delta (deltaEngine)
 *      4. Write results to .migrate/ folder
 *
 *  USED BY:
 *    - src/commands.ts  (vre.scanDependencies command)
 *    - src/extension.ts (on activation, auto-scan)
 *
 *  OUTPUT FILES:
 *    .migrate/requirements.scan  — raw project requirements
 *    .migrate/system.snapshot    — full system state
 *    .migrate/delta.X            — the gap (LLM-friendly)
 *    .migrate/env.setup          — install plan (human-friendly)
 * ═══════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { scanProjectRequirements, ProjectRequirement } from './requirementScanner';
import { scanSystem, formatSnapshotText, SystemSnapshot } from './systemScanner';
import { computeDelta, formatDeltaX, formatEnvSetup, DeltaReport } from './deltaEngine';

const LOG_SOURCE = 'Migrate';

export interface MigrateResult {
    requirements: ProjectRequirement[];
    snapshot: SystemSnapshot;
    delta: DeltaReport;
}

/**
 * Run the full migrate workflow:
 * scan project → scan system → compute delta → write files.
 */
export async function runMigrateScan(workspaceRoot: string): Promise<MigrateResult> {
    const logger = Logger.getInstance();
    logger.info(LOG_SOURCE, '═══ Starting Migrate Scan ═══');

    const migrateDir = path.join(workspaceRoot, '.migrate');
    fs.mkdirSync(migrateDir, { recursive: true });

    // Step 1: Scan project requirements
    logger.info(LOG_SOURCE, 'Step 1/3: Scanning project requirements...');
    const requirements = scanProjectRequirements(workspaceRoot);

    // Write requirements.scan
    const reqLines = requirements.map(r => `[${r.source}] ${r.name} ${r.versionSpec}  (raw: ${r.raw})`);
    const reqContent = [
        '═══════════════════════════════════════════════════════',
        '  REQUIREMENTS SCAN — What this project needs',
        `  Scanned: ${new Date().toISOString()}`,
        `  Project: ${workspaceRoot}`,
        '═══════════════════════════════════════════════════════',
        '',
        `Found ${requirements.length} requirements:`,
        '',
        ...reqLines,
    ].join('\n');
    fs.writeFileSync(path.join(migrateDir, 'requirements.scan'), reqContent, 'utf-8');

    // Step 2: Scan system
    logger.info(LOG_SOURCE, 'Step 2/3: Scanning system state...');
    const snapshot = scanSystem();

    // Write system.snapshot
    const snapshotText = formatSnapshotText(snapshot);
    fs.writeFileSync(path.join(migrateDir, 'system.snapshot'), snapshotText, 'utf-8');

    // Step 3: Compute delta
    logger.info(LOG_SOURCE, 'Step 3/3: Computing delta...');
    const delta = computeDelta(requirements, snapshot, workspaceRoot);

    // Write delta.X (LLM-friendly)
    const deltaText = formatDeltaX(delta, snapshot);
    fs.writeFileSync(path.join(migrateDir, 'delta.X'), deltaText, 'utf-8');

    // Write env.setup (human-friendly)
    const envSetupText = formatEnvSetup(delta);
    fs.writeFileSync(path.join(migrateDir, 'env.setup'), envSetupText, 'utf-8');

    // Write delta as JSON for programmatic access
    fs.writeFileSync(
        path.join(migrateDir, 'delta.json'),
        JSON.stringify(delta, null, 2),
        'utf-8'
    );

    logger.info(LOG_SOURCE, `═══ Migrate Scan Complete ═══`);
    logger.info(LOG_SOURCE, `  ✅ ${delta.satisfied.length} satisfied`);
    logger.info(LOG_SOURCE, `  ❌ ${delta.missing.length} missing`);
    logger.info(LOG_SOURCE, `  ⚠️  ${delta.mismatched.length} mismatched`);

    return { requirements, snapshot, delta };
}
