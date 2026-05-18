import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { runMigrate } from './migrate/index';
import { promptAndInstall } from './migrate/installer';
import { runVRE } from './vre/index';
import { Monitor } from './monitor/watcher';
import { StatusBar } from './ui/status_bar';
import { getExecutableAbsolutePath } from './utils/platform';
import { Logger } from './utils/logger';

const LOG = 'Commands';

export function registerCommands(
    context: vscode.ExtensionContext,
    root: string,
    monitor: Monitor,
    statusBar: StatusBar,
): vscode.Disposable[] {
    const log = Logger.get();
    const disposables: vscode.Disposable[] = [];

    // ── Scan Dependencies ──
    disposables.push(vscode.commands.registerCommand('vre.scanDependencies', async () => {
        log.info(LOG, 'Scanning dependencies...');
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'VRE: Scanning environment...' },
            async () => {
                try {
                    const result = await runMigrate(root);
                    const msg = `${result.delta.satisfied.length} satisfied, ${result.delta.missing.length} missing, ${result.delta.mismatched.length} mismatch`;
                    const action = await vscode.window.showInformationMessage(`VRE Scan: ${msg}`, 'View delta.X', 'Install Missing');
                    if (action === 'View delta.X') {
                        const fp = path.join(root, '.migrate', 'delta.X');
                        if (fs.existsSync(fp)) await vscode.window.showTextDocument(vscode.Uri.file(fp));
                    } else if (action === 'Install Missing') {
                        await promptAndInstall(result.delta.missing);
                    }
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`Scan failed: ${msg}`);
                }
            }
        );
    }));

    // ── Translate & Run ──
    disposables.push(vscode.commands.registerCommand('vre.translateAndRun', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('Open a .py or .js file first.'); return; }

        const fp = editor.document.uri.fsPath;
        const ext = path.extname(fp).toLowerCase();
        if (ext !== '.py' && ext !== '.js') { vscode.window.showWarningMessage('Only .py and .js files supported.'); return; }

        if (editor.document.isDirty) await editor.document.save();

        log.info(LOG, `Translate & Run: ${path.basename(fp)}`);

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'VRE: Running...' },
            async () => {
                try {
                    // auto-scan if no delta exists
                    const deltaPath = path.join(root, '.migrate', 'delta.json');
                    if (!fs.existsSync(deltaPath)) {
                        log.info(LOG, 'No delta found — running auto-scan first');
                        await runMigrate(root);
                    }

                    const report = await runVRE(fp, root);

                    if (report.logicClean) {
                        const binName = ext === '.py' ? 'python' : 'node';
                        const absBinPath = getExecutableAbsolutePath(binName) || binName;
                        const versionLabel = ext === '.py' ? `Python ${report.runtimeVersion}` : `Node.js ${report.runtimeVersion}`;

                        const action = await vscode.window.showInformationMessage(
                            `✅ VRE: Code is logic-clean! VRE has mapped the exact aligned environment (${versionLabel}) where torch/dependencies are verified. You can run the full script safely now with zero version conflicts!`,
                            'Run Full Script Locally'
                        );
                        if (action === 'Run Full Script Locally') {
                            const term = vscode.window.createTerminal('VRE Run Full');
                            term.show();
                            const relativeFp = path.relative(root, fp);
                            const runCmd = `"${absBinPath}" "${relativeFp}"`;
                            term.sendText(runCmd);
                        }
                    } else if (report.execution.error) {
                        const cat = report.execution.error.classification.category;
                        const errType = report.execution.error.parsed.type;
                        const msg = cat === 2
                            ? `🚨 Logic bug: ${errType} at line ${report.originalLine}`
                            : `⚠️ Hardware limit: ${errType}`;
                        const action = await vscode.window.showWarningMessage(msg, 'View Report');
                        if (action === 'View Report') {
                            const reportFile = cat === 2
                                ? path.join(root, '.VRE', 'vre.error.report.json')
                                : path.join(root, '.VRE', 'vre.crash.report');
                            if (fs.existsSync(reportFile)) await vscode.window.showTextDocument(vscode.Uri.file(reportFile));
                        }
                    }

                    log.show();
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    vscode.window.showErrorMessage(`VRE failed: ${msg}`);
                    log.error(LOG, msg);
                }
            }
        );
    }));

    // ── Start Monitor ──
    disposables.push(vscode.commands.registerCommand('vre.startMonitor', () => {
        if (monitor.running) { vscode.window.showWarningMessage('Monitor already running.'); return; }
        monitor.start();
        statusBar.setMonitoring(true);
        monitor.on('sample', s => statusBar.update(s));
        monitor.on('leak', w => vscode.window.showWarningMessage(`VRE: ${w.metric} leak detected (+${w.ratePerSample}GB/sample)`));
        vscode.window.showInformationMessage('Monitor started.');
    }));

    // ── Stop Monitor ──
    disposables.push(vscode.commands.registerCommand('vre.stopMonitor', () => {
        if (!monitor.running) { vscode.window.showWarningMessage('Monitor not running.'); return; }
        monitor.stop();
        statusBar.setMonitoring(false);
        vscode.window.showInformationMessage('Monitor stopped.');
    }));

    // ── View Delta ──
    disposables.push(vscode.commands.registerCommand('vre.viewDelta', () => {
        const fp = path.join(root, '.migrate', 'delta.X');
        if (fs.existsSync(fp)) vscode.window.showTextDocument(vscode.Uri.file(fp));
        else vscode.window.showWarningMessage('Run "Scan Dependencies" first.');
    }));

    return disposables;
}
