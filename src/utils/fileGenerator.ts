/**
 * ═══════════════════════════════════════════════════════════════════
 *  VRE File Generator — Creates the .monitor, .VRE, .migrate folders
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    On extension activation (or explicit "VRE: Initialize" command),
 *    this module creates the three-folder structure described in the
 *    spec. It writes default config files (.VRE/vre.default.json,
 *    vre.config.json) and placeholder files so the developer can
 *    see the full structure immediately.
 *
 *  USED BY:
 *    - src/extension.ts       (on activation)
 *    - src/commands.ts        (vre.initialize command)
 *
 *  IDEMPOTENT:
 *    Calling this multiple times will NOT overwrite existing files.
 *    Only missing files are created. Existing configs are preserved.
 * ═══════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './logger';

const LOG_SOURCE = 'FileGenerator';

/** Default conservative container limits */
const VRE_DEFAULTS = {
    cpu_cores: 1,
    ram_limit_gb: 4,
    vram_limit_gb: 2,
    gpu_limit_percent: 50,
    max_runtime_minutes: 30,
    allow_background_processes: true,
};

/**
 * Create a file only if it does not already exist.
 * Returns true if the file was created, false if it already existed.
 */
function createIfMissing(filePath: string, content: string): boolean {
    if (fs.existsSync(filePath)) {
        return false;
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
}

/**
 * Initialize the full VRE folder structure inside the given workspace root.
 * Creates .monitor/, .VRE/, .migrate/ with all default files.
 */
export function initializeFolderStructure(workspaceRoot: string): void {
    const logger = Logger.getInstance();
    logger.info(LOG_SOURCE, `Initializing VRE folder structure in: ${workspaceRoot}`);

    // ──── .monitor/ ────
    const monitorDir = path.join(workspaceRoot, '.monitor');
    fs.mkdirSync(monitorDir, { recursive: true });

    createIfMissing(path.join(monitorDir, 'runtime.log'), '');
    logger.info(LOG_SOURCE, 'Created .monitor/ directory');

    // ──── .VRE/ ────
    const vreDir = path.join(workspaceRoot, '.VRE');
    fs.mkdirSync(vreDir, { recursive: true });

    createIfMissing(
        path.join(vreDir, 'vre.default.json'),
        JSON.stringify(VRE_DEFAULTS, null, 2)
    );

    createIfMissing(
        path.join(vreDir, 'vre.config.json'),
        JSON.stringify({
            ...VRE_DEFAULTS,
            _comment: 'Override any value here. These take priority over vre.default.json.',
        }, null, 2)
    );

    createIfMissing(
        path.join(vreDir, 'vre.container.json'),
        JSON.stringify({ status: 'idle', created_at: null, pid: null }, null, 2)
    );

    createIfMissing(
        path.join(vreDir, 'vre.translation.json'),
        JSON.stringify({ translated_at: null, translations_applied: [], unchanged: [] }, null, 2)
    );

    createIfMissing(
        path.join(vreDir, 'vre.lock.json'),
        JSON.stringify({ locked: false, verified_at: null }, null, 2)
    );

    createIfMissing(
        path.join(vreDir, 'vre.error.report.json'),
        JSON.stringify({ errors: [] }, null, 2)
    );

    createIfMissing(
        path.join(vreDir, 'vre.release.log'),
        ''
    );

    logger.info(LOG_SOURCE, 'Created .VRE/ directory with default configs');

    // ──── .migrate/ ────
    const migrateDir = path.join(workspaceRoot, '.migrate');
    fs.mkdirSync(migrateDir, { recursive: true });

    createIfMissing(path.join(migrateDir, 'requirements.scan'), '');
    createIfMissing(path.join(migrateDir, 'system.snapshot'), '');
    createIfMissing(path.join(migrateDir, 'delta.X'), '');
    createIfMissing(path.join(migrateDir, 'env.setup'), '');
    createIfMissing(path.join(migrateDir, 'env.lock'), '');

    logger.info(LOG_SOURCE, 'Created .migrate/ directory');
    logger.info(LOG_SOURCE, '✅ VRE folder structure initialized successfully');
}

/**
 * Read and merge the VRE container configuration.
 * vre.config.json overrides vre.default.json for any key present.
 */
export function readVreConfig(workspaceRoot: string): typeof VRE_DEFAULTS {
    const vreDir = path.join(workspaceRoot, '.VRE');

    let defaults = { ...VRE_DEFAULTS };
    let overrides: Record<string, unknown> = {};

    try {
        const raw = fs.readFileSync(path.join(vreDir, 'vre.default.json'), 'utf-8');
        defaults = { ...defaults, ...JSON.parse(raw) };
    } catch { /* use built-in defaults */ }

    try {
        const raw = fs.readFileSync(path.join(vreDir, 'vre.config.json'), 'utf-8');
        overrides = JSON.parse(raw);
    } catch { /* no overrides */ }

    return {
        cpu_cores: (overrides.cpu_cores as number) ?? defaults.cpu_cores,
        ram_limit_gb: (overrides.ram_limit_gb as number) ?? defaults.ram_limit_gb,
        vram_limit_gb: (overrides.vram_limit_gb as number) ?? defaults.vram_limit_gb,
        gpu_limit_percent: (overrides.gpu_limit_percent as number) ?? defaults.gpu_limit_percent,
        max_runtime_minutes: (overrides.max_runtime_minutes as number) ?? defaults.max_runtime_minutes,
        allow_background_processes: (overrides.allow_background_processes as boolean) ?? defaults.allow_background_processes,
    };
}
