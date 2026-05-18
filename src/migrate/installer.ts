/**
 * Installer — installs missing deps with user permission.
 * Supports pip and npm. Other ecosystems get install instructions.
 */

import * as vscode from 'vscode';
import { DeltaItem } from './delta';
import { execAsync } from '../utils/platform';
import { Logger } from '../utils/logger';

const LOG = 'Installer';

export async function installMissing(items: DeltaItem[]): Promise<{ installed: string[]; failed: string[]; skipped: string[] }> {
    const log = Logger.get();
    const installed: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    const pipItems = items.filter(i => i.source === 'pip');
    const npmItems = items.filter(i => i.source === 'npm');
    const others = items.filter(i => i.source !== 'pip' && i.source !== 'npm');

    // pip installs
    if (pipItems.length > 0) {
        const names = pipItems.map(i => i.required !== '*' ? `${i.name}${i.required}` : i.name);
        const cmd = `pip install ${names.join(' ')}`;
        log.info(LOG, `Installing pip packages: ${cmd}`);
        const result = await execAsync(cmd);
        if (result !== null) {
            for (const i of pipItems) installed.push(i.name);
            log.info(LOG, `pip install succeeded`);
        } else {
            for (const i of pipItems) failed.push(i.name);
            log.error(LOG, `pip install failed`);
        }
    }

    // npm installs
    if (npmItems.length > 0) {
        const names = npmItems.map(i => i.name);
        const cmd = `npm install -g ${names.join(' ')}`;
        log.info(LOG, `Installing npm packages: ${cmd}`);
        const result = await execAsync(cmd);
        if (result !== null) {
            for (const i of npmItems) installed.push(i.name);
        } else {
            for (const i of npmItems) failed.push(i.name);
        }
    }

    // can't auto-install cargo/go/maven/etc — give instructions
    for (const i of others) {
        skipped.push(`${i.name} (${i.source}) — install manually`);
    }

    return { installed, failed, skipped };
}

export async function promptAndInstall(missing: DeltaItem[]): Promise<boolean> {
    if (missing.length === 0) return true;

    const names = missing.map(i => i.name).join(', ');
    const choice = await vscode.window.showInformationMessage(
        `Missing: ${names}. Install now?`,
        'Yes — install', 'No — I\'ll handle it'
    );

    if (choice === 'Yes — install') {
        const result = await installMissing(missing);
        if (result.failed.length > 0) {
            vscode.window.showWarningMessage(`Failed to install: ${result.failed.join(', ')}`);
            return false;
        }
        if (result.skipped.length > 0) {
            vscode.window.showInformationMessage(`Manual install needed: ${result.skipped.join(', ')}`);
        }
        return true;
    }

    return false;
}
