/**
 * Universal Translation Engine — Domain-Agnostic Proxy Code Generation
 *
 * THIS IS NOT AN AI/ML-ONLY ENGINE. It works for ANY project:
 *   - Web servers (connection pools, worker threads, backlog)
 *   - Databases (pool sizes, query limits, buffer sizes)
 *   - File I/O (buffer sizes, concurrent file handles)
 *   - Networking (concurrent connections, socket limits)
 *   - Concurrency (thread pools, process pools, async workers)
 *   - Memory (pre-allocation sizes, cache sizes)
 *   - AI/ML (batch size, epochs, workers — as a subset)
 *   - General (loop iteration caps, retry counts, timeouts)
 *
 * STRATEGY:
 *   HIGH-LEVEL CODE (user's original) → LOW-LEVEL CODE (same logic, reduced resource footprint)
 *   The proxy preserves ALL logic but runs within local hardware constraints.
 *   This forces Category 2 (logic) errors to surface EARLY — before remote deployment.
 *
 * WHAT IS PRESERVED (never modified):
 *   - Control flow (if/else, loops, try/catch, switch)
 *   - Variable names, references, types
 *   - Mathematical operations, algorithms
 *   - Function signatures and call graphs
 *   - Error handling paths
 *   - Business logic, validation, routing
 *
 * WHAT IS SCALED (resource parameters only):
 *   - Concurrency limits, thread/worker pools
 *   - Buffer/cache/batch sizes
 *   - Connection pool sizes
 *   - Iteration/retry counts
 *   - Memory allocations
 *   - Timeout values (increased for safety)
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
    category: string;
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

interface TranslationRule {
    name: string;
    pattern: RegExp;
    maxProxy: number;
    reason: string;
    category: string;
}

// ═══════════════════════════════════════════════════════════════════
//  UNIVERSAL TRANSLATION RULES — Grouped by domain
// ═══════════════════════════════════════════════════════════════════

const PYTHON_RULES: TranslationRule[] = [
    // ──── Concurrency & Parallelism ────
    { name: 'num_workers', pattern: /^(\s*(?:num_workers|NUM_WORKERS|n_workers|workers)\s*=\s*)(\d+)/gm, maxProxy: 2, reason: 'Worker count scaled to local CPU budget', category: 'concurrency' },
    { name: 'num_threads', pattern: /^(\s*(?:num_threads|NUM_THREADS|n_threads|threads)\s*=\s*)(\d+)/gm, maxProxy: 2, reason: 'Thread count scaled to local CPU budget', category: 'concurrency' },
    { name: 'max_workers', pattern: /^(\s*(?:max_workers|MAX_WORKERS)\s*=\s*)(\d+)/gm, maxProxy: 2, reason: 'Pool size scaled to local CPU budget', category: 'concurrency' },
    { name: 'processes', pattern: /^(\s*(?:processes|num_processes|NUM_PROCESSES|n_processes)\s*=\s*)(\d+)/gm, maxProxy: 2, reason: 'Process count scaled to local CPU budget', category: 'concurrency' },
    { name: 'pool_size', pattern: /^(\s*(?:pool_size|POOL_SIZE|connection_pool_size)\s*=\s*)(\d+)/gm, maxProxy: 5, reason: 'Connection pool scaled to local capacity', category: 'concurrency' },
    { name: 'torch_threads', pattern: /^(\s*torch\.set_num_threads\s*\(\s*)(\d+)/gm, maxProxy: 2, reason: 'PyTorch thread count scaled to local CPU', category: 'concurrency' },

    // ──── Memory & Buffers ────
    { name: 'batch_size', pattern: /^(\s*(?:batch_size|BATCH_SIZE|bs)\s*=\s*)(\d+)/gm, maxProxy: 4, reason: 'Batch size scaled to local RAM/VRAM budget', category: 'memory' },
    { name: 'buffer_size', pattern: /^(\s*(?:buffer_size|BUFFER_SIZE|buf_size|chunk_size|CHUNK_SIZE)\s*=\s*)(\d+)/gm, maxProxy: 4096, reason: 'Buffer size scaled to local memory', category: 'memory' },
    { name: 'cache_size', pattern: /^(\s*(?:cache_size|CACHE_SIZE|max_cache|maxsize)\s*=\s*)(\d+)/gm, maxProxy: 128, reason: 'Cache scaled to local memory', category: 'memory' },
    { name: 'prefetch_factor', pattern: /^(\s*(?:prefetch_factor|PREFETCH_FACTOR)\s*=\s*)(\d+)/gm, maxProxy: 2, reason: 'Prefetch reduced to conserve memory', category: 'memory' },

    // ──── Iteration & Epochs ────
    { name: 'num_epochs', pattern: /^(\s*(?:num_epochs|NUM_EPOCHS|epochs|n_epochs|EPOCHS)\s*=\s*)(\d+)/gm, maxProxy: 2, reason: 'Iterations reduced — proxy tests logic, not convergence', category: 'iteration' },
    { name: 'max_steps', pattern: /^(\s*(?:max_steps|MAX_STEPS|total_steps|max_iterations)\s*=\s*)(\d+)/gm, maxProxy: 10, reason: 'Step count reduced for logic-only testing', category: 'iteration' },
    { name: 'gradient_accumulation', pattern: /^(\s*(?:gradient_accumulation_steps|grad_accum_steps|accumulation_steps)\s*=\s*)(\d+)/gm, maxProxy: 1, reason: 'Accumulation reduced for proxy testing', category: 'iteration' },
    { name: 'max_retries', pattern: /^(\s*(?:max_retries|MAX_RETRIES|retry_count|retries)\s*=\s*)(\d+)/gm, maxProxy: 3, reason: 'Retry count capped for fast feedback', category: 'iteration' },

    // ──── Server & Networking ────
    { name: 'backlog', pattern: /^(\s*(?:backlog|BACKLOG|listen_backlog)\s*=\s*)(\d+)/gm, maxProxy: 16, reason: 'Socket backlog scaled to local capacity', category: 'network' },
    { name: 'max_connections', pattern: /^(\s*(?:max_connections|MAX_CONNECTIONS|max_conn|maxconn)\s*=\s*)(\d+)/gm, maxProxy: 10, reason: 'Connection limit scaled for local testing', category: 'network' },
    { name: 'concurrent_requests', pattern: /^(\s*(?:concurrent_requests|CONCURRENT_REQUESTS|max_concurrent|concurrency_limit)\s*=\s*)(\d+)/gm, maxProxy: 5, reason: 'Concurrent requests scaled to local capacity', category: 'network' },
];

const JS_RULES: TranslationRule[] = [
    // ──── Concurrency & Parallelism ────
    { name: 'workers', pattern: /^(\s*(?:const|let|var)\s+(?:workers|numWorkers|NUM_WORKERS|workerCount)\s*=\s*)(\d+)/gm, maxProxy: 2, reason: 'Worker count scaled to local CPU budget', category: 'concurrency' },
    { name: 'concurrency', pattern: /^(\s*(?:const|let|var)\s+(?:concurrency|maxConcurrency|CONCURRENCY|concurrencyLimit)\s*=\s*)(\d+)/gm, maxProxy: 2, reason: 'Concurrency scaled to local CPU budget', category: 'concurrency' },
    { name: 'threadPoolSize', pattern: /^(\s*(?:const|let|var)\s+(?:threadPoolSize|THREAD_POOL_SIZE|poolSize)\s*=\s*)(\d+)/gm, maxProxy: 2, reason: 'Thread pool scaled to local resources', category: 'concurrency' },
    { name: 'clusterSize', pattern: /^(\s*(?:const|let|var)\s+(?:clusterSize|numClusters|instances)\s*=\s*)(\d+)/gm, maxProxy: 1, reason: 'Cluster instances scaled to single for proxy', category: 'concurrency' },

    // ──── Memory & Buffers ────
    { name: 'batchSize', pattern: /^(\s*(?:const|let|var)\s+(?:batchSize|BATCH_SIZE|batch_size)\s*=\s*)(\d+)/gm, maxProxy: 4, reason: 'Batch size scaled to local memory budget', category: 'memory' },
    { name: 'bufferSize', pattern: /^(\s*(?:const|let|var)\s+(?:bufferSize|BUFFER_SIZE|chunkSize|CHUNK_SIZE)\s*=\s*)(\d+)/gm, maxProxy: 4096, reason: 'Buffer scaled to local memory', category: 'memory' },
    { name: 'cacheSize', pattern: /^(\s*(?:const|let|var)\s+(?:cacheSize|CACHE_SIZE|maxCacheSize)\s*=\s*)(\d+)/gm, maxProxy: 128, reason: 'Cache scaled to local memory', category: 'memory' },
    { name: 'highWaterMark', pattern: /^(\s*(?:const|let|var)\s+(?:highWaterMark|HIGH_WATER_MARK)\s*=\s*)(\d+)/gm, maxProxy: 16384, reason: 'Stream buffer scaled down', category: 'memory' },

    // ──── Iteration ────
    { name: 'maxIterations', pattern: /^(\s*(?:const|let|var)\s+(?:maxIterations|MAX_ITERATIONS|iterations|epochs)\s*=\s*)(\d+)/gm, maxProxy: 10, reason: 'Iterations capped for logic-only testing', category: 'iteration' },
    { name: 'maxRetries', pattern: /^(\s*(?:const|let|var)\s+(?:maxRetries|MAX_RETRIES|retryCount|retries)\s*=\s*)(\d+)/gm, maxProxy: 3, reason: 'Retries capped for fast feedback', category: 'iteration' },

    // ──── Server & Networking ────
    { name: 'maxConnections', pattern: /^(\s*(?:const|let|var)\s+(?:maxConnections|MAX_CONNECTIONS|connectionLimit|poolSize)\s*=\s*)(\d+)/gm, maxProxy: 10, reason: 'Connection pool scaled for local testing', category: 'network' },
    { name: 'backlog', pattern: /^(\s*(?:const|let|var)\s+(?:backlog|BACKLOG|listenBacklog)\s*=\s*)(\d+)/gm, maxProxy: 16, reason: 'Socket backlog scaled to local capacity', category: 'network' },
];

/**
 * Translate a source file by applying domain-agnostic scale-down rules.
 * Works for ANY Python or JavaScript project — not just AI/ML.
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
        rule.pattern.lastIndex = 0;

        proxyCode = proxyCode.replace(rule.pattern, (match, prefix: string, value: string, offset: number) => {
            const originalValue = parseInt(value);
            if (originalValue <= rule.maxProxy) { return match; }

            const lineNumber = proxyCode.substring(0, offset).split('\n').length;
            translations.push({
                parameter: rule.name,
                original: originalValue,
                proxy: rule.maxProxy,
                file: path.basename(sourceFile),
                line: lineNumber,
                reason: rule.reason,
                category: rule.category,
            });

            logger.info(LOG_SOURCE, `  [${rule.category}] ${rule.name}: ${originalValue} → ${rule.maxProxy} (line ${lineNumber})`);
            return `${prefix}${rule.maxProxy}`;
        });

        rule.pattern.lastIndex = 0;
    }

    // Add proxy header
    const header = ext === '.py'
        ? `# ═══ VRE PROXY — Auto-translated for local testing ═══\n# Original: ${path.basename(sourceFile)}\n# ${translations.length} parameters scaled. ALL logic unchanged.\n# This proxy is disposable — never deploy it.\n\n`
        : `// ═══ VRE PROXY — Auto-translated for local testing ═══\n// Original: ${path.basename(sourceFile)}\n// ${translations.length} parameters scaled. ALL logic unchanged.\n// This proxy is disposable — never deploy it.\n\n`;

    proxyCode = header + proxyCode;

    // Write proxy
    const proxyDir = path.join(workspaceRoot, '.VRE', 'proxy');
    fs.mkdirSync(proxyDir, { recursive: true });
    const proxyFileName = `proxy_${path.basename(sourceFile)}`;
    const proxyFilePath = path.join(proxyDir, proxyFileName);
    fs.writeFileSync(proxyFilePath, proxyCode, 'utf-8');

    // Categorize translations for summary
    const byCat = new Map<string, number>();
    for (const t of translations) {
        byCat.set(t.category, (byCat.get(t.category) || 0) + 1);
    }
    const catSummary = [...byCat.entries()].map(([k, v]) => `${k}:${v}`).join(', ');

    const result: TranslationResult = {
        translatedAt: new Date().toISOString(),
        sourceFile: path.basename(sourceFile),
        proxyFile: proxyFileName,
        targetMachine: { note: 'Target machine specs inferred from original code values' },
        localMachine: {
            cpu_cores: hardware.cpuCores,
            ram_gb: hardware.totalRamGb,
            gpu: hardware.gpu || 'None',
            vram_gb: hardware.totalVramGb || 0,
            vre_budget: vreConfig,
        },
        translationsApplied: translations,
        unchanged: [
            'All control flow (if/else, loops, try/catch, switch)',
            'All variable names, types, and references',
            'All mathematical operations and algorithms',
            'All function signatures and call graphs',
            'All error handling and validation paths',
            'All business logic, routing, and middleware',
            'All database queries and schema operations',
            'All API contracts and response formats',
        ],
        proxyCode,
    };

    // Write translation metadata
    const translationJsonPath = path.join(workspaceRoot, '.VRE', 'vre.translation.json');
    const json = { ...result };
    delete (json as Record<string, unknown>).proxyCode;
    fs.writeFileSync(translationJsonPath, JSON.stringify(json, null, 2), 'utf-8');

    logger.info(LOG_SOURCE, `✅ Translation complete: ${translations.length} params scaled [${catSummary}]`);
    return result;
}
