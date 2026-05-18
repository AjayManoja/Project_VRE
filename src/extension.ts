import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { runMigrate } from './migrate/index';
import { Monitor } from './monitor/watcher';
import { StatusBar } from './ui/status_bar';
import { registerCommands } from './commands';
import { getExecutableAbsolutePath } from './utils/platform';
import * as path from 'path';

const LOG = 'Extension';

let monitor: Monitor | undefined;
let statusBar: StatusBar | undefined;

export function activate(context: vscode.ExtensionContext): void {
    const log = Logger.get();
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        log.warn(LOG, 'No workspace open — VRE inactive');
        return;
    }

    const root = folders[0].uri.fsPath;
    log.info(LOG, `VRE activating in: ${root}`);

    // create UI
    statusBar = new StatusBar();
    monitor = new Monitor();

    // register commands
    const cmds = registerCommands(context, root, monitor, statusBar);
    context.subscriptions.push(...cmds);

    // Map to keep track of VRE-aligned terminals by active file path
    const vreTerminals = new Map<string, vscode.Terminal>();

    // Helper to align environment context
    async function alignEnvironment(editor: vscode.TextEditor | undefined) {
        if (!editor) {
            context.environmentVariableCollection.clear();
            statusBar?.setAligned(null);
            return;
        }

        const fp = editor.document.uri.fsPath;
        const ext = path.extname(fp).toLowerCase();
        if (ext !== '.py' && ext !== '.js') {
            context.environmentVariableCollection.clear();
            statusBar?.setAligned(null);
            return;
        }

        const binName = ext === '.py' ? 'python' : 'node';
        const absPath = getExecutableAbsolutePath(binName);
        if (!absPath) return;

        const dir = path.dirname(absPath);
        const pathSep = process.platform === 'win32' ? ';' : ':';

        context.environmentVariableCollection.clear();
        context.environmentVariableCollection.prepend('PATH', dir + pathSep);
        
        const langLabel = ext === '.py' ? 'Python' : 'Node';
        statusBar?.setAligned(langLabel);
        log.info(LOG, `Workspace terminal environment pre-aligned to ${langLabel}: ${absPath}`);
    }

    // Align on active editor change
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        alignEnvironment(editor);
    }));

    // Track terminals opened while alignment is active
    context.subscriptions.push(vscode.window.onDidOpenTerminal(terminal => {
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const fp = activeEditor.document.uri.fsPath;
            const ext = path.extname(fp).toLowerCase();
            if (ext === '.py' || ext === '.js') {
                vreTerminals.set(fp, terminal);
                log.info(LOG, `Terminal registered for active environment session: ${path.basename(fp)}`);
            }
        }
    }));

    // Revert overrides and close active terminals when file is closed
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
        const fp = doc.uri.fsPath;
        const ext = path.extname(fp).toLowerCase();
        if (ext === '.py' || ext === '.js') {
            log.info(LOG, `File closed: ${path.basename(fp)}. Reverting environment and terminating aligned terminals.`);
            
            // Clear dynamic PATH overrides
            context.environmentVariableCollection.clear();
            statusBar?.setAligned(null);

            // Terminate the terminal session associated with this file
            const term = vreTerminals.get(fp);
            if (term) {
                try {
                    term.dispose();
                    log.info(LOG, `Terminated aligned terminal session for: ${path.basename(fp)}`);
                } catch (e) {
                    log.warn(LOG, `Failed to cleanly dispose terminal: ${e}`);
                }
                vreTerminals.delete(fp);
            }
        }
    }));

    // Trigger alignment check for current open editor
    alignEnvironment(vscode.window.activeTextEditor);

    context.subscriptions.push({ dispose: () => { monitor?.dispose(); statusBar?.dispose(); log.dispose(); } });

    // auto-scan on open — run .migrate silently in background
    runMigrate(root).then(result => {
        log.info(LOG, `Auto-scan: ${result.delta.satisfied.length} ok, ${result.delta.missing.length} missing`);
        if (result.delta.missing.length > 0) {
            const names = result.delta.missing.slice(0, 5).map(i => i.name).join(', ');
            const more = result.delta.missing.length > 5 ? ` +${result.delta.missing.length - 5} more` : '';
            vscode.window.showInformationMessage(`VRE: Missing deps detected: ${names}${more}`, 'View delta.X').then(action => {
                if (action) vscode.commands.executeCommand('vre.viewDelta');
            });
        }
    }).catch(err => {
        log.warn(LOG, `Auto-scan failed: ${err}`);
    });

    log.info(LOG, 'VRE activated');
}

export function deactivate(): void {
    monitor?.dispose();
    statusBar?.dispose();
}
