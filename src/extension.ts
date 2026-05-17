/**
 * ═══════════════════════════════════════════════════════════════════
 *  Extension Entry Point — VRE + Around
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    This is the main entry point for the VS Code extension.
 *    It is called when the extension activates (onStartupFinished).
 *
 *  ACTIVATION SEQUENCE:
 *    1. Get workspace root
 *    2. Initialize logger
 *    3. Create folder structure (.monitor, .VRE, .migrate)
 *    4. Create status bar items
 *    5. Create tree view provider
 *    6. Create hardware monitor instance
 *    7. Register all commands
 *    8. Log activation success
 *
 *  DEACTIVATION:
 *    Stops the hardware monitor, disposes UI components, and
 *    cleans up all resources.
 * ═══════════════════════════════════════════════════════════════════
 */

import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { initializeFolderStructure } from './utils/fileGenerator';
import { HardwareMonitor } from './monitor/hardwareMonitor';
import { VreStatusBar } from './ui/statusBar';
import { VreTreeDataProvider } from './ui/treeDataProvider';
import { registerCommands } from './commands';

const LOG_SOURCE = 'Extension';

/** Global references for cleanup on deactivation */
let monitor: HardwareMonitor | undefined;
let statusBar: VreStatusBar | undefined;
let treeProvider: VreTreeDataProvider | undefined;

/**
 * Called when the extension is activated.
 * Activation event: onStartupFinished
 */
export function activate(context: vscode.ExtensionContext): void {
    const logger = Logger.getInstance();

    // Get workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        logger.warn(LOG_SOURCE, 'No workspace folder open — VRE extension inactive');
        return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    // Initialize logger with workspace path (for runtime.log)
    logger.setWorkspaceRoot(workspaceRoot);

    logger.info(LOG_SOURCE, '═══════════════════════════════════════════════');
    logger.info(LOG_SOURCE, '  VRE + Around — Activating');
    logger.info(LOG_SOURCE, `  Workspace: ${workspaceRoot}`);
    logger.info(LOG_SOURCE, '═══════════════════════════════════════════════');

    // Create folder structure (idempotent — won't overwrite existing files)
    try {
        initializeFolderStructure(workspaceRoot);
    } catch (err) {
        logger.error(LOG_SOURCE, `Failed to initialize folder structure: ${err}`);
    }

    // Create UI components
    statusBar = new VreStatusBar();
    treeProvider = new VreTreeDataProvider(workspaceRoot);
    monitor = new HardwareMonitor(workspaceRoot);

    // Register tree view
    const treeView = vscode.window.createTreeView('vreTreeView', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });

    // Register all commands
    const commandDisposables = registerCommands(
        context,
        workspaceRoot,
        monitor,
        statusBar,
        treeProvider,
    );

    // Watch for file changes in VRE directories to auto-refresh tree
    const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(workspaceRoot, '{.monitor,.VRE,.migrate}/**')
    );
    watcher.onDidChange(() => treeProvider?.refresh());
    watcher.onDidCreate(() => treeProvider?.refresh());
    watcher.onDidDelete(() => treeProvider?.refresh());

    // Register all disposables
    context.subscriptions.push(
        treeView,
        watcher,
        ...commandDisposables,
    );

    logger.info(LOG_SOURCE, '✅ VRE + Around activated successfully');
    logger.info(LOG_SOURCE, 'Run "VRE: Initialize" or "VRE: Scan Dependencies" to get started');
}

/**
 * Called when the extension is deactivated.
 * Cleans up all resources: stops monitor, disposes UI.
 */
export function deactivate(): void {
    const logger = Logger.getInstance();
    logger.info(LOG_SOURCE, 'VRE + Around — Deactivating');

    monitor?.dispose();
    statusBar?.dispose();
    treeProvider?.dispose();
    logger.dispose();
}
