/**
 * VRE Pipeline — the full translate → container → execute → report lifecycle.
 * This is what runs when the user presses Ctrl+Shift+R.
 */

import * as fs from 'fs';
import * as path from 'path';
import { translate, addHeader, HEADER_LINES, Translation } from './translator';
import { SoftContainer, ContainerResult } from './container';
import { Delta } from '../migrate/delta';
import { Logger } from '../utils/logger';
import { getHardware, binaryVersion } from '../utils/platform';
import { getGeminiKey, optimizeWithGemini, generateCrashDiagnosis } from '../utils/ai';

const LOG = 'VRE';

export interface VREReport {
    sourceFile: string;
    proxyFile: string;
    translations: Translation[];
    execution: ContainerResult;
    originalLine: number | null;
    logicClean: boolean;
    runtimeVersion: string;
}

function readDelta(root: string): Delta | null {
    const fp = path.join(root, '.migrate', 'delta.json');
    if (!fs.existsSync(fp)) return null;
    try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); }
    catch { return null; }
}

export async function runVRE(sourceFile: string, root: string): Promise<VREReport> {
    const log = Logger.get();
    const ext = path.extname(sourceFile).toLowerCase();
    const lang = ext === '.py' ? 'python' as const : 'node' as const;

    log.info(LOG, `Starting VRE for: ${path.basename(sourceFile)}`);

    // ensure dirs
    const vreDir = path.join(root, '.VRE');
    const proxyDir = path.join(vreDir, 'proxy');
    fs.mkdirSync(proxyDir, { recursive: true });

    // 1. read source
    const code = fs.readFileSync(sourceFile, 'utf-8');

    // 2. translate
    let { translated, translations } = translate(code, ext);
    log.info(LOG, `${translations.length} parameters translated`);

    // 2.5. AI step-capping optimization
    const apiKey = getGeminiKey(root);
    if (apiKey) {
        log.info(LOG, 'Gemini AI Orchestrator active. Injecting dynamic step-capping...');
        translated = await optimizeWithGemini(translated, ext, apiKey);
    }

    // 3. add header
    const proxyCode = addHeader(translated, sourceFile, translations.length, ext);
    const proxyName = `proxy_${path.basename(sourceFile)}`;
    const proxyPath = path.join(proxyDir, proxyName);
    fs.writeFileSync(proxyPath, proxyCode, 'utf-8');

    // 4. write translation record
    const hw = getHardware();
    fs.writeFileSync(path.join(vreDir, 'vre.translation.json'), JSON.stringify({
        translatedAt: new Date().toISOString(),
        source: path.basename(sourceFile),
        proxy: proxyName,
        machine: { cpu: hw.cpu, cores: hw.cores, ram: hw.ramTotalGb, gpu: hw.gpu || 'None', vram: hw.vramTotalGb || 0 },
        translations,
    }, null, 2), 'utf-8');

    // 5. set up soft container
    const delta = readDelta(root);
    const container = new SoftContainer(root);
    if (delta) {
        const installed = await container.setup(delta);
        if (installed.length > 0) log.info(LOG, `Container installed: ${installed.join(', ')}`);
    } else {
        log.warn(LOG, 'No delta.json found — running without container deps');
    }

    // 6. execute inside container
    const timeoutMs = 30 * 60 * 1000; // 30 min default
    
    let result: ContainerResult;
    try {
        result = await container.execute(proxyPath, lang, timeoutMs);
    } finally {
        // 7. cleanup container (guaranteed)
        container.cleanup();
    }

    // 8. map error line back to original
    let originalLine: number | null = null;
    if (result.error && result.error.parsed.line !== null) {
        originalLine = Math.max(1, result.error.parsed.line - HEADER_LINES);
    }

    let aiDiagnosis = '';
    if (result.error && apiKey) {
        log.info(LOG, 'Generating AI Crash Diagnostics...');
        aiDiagnosis = await generateCrashDiagnosis(result.stderr, translated, ext, apiKey);
    }

    // 9. write error report if Category 2
    if (result.error && result.error.classification.category === 2) {
        const report = {
            generatedAt: new Date().toISOString(),
            category: 2,
            categoryNote: result.error.classification.note,
            aiDiagnosis: aiDiagnosis || undefined,
            errorType: result.error.parsed.type,
            message: result.error.parsed.message,
            sourceFile: path.basename(sourceFile),
            originalLine,
            proxyLine: result.error.parsed.line,
            function: result.error.parsed.func,
            stack: result.error.parsed.stack,
            translations,
        };
        fs.writeFileSync(path.join(vreDir, 'vre.error.report.json'), JSON.stringify(report, null, 2), 'utf-8');
        log.error(LOG, `Category 2 bug at line ${originalLine}: ${result.error.parsed.type}`);
        if (aiDiagnosis) log.warn(LOG, `AI Diagnosis: ${aiDiagnosis}`);
    }

    // 10. write AI-ready report if Category 1
    if (result.error && result.error.classification.category === 1) {
        const aiReport = formatCat1Report(result, hw, sourceFile, translations, aiDiagnosis);
        fs.writeFileSync(path.join(vreDir, 'vre.crash.report'), aiReport, 'utf-8');
        log.warn(LOG, `Category 1 hardware limit — AI report written`);
        if (aiDiagnosis) log.warn(LOG, `AI Diagnosis: ${aiDiagnosis}`);
    }

    if (result.success) {
        log.info(LOG, `Code is logic-clean. Ran in ${result.durationMs}ms`);
    }

    const runtimeVersion = binaryVersion(lang === 'python' ? 'python' : 'node') || 'unknown';

    return {
        sourceFile: path.basename(sourceFile),
        proxyFile: proxyName,
        translations,
        execution: result,
        originalLine,
        logicClean: result.success,
        runtimeVersion,
    };
}

function formatCat1Report(result: ContainerResult, hw: ReturnType<typeof getHardware>, sourceFile: string, translations: Translation[], aiDiagnosis: string = ''): string {
    const e = result.error!;
    const l: string[] = [];

    l.push('=== VRE RUNTIME REPORT — Category 1 (Hardware Limit) ===');
    l.push(`Generated: ${new Date().toISOString()}`);
    l.push('');
    l.push('SYSTEM AT CRASH:');
    l.push(`  OS: ${hw.osVersion}`);
    l.push(`  CPU: ${hw.cpu} (${hw.cores} cores)`);
    l.push(`  RAM: ${hw.ramTotalGb}GB total`);
    if (hw.gpu) {
        l.push(`  GPU: ${hw.gpu}`);
        l.push(`  VRAM: ${hw.vramTotalGb}GB total`);
    }

    l.push('');
    l.push('ERROR:');
    l.push(`  Type: ${e.parsed.type}`);
    l.push(`  Message: ${e.parsed.message}`);
    l.push(`  File: ${path.basename(sourceFile)}, line ${e.parsed.line}, function ${e.parsed.func || 'unknown'}`);

    if (translations.length > 0) {
        l.push('');
        l.push('TRANSLATION CONTEXT:');
        for (const t of translations) {
            l.push(`  ${t.param}: ${t.original} → ${t.proxy} (${t.reason})`);
        }
    }

    if (aiDiagnosis) {
        l.push('');
        l.push('VRE AI DIAGNOSIS:');
        l.push(aiDiagnosis);
    }

    l.push('');
    l.push('THIS IS NOT A CODE BUG. Logic is intact. Optimize resource usage.');
    l.push('=== END ===');

    return l.join('\n');
}
