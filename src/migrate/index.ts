/**
 * Migrate orchestrator — ties scanner, system, delta, and installer together.
 * Runs silently on project open. Produces delta.X.
 */

import * as fs from 'fs';
import * as path from 'path';
import { scanProject } from './scanner';
import { scanSystem, formatSnapshot, SystemSnapshot } from './system';
import { computeDelta, formatDeltaX, Delta } from './delta';
import { Logger } from '../utils/logger';
import { getGeminiKey, generateEnvGuideline } from '../utils/ai';

const LOG = 'Migrate';

export interface MigrateResult {
    delta: Delta;
    snapshot: SystemSnapshot;
    ecosystems: string[];
}

export async function runMigrate(root: string): Promise<MigrateResult> {
    const log = Logger.get();
    log.info(LOG, `Scanning: ${root}`);

    // ensure .migrate dir
    const dir = path.join(root, '.migrate');
    fs.mkdirSync(dir, { recursive: true });

    // 1. scan project
    const { deps, ecosystems } = scanProject(root);
    log.info(LOG, `Found ${deps.length} deps across ${ecosystems.length} ecosystems`);

    // 2. scan system
    const snapshot = await scanSystem();
    log.info(LOG, `System: ${snapshot.hardware.osVersion}, ${snapshot.packages.length} packages`);

    // 3. compute delta
    const delta = computeDelta(deps, snapshot);
    log.info(LOG, `Delta: ${delta.satisfied.length} ok, ${delta.missing.length} missing, ${delta.mismatched.length} mismatch`);

    // 4. write files
    const deltaXStr = formatDeltaX(delta, snapshot);
    fs.writeFileSync(path.join(dir, 'delta.X'), deltaXStr, 'utf-8');
    fs.writeFileSync(path.join(dir, 'system.snapshot'), formatSnapshot(snapshot), 'utf-8');
    fs.writeFileSync(path.join(dir, 'delta.json'), JSON.stringify(delta, null, 2), 'utf-8');

    log.info(LOG, 'delta.X written');

    // 5. AI Environment Guideline
    const apiKey = getGeminiKey(root);
    if (apiKey) {
        log.info(LOG, 'Generating AI Environment Guideline...');
        const guideline = await generateEnvGuideline(deltaXStr, apiKey);
        if (guideline) {
            fs.writeFileSync(path.join(dir, 'ai.guideline.txt'), guideline, 'utf-8');
            log.info(LOG, `AI Guideline created in .migrate/ai.guideline.txt`);
        }
    }

    return { delta, snapshot, ecosystems };
}
