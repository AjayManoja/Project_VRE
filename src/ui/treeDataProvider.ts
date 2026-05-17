/**
 * ═══════════════════════════════════════════════════════════════════
 *  Tree Data Provider — VRE Explorer sidebar tree view
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Provides a tree view in the VS Code Activity Bar sidebar that
 *    shows the three VRE layers (.monitor, .VRE, .migrate) and their
 *    files. Clicking a file opens it in the editor. The tree
 *    auto-refreshes when files change.
 *
 *  TREE STRUCTURE:
 *    📁 .monitor
 *      📄 runtime.log
 *    📁 .VRE
 *      📄 vre.config.json
 *      📄 vre.translation.json
 *      📄 vre.error.report.json
 *      ...
 *    📁 .migrate
 *      📄 requirements.scan
 *      📄 system.snapshot
 *      📄 delta.X
 *      📄 env.setup
 *
 *  USED BY:
 *    - src/extension.ts  (registered on activation)
 * ═══════════════════════════════════════════════════════════════════
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class VreTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly filePath: string | null,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly isDirectory: boolean,
    ) {
        super(label, collapsibleState);

        if (isDirectory) {
            this.iconPath = new vscode.ThemeIcon('folder');
            this.contextValue = 'directory';
        } else {
            this.iconPath = this.getFileIcon(label);
            this.contextValue = 'file';

            if (filePath) {
                this.command = {
                    command: 'vscode.open',
                    title: 'Open File',
                    arguments: [vscode.Uri.file(filePath)],
                };
                this.tooltip = filePath;
            }
        }
    }

    private getFileIcon(filename: string): vscode.ThemeIcon {
        if (filename.endsWith('.json')) { return new vscode.ThemeIcon('json'); }
        if (filename.endsWith('.log')) { return new vscode.ThemeIcon('output'); }
        if (filename === 'delta.X') { return new vscode.ThemeIcon('diff'); }
        if (filename.endsWith('.scan')) { return new vscode.ThemeIcon('search'); }
        if (filename.endsWith('.snapshot')) { return new vscode.ThemeIcon('device-camera'); }
        if (filename === 'env.setup') { return new vscode.ThemeIcon('checklist'); }
        if (filename === 'env.lock') { return new vscode.ThemeIcon('lock'); }
        return new vscode.ThemeIcon('file');
    }
}

export class VreTreeDataProvider implements vscode.TreeDataProvider<VreTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<VreTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private workspaceRoot: string;

    /** The three VRE layer directories */
    private readonly LAYERS = [
        { dir: '.monitor', label: '.monitor — Live Hardware Watcher', icon: 'pulse' },
        { dir: '.VRE', label: '.VRE — Virtual Runtime Environment', icon: 'server-environment' },
        { dir: '.migrate', label: '.migrate — Dependency Manager', icon: 'package' },
    ];

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /** Refresh the tree view */
    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: VreTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: VreTreeItem): VreTreeItem[] {
        if (!element) {
            // Root level — show the three layer folders
            return this.LAYERS.map(layer => {
                const dirPath = path.join(this.workspaceRoot, layer.dir);
                const exists = fs.existsSync(dirPath);
                const item = new VreTreeItem(
                    layer.label,
                    dirPath,
                    exists
                        ? vscode.TreeItemCollapsibleState.Expanded
                        : vscode.TreeItemCollapsibleState.None,
                    true
                );
                item.iconPath = new vscode.ThemeIcon(layer.icon);
                item.description = exists ? '' : '(not initialized)';
                return item;
            });
        }

        // Child level — show files inside a layer directory
        if (element.isDirectory && element.filePath) {
            try {
                const entries = fs.readdirSync(element.filePath);
                return entries
                    .filter(name => !name.startsWith('.') && name !== 'proxy') // Hide proxy dir and dotfiles
                    .sort()
                    .map(name => {
                        const fullPath = path.join(element.filePath!, name);
                        const isDir = fs.statSync(fullPath).isDirectory();

                        // Add file size info
                        let description = '';
                        if (!isDir) {
                            const stat = fs.statSync(fullPath);
                            if (stat.size > 0) {
                                description = stat.size > 1024
                                    ? `${(stat.size / 1024).toFixed(1)} KB`
                                    : `${stat.size} B`;
                            } else {
                                description = 'empty';
                            }
                        }

                        const item = new VreTreeItem(
                            name,
                            fullPath,
                            isDir
                                ? vscode.TreeItemCollapsibleState.Collapsed
                                : vscode.TreeItemCollapsibleState.None,
                            isDir
                        );
                        item.description = description;
                        return item;
                    });
            } catch {
                return [];
            }
        }

        return [];
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }
}
