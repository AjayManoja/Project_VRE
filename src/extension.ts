/**
 * Extension Entry Point — Production-grade lifecycle management
 */

import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { initializeFolderStructure } from './utils/fileGenerator';
import { HardwareMonitor } from './monitor/hardwareMonitor';
import { VreStatusBar } from './ui/statusBar';
import { VreTreeDataProvider } from './ui/treeDataProvider';
import { registerCommands } from './commands';
import { runMigrateScan } from './migrate/index';

const LOG_SOURCE = 'Extension';
const EXTENSION_VERSION = '1.0.0';

/** Global disposable tracker */
const disposables: vscode.Disposable[] = [];
let monitor: HardwareMonitor | undefined;
let statusBar: VreStatusBar | undefined;
let treeProvider: VreTreeDataProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const logger = Logger.getInstance();

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        logger.warn(LOG_SOURCE, 'No workspace folder open — VRE extension inactive');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    logger.setWorkspaceRoot(workspaceRoot);

    logger.info(LOG_SOURCE, `VRE + Around v${EXTENSION_VERSION} — Activating`);
    logger.info(LOG_SOURCE, `Workspace: ${workspaceRoot}`);

    // Set context keys for command visibility
    vscode.commands.executeCommand('setContext', 'vre:monitorRunning', false);
    vscode.commands.executeCommand('setContext', 'vre:activated', true);

    // Idempotent folder structure
    try {
        initializeFolderStructure(workspaceRoot);
    } catch (err) {
        logger.error(LOG_SOURCE, `Folder init failed: ${err}`);
    }

    // UI components
    statusBar = new VreStatusBar();
    treeProvider = new VreTreeDataProvider(workspaceRoot);
    monitor = new HardwareMonitor(workspaceRoot);

    // Tree view
    const treeView = vscode.window.createTreeView('vreTreeView', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });

    // Commands
    const commandDisposables = registerCommands(context, workspaceRoot, monitor, statusBar, treeProvider);

    // File watcher — debounced refresh
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceRoot, '{.monitor,.VRE,.migrate}/**')
    );
    let refreshTimeout: ReturnType<typeof setTimeout> | undefined;
    const debouncedRefresh = () => {
        if (refreshTimeout) { clearTimeout(refreshTimeout); }
        refreshTimeout = setTimeout(() => treeProvider?.refresh(), 300);
    };
    watcher.onDidChange(debouncedRefresh);
    watcher.onDidCreate(debouncedRefresh);
    watcher.onDidDelete(debouncedRefresh);

    // Config change listener
    const configWatcher = vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('vre')) {
            logger.info(LOG_SOURCE, 'Configuration changed — reloading');
        }
    });

    // Register all disposables
    disposables.push(treeView, watcher, configWatcher, ...commandDisposables);
    context.subscriptions.push(...disposables);

    // Auto-scan on open (if enabled)
    const config = vscode.workspace.getConfiguration('vre');
    if (config.get<boolean>('autoScanOnOpen', false)) {
        logger.info(LOG_SOURCE, 'Auto-scan enabled — running initial dependency scan');
        runMigrateScan(workspaceRoot).catch(err => {
            logger.warn(LOG_SOURCE, `Auto-scan failed: ${err}`);
        });
    }

    logger.info(LOG_SOURCE, '✅ VRE + Around activated successfully');
}

export function deactivate(): void {
    try {
        const logger = Logger.getInstance();
        logger.info(LOG_SOURCE, 'VRE + Around — Deactivating');

        vscode.commands.executeCommand('setContext', 'vre:activated', false);
        vscode.commands.executeCommand('setContext', 'vre:monitorRunning', false);

        monitor?.dispose();
        statusBar?.dispose();
        treeProvider?.dispose();

        for (const d of disposables) {
            try { d.dispose(); } catch { /* skip individual disposal failures */ }
        }
        disposables.length = 0;

        logger.dispose();
    } catch {
        // Never throw during deactivation
    }
}
