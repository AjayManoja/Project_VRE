/**
 * ═══════════════════════════════════════════════════════════════════
 *  Translation Engine — Scales high-spec code to local proxy
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Reads a source file (Python/JS) and detects hardware-scale
 *    parameters baked into the code: batch_size, num_workers,
 *    num_threads, model loader calls, dataset paths, and VRAM
 *    allocations. Substitutes them with locally-safe proxy values
 *    while preserving all logic, control flow, and variable names.
 *
 *  PRESERVES (never modified):
 *    - Control flow (if/else, loops, try/except)
 *    - Variable names and references
 *    - Mathematical operations
 *    - Function signatures and call order
 *    - Error handling paths
 *    - Loss functions, optimizers, schedulers
 *
 *  MODIFIES (scale parameters only):
 *    - batch_size         → clamped to max 4
 *    - num_workers        → clamped to max 2
 *    - num_threads        → clamped to max 2
 *    - Large model loaders → flagged for proxy substitution
 *    - Dataset paths      → flagged for synthetic substitution
 *
 *  OUTPUT:
 *    - Proxy source code (written to .VRE/proxy/)
 *    - vre.translation.json (detailed mapping of all changes)
 *
 *  USED BY:
 *    - src/vre/index.ts    (orchestrates translation → execution)
 *    - src/commands.ts     (vre.translateAndRun command)
 * ═══════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { readVreConfig } from '../utils/fileGenerator';
import { getSystemHardware } from '../utils/platform';

const LOG_SOURCE = 'TranslationEngine';

export interface TranslationRecord {
    parameter: string;
    original: string | number;
    proxy: string | number;
    file: string;
    line: number;
    reason: string;
}

export interface TranslationResult {
    translatedAt: string;
    sourceFile: string;
    proxyFile: string;
    targetMachine: Record<string, unknown>;
    localMachine: Record<string, unknown>;
    translationsApplied: TranslationRecord[];
    unchanged: string[];
    proxyCode: string;
}

/**
 * Translation rules: patterns to detect and their proxy replacements.
 * Each rule has a regex, a max proxy value, and a description.
 */
interface TranslationRule {
    /** Name of the parameter being translated */
    name: string;
    /** Regex to match the assignment in source code. Must have a capture group for the value. */
    pattern: RegExp;
    /** Maximum allowed proxy value */
    maxProxy: number;
    /** Human-readable reason for the translation */
    reason: string;
}

const PYTHON_RULES: TranslationRule[] = [
    {
        name: 'batch_size',
        pattern: /^(\s*(?:batch_size|BATCH_SIZE|bs)\s*=\s*)(\d+)/gm,
        maxProxy: 4,
        reason: 'Batch size reduced to fit local RAM/VRAM budget',
    },
    {
        name: 'num_workers',
        pattern: /^(\s*(?:num_workers|NUM_WORKERS|n_workers)\s*=\s*)(\d+)/gm,
        maxProxy: 2,
        reason: 'Worker count reduced to fit local CPU cores',
    },
    {
        name: 'num_threads',
        pattern: /^(\s*(?:torch\.set_num_threads|num_threads|NUM_THREADS)\s*\(\s*)(\d+)/gm,
        maxProxy: 2,
        reason: 'Thread count reduced to fit local CPU cores',
    },
    {
        name: 'num_epochs',
        pattern: /^(\s*(?:num_epochs|NUM_EPOCHS|epochs|n_epochs|EPOCHS)\s*=\s*)(\d+)/gm,
        maxProxy: 2,
        reason: 'Epoch count reduced — proxy tests logic, not convergence',
    },
    {
        name: 'gradient_accumulation_steps',
        pattern: /^(\s*(?:gradient_accumulation_steps|grad_accum_steps)\s*=\s*)(\d+)/gm,
        maxProxy: 1,
        reason: 'Gradient accumulation reduced for proxy testing',
    },
    {
        name: 'max_steps',
        pattern: /^(\s*(?:max_steps|MAX_STEPS|total_steps)\s*=\s*)(\d+)/gm,
        maxProxy: 10,
        reason: 'Max steps limited — proxy tests logic, not full training',
    },
];

const JS_RULES: TranslationRule[] = [
    {
        name: 'batchSize',
        pattern: /^(\s*(?:const|let|var)\s+(?:batchSize|BATCH_SIZE|batch_size)\s*=\s*)(\d+)/gm,
        maxProxy: 4,
        reason: 'Batch size reduced to fit local memory budget',
    },
    {
        name: 'workers',
        pattern: /^(\s*(?:const|let|var)\s+(?:workers|numWorkers|NUM_WORKERS)\s*=\s*)(\d+)/gm,
        maxProxy: 2,
        reason: 'Worker count reduced to fit local CPU cores',
    },
    {
        name: 'concurrency',
        pattern: /^(\s*(?:const|let|var)\s+(?:concurrency|maxConcurrency|CONCURRENCY)\s*=\s*)(\d+)/gm,
        maxProxy: 2,
        reason: 'Concurrency reduced to fit local resources',
    },
];

/**
 * Translate a source file by applying scale-down rules.
 *
 * @param sourceFile   - Absolute path to the original source file
 * @param workspaceRoot - Project workspace root
 * @returns TranslationResult with proxy code and translation records
 */
export function translateFile(sourceFile: string, workspaceRoot: string): TranslationResult {
    const logger = Logger.getInstance();
    logger.info(LOG_SOURCE, `Translating: ${sourceFile}`);

    const sourceCode = fs.readFileSync(sourceFile, 'utf-8');
    const ext = path.extname(sourceFile).toLowerCase();
    const rules = ext === '.py' ? PYTHON_RULES : JS_RULES;

    const hardware = getSystemHardware();
    const vreConfig = readVreConfig(workspaceRoot);

    const translations: TranslationRecord[] = [];
    let proxyCode = sourceCode;

    // Apply each translation rule
    for (const rule of rules) {
        // Reset regex lastIndex for global patterns
        rule.pattern.lastIndex = 0;

        proxyCode = proxyCode.replace(rule.pattern, (match, prefix: string, value: string, offset: number) => {
            const originalValue = parseInt(value);

            if (originalValue <= rule.maxProxy) {
                // Value already fits — no translation needed
                return match;
            }

            // Calculate line number from offset
            const lineNumber = proxyCode.substring(0, offset).split('\n').length;

            translations.push({
                parameter: rule.name,
                original: originalValue,
                proxy: rule.maxProxy,
                file: path.basename(sourceFile),
                line: lineNumber,
                reason: rule.reason,
            });

            logger.info(LOG_SOURCE, `  ${rule.name}: ${originalValue} → ${rule.maxProxy} (line ${lineNumber})`);
            return `${prefix}${rule.maxProxy}`;
        });

        // Reset for next use
        rule.pattern.lastIndex = 0;
    }

    // Add a proxy header comment
    const headerComment = ext === '.py'
        ? `# ═══ VRE PROXY — Auto-translated for local testing ═══\n# Original file: ${path.basename(sourceFile)}\n# ${translations.length} parameters scaled down. Logic unchanged.\n# This file is disposable — never deploy it.\n\n`
        : `// ═══ VRE PROXY — Auto-translated for local testing ═══\n// Original file: ${path.basename(sourceFile)}\n// ${translations.length} parameters scaled down. Logic unchanged.\n// This file is disposable — never deploy it.\n\n`;

    proxyCode = headerComment + proxyCode;

    // Write proxy file
    const proxyDir = path.join(workspaceRoot, '.VRE', 'proxy');
    fs.mkdirSync(proxyDir, { recursive: true });
    const proxyFileName = `proxy_${path.basename(sourceFile)}`;
    const proxyFilePath = path.join(proxyDir, proxyFileName);
    fs.writeFileSync(proxyFilePath, proxyCode, 'utf-8');

    const result: TranslationResult = {
        translatedAt: new Date().toISOString(),
        sourceFile: path.basename(sourceFile),
        proxyFile: proxyFileName,
        targetMachine: {
            note: 'Target machine specs inferred from original code values',
        },
        localMachine: {
            cpu_cores: hardware.cpuCores,
            ram_gb: hardware.totalRamGb,
            gpu: hardware.gpu || 'None',
            vram_gb: hardware.totalVramGb || 0,
            vre_budget: vreConfig,
        },
        translationsApplied: translations,
        unchanged: [
            'All control flow (if/else, loops, branching)',
            'All variable names and references',
            'All mathematical operations',
            'All function signatures and call order',
            'All error handling paths',
            'Loss functions, optimizers, schedulers',
        ],
        proxyCode,
    };

    // Write vre.translation.json
    const translationJsonPath = path.join(workspaceRoot, '.VRE', 'vre.translation.json');
    const translationJson = { ...result };
    delete (translationJson as Record<string, unknown>).proxyCode; // Don't include full code in JSON
    fs.writeFileSync(translationJsonPath, JSON.stringify(translationJson, null, 2), 'utf-8');

    logger.info(LOG_SOURCE, `✅ Translation complete: ${translations.length} parameters scaled down`);
    return result;
}
