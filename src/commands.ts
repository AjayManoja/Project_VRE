/**
 * ═══════════════════════════════════════════════════════════════════
 *  Commands — All VS Code command implementations
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Registers and implements all VS Code commands defined in
 *    package.json. Each command maps to a user action:
 *
 *    vre.initialize       → Create folder structure
 *    vre.scanDependencies → Run full migrate scan
 *    vre.startMonitor     → Start hardware monitoring
 *    vre.stopMonitor      → Stop hardware monitoring
 *    vre.showDashboard    → Open the dashboard webview
 *    vre.translateAndRun  → Translate + execute current file
 *    vre.viewDelta        → Open delta.X in editor
 *    vre.refreshTree      → Refresh the tree view
 *
 *  USED BY:
 *    - src/extension.ts  (registers commands on activation)
 * ═══════════════════════════════════════════════════════════════════
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './utils/logger';
import { initializeFolderStructure } from './utils/fileGenerator';
import { runMigrateScan } from './migrate/index';
import { HardwareMonitor } from './monitor/hardwareMonitor';
import { runVreLifecycle } from './vre/index';
import { VreStatusBar } from './ui/statusBar';
import { DashboardPanel } from './ui/dashboardPanel';
import { VreTreeDataProvider } from './ui/treeDataProvider';

const LOG_SOURCE = 'Commands';

/**
 * Register all VRE commands and return disposables.
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    workspaceRoot: string,
    monitor: HardwareMonitor,
    statusBar: VreStatusBar,
    treeProvider: VreTreeDataProvider,
): vscode.Disposable[] {
    const logger = Logger.getInstance();
    const disposables: vscode.Disposable[] = [];

    // ═══ vre.initialize ═══
    disposables.push(
        vscode.commands.registerCommand('vre.initialize', async () => {
            logger.info(LOG_SOURCE, 'Command: vre.initialize');
            try {
                initializeFolderStructure(workspaceRoot);
                treeProvider.refresh();
                vscode.window.showInformationMessage('✅ VRE folder structure initialized');
                logger.show();
            } catch (err) {
                vscode.window.showErrorMessage(`VRE initialization failed: ${err}`);
            }
        })
    );

    // ═══ vre.scanDependencies ═══
    disposables.push(
        vscode.commands.registerCommand('vre.scanDependencies', async () => {
            logger.info(LOG_SOURCE, 'Command: vre.scanDependencies');

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'VRE: Scanning dependencies...',
                    cancellable: false,
                },
                async (progress) => {
                    try {
                        progress.report({ message: 'Scanning project requirements...' });
                        const result = await runMigrateScan(workspaceRoot);

                        progress.report({ message: 'Done!' });
                        treeProvider.refresh();

                        // Update dashboard if open
                        if (DashboardPanel.currentPanel) {
                            DashboardPanel.currentPanel.updateDelta(result.delta);
                        }

                        // Show summary notification
                        const msg = `VRE Scan: ${result.delta.satisfied.length} ✅ satisfied, ${result.delta.missing.length} ❌ missing, ${result.delta.mismatched.length} ⚠️ mismatched`;
                        vscode.window.showInformationMessage(msg, 'View Delta.X').then(action => {
                            if (action === 'View Delta.X') {
                                const deltaPath = path.join(workspaceRoot, '.migrate', 'delta.X');
                                vscode.window.showTextDocument(vscode.Uri.file(deltaPath));
                            }
                        });

                        logger.show();
                    } catch (err) {
                        vscode.window.showErrorMessage(`VRE scan failed: ${err}`);
                        logger.error(LOG_SOURCE, `Scan failed: ${err}`);
                    }
                }
            );
        })
    );

    // ═══ vre.startMonitor ═══
    disposables.push(
        vscode.commands.registerCommand('vre.startMonitor', () => {
            logger.info(LOG_SOURCE, 'Command: vre.startMonitor');

            if (monitor.running) {
                vscode.window.showWarningMessage('VRE Monitor is already running');
                return;
            }

            monitor.start();
            statusBar.setMonitoring(true);
            treeProvider.refresh();

            // Subscribe to monitor events for UI updates
            monitor.onMonitorEvent(event => {
                if (event.type === 'sample' && event.sample) {
                    statusBar.update(event.sample);
                    if (DashboardPanel.currentPanel) {
                        DashboardPanel.currentPanel.updateMetrics(event.sample);
                    }
                }
                if (event.type === 'alert' && event.alerts) {
                    for (const alert of event.alerts) {
                        if (DashboardPanel.currentPanel) {
                            DashboardPanel.currentPanel.sendAlert(alert.message, alert.severity);
                        }
                    }
                }
            });

            vscode.window.showInformationMessage('🟢 VRE Hardware Monitor started');
        })
    );

    // ═══ vre.stopMonitor ═══
    disposables.push(
        vscode.commands.registerCommand('vre.stopMonitor', () => {
            logger.info(LOG_SOURCE, 'Command: vre.stopMonitor');

            if (!monitor.running) {
                vscode.window.showWarningMessage('VRE Monitor is not running');
                return;
            }

            monitor.stop();
            statusBar.setMonitoring(false);
            treeProvider.refresh();
            vscode.window.showInformationMessage('🔴 VRE Hardware Monitor stopped');
        })
    );

    // ═══ vre.showDashboard ═══
    disposables.push(
        vscode.commands.registerCommand('vre.showDashboard', () => {
            logger.info(LOG_SOURCE, 'Command: vre.showDashboard');
            DashboardPanel.createOrShow();
        })
    );

    // ═══ vre.translateAndRun ═══
    disposables.push(
        vscode.commands.registerCommand('vre.translateAndRun', async () => {
            logger.info(LOG_SOURCE, 'Command: vre.translateAndRun');

            // Get the currently active file
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('VRE: No active file to translate. Open a Python or JS file first.');
                return;
            }

            const filePath = activeEditor.document.uri.fsPath;
            const ext = path.extname(filePath).toLowerCase();

            if (ext !== '.py' && ext !== '.js') {
                vscode.window.showWarningMessage('VRE: Only .py and .js files can be translated and run.');
                return;
            }

            // Ensure folder structure exists
            initializeFolderStructure(workspaceRoot);

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'VRE: Translating & running proxy...',
                    cancellable: false,
                },
                async (progress) => {
                    try {
                        progress.report({ message: 'Translating code...' });
                        const result = await runVreLifecycle(filePath, workspaceRoot);

                        treeProvider.refresh();

                        if (result.logicClean) {
                            progress.report({ message: '✅ Code is logic-clean!' });
                        } else {
                            progress.report({ message: '🚨 Error detected — see report' });
                        }

                        logger.show();
                    } catch (err) {
                        vscode.window.showErrorMessage(`VRE translate & run failed: ${err}`);
                        logger.error(LOG_SOURCE, `Translate & run failed: ${err}`);
                    }
                }
            );
        })
    );

    // ═══ vre.viewDelta ═══
    disposables.push(
        vscode.commands.registerCommand('vre.viewDelta', () => {
            logger.info(LOG_SOURCE, 'Command: vre.viewDelta');
            const deltaPath = path.join(workspaceRoot, '.migrate', 'delta.X');
            if (fs.existsSync(deltaPath)) {
                vscode.window.showTextDocument(vscode.Uri.file(deltaPath));
            } else {
                vscode.window.showWarningMessage('VRE: No delta.X file found. Run "VRE: Scan Dependencies" first.');
            }
        })
    );

    // ═══ vre.refreshTree ═══
    disposables.push(
        vscode.commands.registerCommand('vre.refreshTree', () => {
            treeProvider.refresh();
        })
    );

    return disposables;
}
