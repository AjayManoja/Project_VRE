/**
 * ═══════════════════════════════════════════════════════════════════
 *  Error Reporter — Generates structured error reports
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Takes the output from proxyExecutor and the translation records,
 *    and generates vre.error.report.json — a structured bug report
 *    that maps proxy failures back to the original source code lines.
 *
 *  THE KEY INSIGHT:
 *    When the proxy crashes at line 84, the developer needs to know
 *    which line in the ORIGINAL code corresponds to that failure.
 *    Since the translation only modifies scale values (not structure),
 *    line numbers map 1:1 (offset by the proxy header comment lines).
 *
 *  HUMAN-IN-THE-LOOP:
 *    The error report is surfaced in the editor. The developer reads
 *    it, verifies it, and MUST press confirm before the AI applies
 *    any fix. This prevents runaway fix loops.
 *
 *  USED BY:
 *    - src/vre/index.ts     (after proxy execution)
 *    - src/commands.ts      (displays report in editor)
 * ═══════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { ProxyError } from './proxyExecutor';
import { TranslationRecord } from './translationEngine';

const LOG_SOURCE = 'ErrorReporter';

/** Lines added by the proxy header comment */
const PROXY_HEADER_LINES = 5;

export interface ErrorReport {
    generatedAt: string;
    sourceFile: string;
    proxyFile: string;
    error: {
        error_type: string;
        message: string;
        file: string;
        line: number | null;
        function: string | null;
        stack_trace: string[];
        category: 1 | 2;
        category_note: string;
    };
    proxy_context: {
        translations_applied: TranslationRecord[];
        note: string;
    };
    original_line_mapping: {
        proxy_line: number | null;
        original_line: number | null;
        translation_note: string;
    };
    developer_action_required: string;
}

/**
 * Generate a structured error report and write it to vre.error.report.json.
 *
 * @param proxyError    - The classified error from proxy execution
 * @param translations  - Translation records from the translation engine
 * @param sourceFile    - Original source file name
 * @param proxyFile     - Proxy file name
 * @param workspaceRoot - Project workspace root
 */
export function generateErrorReport(
    proxyError: ProxyError,
    translations: TranslationRecord[],
    sourceFile: string,
    proxyFile: string,
    workspaceRoot: string
): ErrorReport {
    const logger = Logger.getInstance();

    // Map proxy line back to original line
    // The proxy has PROXY_HEADER_LINES extra lines at the top
    const originalLine = proxyError.line !== null
        ? Math.max(1, proxyError.line - PROXY_HEADER_LINES)
        : null;

    // Check if the error line was modified by translation
    const translationAtLine = translations.find(t => t.line === originalLine);
    const translationNote = translationAtLine
        ? `Line was translated: ${translationAtLine.parameter} changed from ${translationAtLine.original} to ${translationAtLine.proxy}. Error may be related to the original value.`
        : 'Line unchanged by translation layer — error exists in original code as-is.';

    const report: ErrorReport = {
        generatedAt: new Date().toISOString(),
        sourceFile,
        proxyFile,
        error: {
            error_type: proxyError.errorType,
            message: proxyError.message,
            file: proxyError.file,
            line: proxyError.line,
            function: proxyError.function,
            stack_trace: proxyError.stackTrace,
            category: proxyError.category,
            category_note: proxyError.categoryNote,
        },
        proxy_context: {
            translations_applied: translations,
            note: proxyError.category === 2
                ? 'Error is hardware-blind — will occur at any scale'
                : 'Error is hardware-dependent — may not occur on the target machine',
        },
        original_line_mapping: {
            proxy_line: proxyError.line,
            original_line: originalLine,
            translation_note: translationNote,
        },
        developer_action_required: proxyError.category === 2
            ? 'REVIEW THIS REPORT. If the error looks correct, confirm to let the AI propose a fix for the ORIGINAL code (not the proxy).'
            : 'This is a hardware-scale error, not a logic bug. The original code may work fine on the target machine. Review and dismiss if appropriate.',
    };

    // Write to disk
    const reportPath = path.join(workspaceRoot, '.VRE', 'vre.error.report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

    logger.info(LOG_SOURCE, `Error report written: ${reportPath}`);
    logger.info(LOG_SOURCE, `  Type: ${report.error.error_type}`);
    logger.info(LOG_SOURCE, `  Category: ${report.error.category} (${proxyError.category === 2 ? 'LOGIC BUG' : 'Hardware'})`);
    logger.info(LOG_SOURCE, `  Original line: ${originalLine}`);

    return report;
}

/**
 * Format an error report as a human-readable text for display in the editor.
 */
export function formatErrorReportText(report: ErrorReport): string {
    const lines: string[] = [];
    const divider = '═'.repeat(60);

    lines.push(divider);
    lines.push(`  VRE ERROR REPORT — Category ${report.error.category}`);
    lines.push(divider);
    lines.push('');

    if (report.error.category === 2) {
        lines.push('🚨 LOGIC BUG DETECTED — This error will crash on ANY machine');
    } else {
        lines.push('⚠️  HARDWARE ERROR — This may not occur on the target machine');
    }
    lines.push('');

    lines.push(`Error Type : ${report.error.error_type}`);
    lines.push(`Message    : ${report.error.message}`);
    lines.push(`File       : ${report.sourceFile}`);
    lines.push(`Line       : ${report.original_line_mapping.original_line ?? 'unknown'}`);
    if (report.error.function) {
        lines.push(`Function   : ${report.error.function}`);
    }
    lines.push('');

    lines.push('Stack Trace:');
    for (const frame of report.error.stack_trace) {
        lines.push(`  ${frame}`);
    }
    lines.push('');

    lines.push('Translation Context:');
    lines.push(`  ${report.original_line_mapping.translation_note}`);
    lines.push('');

    if (report.proxy_context.translations_applied.length > 0) {
        lines.push('Scaled Parameters:');
        for (const t of report.proxy_context.translations_applied) {
            lines.push(`  ${t.parameter}: ${t.original} → ${t.proxy} (${t.file}:${t.line})`);
        }
        lines.push('');
    }

    lines.push(divider);
    lines.push(`ACTION: ${report.developer_action_required}`);
    lines.push(divider);

    return lines.join('\n');
}
