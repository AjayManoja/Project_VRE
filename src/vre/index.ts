/**
 * ═══════════════════════════════════════════════════════════════════
 *  VRE Layer — Orchestrator for the full VRE lifecycle
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Orchestrates the complete VRE workflow:
 *      1. Read code and detect target machine assumptions
 *      2. Translate to proxy (translationEngine)
 *      3. Spin up container state (vre.container.json)
 *      4. Execute proxy (proxyExecutor)
 *      5. Classify errors and generate report (errorReporter)
 *      6. Tear down and release (vre.release.log)
 *
 *  USED BY:
 *    - src/commands.ts  (vre.translateAndRun command)
 *
 *  HUMAN-IN-THE-LOOP:
 *    After error detection, the orchestrator surfaces the report
 *    in the editor and WAITS for developer confirmation before
 *    any AI-driven fix is applied.
 * ═══════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { translateFile, TranslationResult } from './translationEngine';
import { executeProxy, ExecutionResult } from './proxyExecutor';
import { generateErrorReport, formatErrorReportText, ErrorReport } from './errorReporter';

const LOG_SOURCE = 'VRE';

export interface VreRunResult {
    translation: TranslationResult;
    execution: ExecutionResult;
    errorReport: ErrorReport | null;
    logicClean: boolean;
}

/**
 * Run the full VRE lifecycle on a source file:
 * translate → execute proxy → report errors → teardown.
 */
export async function runVreLifecycle(
    sourceFile: string,
    workspaceRoot: string
): Promise<VreRunResult> {
    const logger = Logger.getInstance();
    const vreDir = path.join(workspaceRoot, '.VRE');

    logger.info(LOG_SOURCE, '═══════════════════════════════════════════════');
    logger.info(LOG_SOURCE, '  VRE LIFECYCLE — Starting');
    logger.info(LOG_SOURCE, `  Source: ${path.basename(sourceFile)}`);
    logger.info(LOG_SOURCE, '═══════════════════════════════════════════════');

    // Step 1: Write container state
    const containerState = {
        status: 'running',
        created_at: new Date().toISOString(),
        pid: process.pid,
        source_file: path.basename(sourceFile),
    };
    fs.writeFileSync(
        path.join(vreDir, 'vre.container.json'),
        JSON.stringify(containerState, null, 2),
        'utf-8'
    );

    // Step 2: Translate
    logger.info(LOG_SOURCE, 'Step 1/4: Translating source code...');
    const translation = translateFile(sourceFile, workspaceRoot);

    if (translation.translationsApplied.length === 0) {
        logger.info(LOG_SOURCE, '  No translations needed — code already fits local resources');
    } else {
        logger.info(LOG_SOURCE, `  ${translation.translationsApplied.length} parameters translated`);
    }

    // Step 3: Execute proxy
    logger.info(LOG_SOURCE, 'Step 2/4: Executing proxy code...');
    const ext = path.extname(sourceFile).toLowerCase();
    const language: 'python' | 'node' = ext === '.py' ? 'python' : 'node';
    const proxyPath = path.join(vreDir, 'proxy', translation.proxyFile);

    const execution = await executeProxy(proxyPath, workspaceRoot, language);

    // Step 4: Handle result
    let errorReport: ErrorReport | null = null;
    let logicClean = false;

    if (execution.success) {
        // No errors — code is logic-clean
        logger.info(LOG_SOURCE, 'Step 3/4: ✅ No errors detected — code is logic-clean');
        logicClean = true;

        // Write vre.lock.json
        const lockData = {
            locked: true,
            verified_at: new Date().toISOString(),
            source_file: path.basename(sourceFile),
            translations_count: translation.translationsApplied.length,
            execution_duration_ms: execution.durationMs,
            result: 'logic-clean',
        };
        fs.writeFileSync(
            path.join(vreDir, 'vre.lock.json'),
            JSON.stringify(lockData, null, 2),
            'utf-8'
        );

        vscode.window.showInformationMessage(
            `✅ VRE: ${path.basename(sourceFile)} passed logic check — ready for target machine`
        );
    } else if (execution.error) {
        // Error detected — generate report
        logger.info(LOG_SOURCE, `Step 3/4: 🚨 Error detected (Category ${execution.error.category})`);

        errorReport = generateErrorReport(
            execution.error,
            translation.translationsApplied,
            path.basename(sourceFile),
            translation.proxyFile,
            workspaceRoot
        );

        // Show error report in a new editor tab
        const reportText = formatErrorReportText(errorReport);
        const reportDoc = await vscode.workspace.openTextDocument({
            content: reportText,
            language: 'plaintext',
        });
        await vscode.window.showTextDocument(reportDoc, { preview: true });

        // Surface as notification
        if (execution.error.category === 2) {
            const action = await vscode.window.showErrorMessage(
                `🚨 VRE: Logic bug found in ${path.basename(sourceFile)} — ${execution.error.errorType}: ${execution.error.message}`,
                'View Report',
                'Dismiss'
            );
            if (action === 'View Report') {
                const reportUri = vscode.Uri.file(path.join(vreDir, 'vre.error.report.json'));
                await vscode.window.showTextDocument(reportUri);
            }
        } else {
            vscode.window.showWarningMessage(
                `⚠️ VRE: Hardware-scale error in proxy — may not affect target machine. Review vre.error.report.json`
            );
        }
    }

    // Step 5: Teardown — release resources
    logger.info(LOG_SOURCE, 'Step 4/4: Tearing down container...');
    const releaseLog = [
        `═══ VRE Container Release ═══`,
        `Released: ${new Date().toISOString()}`,
        `Source: ${path.basename(sourceFile)}`,
        `Duration: ${execution.durationMs}ms`,
        `Result: ${logicClean ? 'LOGIC-CLEAN' : 'ERRORS FOUND'}`,
        `Translations: ${translation.translationsApplied.length}`,
        `Resources returned to host.`,
        ``,
    ].join('\n');

    fs.appendFileSync(
        path.join(vreDir, 'vre.release.log'),
        releaseLog,
        'utf-8'
    );

    // Update container state
    const finalContainerState = {
        status: 'idle',
        created_at: containerState.created_at,
        released_at: new Date().toISOString(),
        pid: null,
    };
    fs.writeFileSync(
        path.join(vreDir, 'vre.container.json'),
        JSON.stringify(finalContainerState, null, 2),
        'utf-8'
    );

    logger.info(LOG_SOURCE, '═══ VRE LIFECYCLE — Complete ═══');

    return { translation, execution, errorReport, logicClean };
}
