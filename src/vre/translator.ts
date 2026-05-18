/**
 * Translator — scales resource-heavy parameters to safe local values.
 * Domain-agnostic: handles concurrency, memory, iteration, and network params.
 */

import * as path from 'path';

export interface Translation {
    param: string;
    original: number;
    proxy: number;
    line: number;
    category: string;
    reason: string;
}

interface Rule {
    name: string;
    pattern: RegExp;
    max: number;
    reason: string;
    cat: string;
}

const PY_RULES: Rule[] = [
    // concurrency
    { name: 'num_workers', pattern: /^(\s*(?:num_workers|NUM_WORKERS|n_workers|workers)\s*=\s*)(\d+)/gm, max: 2, reason: 'Worker count scaled to local CPU', cat: 'concurrency' },
    { name: 'num_threads', pattern: /^(\s*(?:num_threads|NUM_THREADS|n_threads|threads)\s*=\s*)(\d+)/gm, max: 2, reason: 'Thread count scaled to local CPU', cat: 'concurrency' },
    { name: 'max_workers', pattern: /^(\s*(?:max_workers|MAX_WORKERS)\s*=\s*)(\d+)/gm, max: 2, reason: 'Pool size scaled to local CPU', cat: 'concurrency' },
    { name: 'processes', pattern: /^(\s*(?:processes|num_processes|NUM_PROCESSES)\s*=\s*)(\d+)/gm, max: 2, reason: 'Process count scaled to local CPU', cat: 'concurrency' },
    { name: 'pool_size', pattern: /^(\s*(?:pool_size|POOL_SIZE|connection_pool_size)\s*=\s*)(\d+)/gm, max: 5, reason: 'Connection pool scaled down', cat: 'concurrency' },
    // memory
    { name: 'batch_size', pattern: /^(\s*(?:batch_size|BATCH_SIZE|bs)\s*=\s*)(\d+)/gm, max: 4, reason: 'Batch size scaled to local RAM', cat: 'memory' },
    { name: 'buffer_size', pattern: /^(\s*(?:buffer_size|BUFFER_SIZE|buf_size|chunk_size|CHUNK_SIZE)\s*=\s*)(\d+)/gm, max: 4096, reason: 'Buffer scaled to local memory', cat: 'memory' },
    { name: 'cache_size', pattern: /^(\s*(?:cache_size|CACHE_SIZE|max_cache|maxsize)\s*=\s*)(\d+)/gm, max: 128, reason: 'Cache scaled down', cat: 'memory' },
    // iteration
    { name: 'epochs', pattern: /^(\s*(?:num_epochs|NUM_EPOCHS|epochs|n_epochs|EPOCHS)\s*=\s*)(\d+)/gm, max: 2, reason: 'Iterations reduced — testing logic, not convergence', cat: 'iteration' },
    { name: 'max_steps', pattern: /^(\s*(?:max_steps|MAX_STEPS|total_steps|max_iterations)\s*=\s*)(\d+)/gm, max: 10, reason: 'Steps capped for fast feedback', cat: 'iteration' },
    { name: 'max_retries', pattern: /^(\s*(?:max_retries|MAX_RETRIES|retry_count|retries)\s*=\s*)(\d+)/gm, max: 3, reason: 'Retries capped', cat: 'iteration' },
    // network
    { name: 'max_connections', pattern: /^(\s*(?:max_connections|MAX_CONNECTIONS|max_conn|maxconn)\s*=\s*)(\d+)/gm, max: 10, reason: 'Connections scaled down', cat: 'network' },
    { name: 'backlog', pattern: /^(\s*(?:backlog|BACKLOG|listen_backlog)\s*=\s*)(\d+)/gm, max: 16, reason: 'Socket backlog scaled', cat: 'network' },
];

const JS_RULES: Rule[] = [
    { name: 'workers', pattern: /^(\s*(?:const|let|var)\s+(?:workers|numWorkers|NUM_WORKERS|workerCount)\s*=\s*)(\d+)/gm, max: 2, reason: 'Workers scaled to local CPU', cat: 'concurrency' },
    { name: 'concurrency', pattern: /^(\s*(?:const|let|var)\s+(?:concurrency|maxConcurrency|CONCURRENCY)\s*=\s*)(\d+)/gm, max: 2, reason: 'Concurrency scaled down', cat: 'concurrency' },
    { name: 'batchSize', pattern: /^(\s*(?:const|let|var)\s+(?:batchSize|BATCH_SIZE|batch_size)\s*=\s*)(\d+)/gm, max: 4, reason: 'Batch size scaled to local memory', cat: 'memory' },
    { name: 'bufferSize', pattern: /^(\s*(?:const|let|var)\s+(?:bufferSize|BUFFER_SIZE|chunkSize)\s*=\s*)(\d+)/gm, max: 4096, reason: 'Buffer scaled down', cat: 'memory' },
    { name: 'maxIterations', pattern: /^(\s*(?:const|let|var)\s+(?:maxIterations|MAX_ITERATIONS|iterations|epochs)\s*=\s*)(\d+)/gm, max: 10, reason: 'Iterations capped', cat: 'iteration' },
    { name: 'maxRetries', pattern: /^(\s*(?:const|let|var)\s+(?:maxRetries|MAX_RETRIES|retryCount)\s*=\s*)(\d+)/gm, max: 3, reason: 'Retries capped', cat: 'iteration' },
    { name: 'maxConnections', pattern: /^(\s*(?:const|let|var)\s+(?:maxConnections|MAX_CONNECTIONS|connectionLimit|poolSize)\s*=\s*)(\d+)/gm, max: 10, reason: 'Connections scaled down', cat: 'network' },
];

export function translate(code: string, ext: string): { translated: string; translations: Translation[] } {
    const rules = ext === '.py' ? PY_RULES : JS_RULES;
    const translations: Translation[] = [];
    let result = code;

    for (const rule of rules) {
        rule.pattern.lastIndex = 0;
        result = result.replace(rule.pattern, (match, prefix: string, value: string, offset: number) => {
            const orig = parseInt(value);
            if (orig <= rule.max) return match;
            const line = result.substring(0, offset).split('\n').length;
            translations.push({ param: rule.name, original: orig, proxy: rule.max, line, category: rule.cat, reason: rule.reason });
            return `${prefix}${rule.max}`;
        });
        rule.pattern.lastIndex = 0;
    }

    return { translated: result, translations };
}

export const HEADER_LINES = 5;

export function addHeader(code: string, sourceFile: string, count: number, ext: string): string {
    const c = ext === '.py' ? '#' : '//';
    return [
        `${c} === VRE PROXY — translated for local testing ===`,
        `${c} Source: ${path.basename(sourceFile)}`,
        `${c} ${count} parameters scaled. All logic unchanged.`,
        `${c} This file is disposable.`,
        '',
        code,
    ].join('\n');
}
