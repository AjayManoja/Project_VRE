/**
 * Commands — Production-grade with context keys, export, and error boundaries
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

export function registerCommands(
    context: vscode.ExtensionContext,
    workspaceRoot: string,
    monitor: HardwareMonitor,
    statusBar: VreStatusBar,
    treeProvider: VreTreeDataProvider,
): vscode.Disposable[] {
    const logger = Logger.getInstance();
    const disposables: vscode.Disposable[] = [];
    let monitorEventDisposable: vscode.Disposable | undefined;

    // ═══ vre.initialize ═══
    disposables.push(vscode.commands.registerCommand('vre.initialize', async () => {
        logger.info(LOG_SOURCE, 'Command: vre.initialize');
        try {
            initializeFolderStructure(workspaceRoot);
            treeProvider.refresh();
            vscode.window.showInformationMessage('✅ VRE folder structure initialized');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`VRE initialization failed: ${msg}`);
            logger.error(LOG_SOURCE, `Init failed: ${msg}`);
        }
    }));

    // ═══ vre.scanDependencies ═══
    disposables.push(vscode.commands.registerCommand('vre.scanDependencies', async () => {
        logger.info(LOG_SOURCE, 'Command: vre.scanDependencies');
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'VRE: Scanning dependencies...',
            cancellable: true,
        }, async (progress, token) => {
            try {
                if (token.isCancellationRequested) { return; }
                progress.report({ message: 'Scanning project requirements...' });
                const result = await runMigrateScan(workspaceRoot);
                if (token.isCancellationRequested) { return; }

                progress.report({ message: 'Done!' });
                treeProvider.refresh();

                if (DashboardPanel.currentPanel) {
                    DashboardPanel.currentPanel.updateDelta(result.delta);
                }

                const msg = `VRE Scan: ${result.delta.satisfied.length} ✅ | ${result.delta.missing.length} ❌ | ${result.delta.mismatched.length} ⚠️`;
                const action = await vscode.window.showInformationMessage(msg, 'View Delta.X', 'Open Dashboard');
                if (action === 'View Delta.X') {
                    const p = path.join(workspaceRoot, '.migrate', 'delta.X');
                    if (fs.existsSync(p)) { await vscode.window.showTextDocument(vscode.Uri.file(p)); }
                } else if (action === 'Open Dashboard') {
                    DashboardPanel.createOrShow();
                }
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`VRE scan failed: ${msg}`);
                logger.error(LOG_SOURCE, `Scan failed: ${msg}`);
            }
        });
    }));

    // ═══ vre.startMonitor ═══
    disposables.push(vscode.commands.registerCommand('vre.startMonitor', () => {
        logger.info(LOG_SOURCE, 'Command: vre.startMonitor');
        if (monitor.running) {
            vscode.window.showWarningMessage('VRE Monitor is already running');
            return;
        }

        monitor.start();
        statusBar.setMonitoring(true);
        vscode.commands.executeCommand('setContext', 'vre:monitorRunning', true);
        treeProvider.refresh();

        // Dispose previous subscription if any
        monitorEventDisposable?.dispose();
        monitorEventDisposable = monitor.onMonitorEvent(event => {
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
    }));

    // ═══ vre.stopMonitor ═══
    disposables.push(vscode.commands.registerCommand('vre.stopMonitor', () => {
        logger.info(LOG_SOURCE, 'Command: vre.stopMonitor');
        if (!monitor.running) {
            vscode.window.showWarningMessage('VRE Monitor is not running');
            return;
        }

        monitor.stop();
        statusBar.setMonitoring(false);
        vscode.commands.executeCommand('setContext', 'vre:monitorRunning', false);
        monitorEventDisposable?.dispose();
        monitorEventDisposable = undefined;
        treeProvider.refresh();
        vscode.window.showInformationMessage('🔴 VRE Hardware Monitor stopped');
    }));

    // ═══ vre.showDashboard ═══
    disposables.push(vscode.commands.registerCommand('vre.showDashboard', () => {
        logger.info(LOG_SOURCE, 'Command: vre.showDashboard');
        DashboardPanel.createOrShow();
    }));

    // ═══ vre.translateAndRun ═══
    disposables.push(vscode.commands.registerCommand('vre.translateAndRun', async () => {
        logger.info(LOG_SOURCE, 'Command: vre.translateAndRun');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('VRE: Open a .py or .js file first.');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const ext = path.extname(filePath).toLowerCase();
        if (ext !== '.py' && ext !== '.js') {
            vscode.window.showWarningMessage('VRE: Only .py and .js files are supported.');
            return;
        }

        // Save the file before translation
        if (editor.document.isDirty) {
            await editor.document.save();
        }

        initializeFolderStructure(workspaceRoot);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'VRE: Translating & running proxy...',
            cancellable: false,
        }, async (progress) => {
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
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                vscode.window.showErrorMessage(`VRE translate & run failed: ${msg}`);
                logger.error(LOG_SOURCE, `Translate & run failed: ${msg}`);
            }
        });
    }));

    // ═══ vre.viewDelta ═══
    disposables.push(vscode.commands.registerCommand('vre.viewDelta', () => {
        const p = path.join(workspaceRoot, '.migrate', 'delta.X');
        if (fs.existsSync(p)) {
            vscode.window.showTextDocument(vscode.Uri.file(p));
        } else {
            vscode.window.showWarningMessage('Run "VRE: Scan Dependencies" first.');
        }
    }));

    // ═══ vre.refreshTree ═══
    disposables.push(vscode.commands.registerCommand('vre.refreshTree', () => {
        treeProvider.refresh();
    }));

    // ═══ vre.exportReport ═══
    disposables.push(vscode.commands.registerCommand('vre.exportReport', async () => {
        logger.info(LOG_SOURCE, 'Command: vre.exportReport');
        try {
            const files = ['delta.X', 'system.snapshot', 'requirements.scan', 'env.setup'];
            const migrateDir = path.join(workspaceRoot, '.migrate');
            const sections: string[] = [
                `═══ VRE Environment Report ═══`,
                `Exported: ${new Date().toISOString()}`,
                `Workspace: ${workspaceRoot}`,
                '',
            ];

            for (const file of files) {
                const filePath = path.join(migrateDir, file);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    sections.push(`── ${file} ──`, content, '');
                }
            }

            const doc = await vscode.workspace.openTextDocument({
                content: sections.join('\n'),
                language: 'plaintext',
            });
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage('📋 Environment report exported');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            vscode.window.showErrorMessage(`Export failed: ${msg}`);
        }
    }));

    return disposables;
}
