import * as vscode from 'vscode';
import { Logger } from './utils/logger';
import { runMigrate } from './migrate/index';
import { Monitor } from './monitor/watcher';
import { StatusBar } from './ui/status_bar';
import { registerCommands } from './commands';

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
