/**
 * Editor Platform Adapter — Abstracts VS Code APIs for multi-platform deployment
 *
 * This adapter layer decouples VRE's core logic from VS Code-specific APIs.
 * Future targets: Cursor, Windsurf, JetBrains, Neovim, Zed, web-based editors.
 *
 * The core VRE engine (.monitor, .VRE, .migrate) communicates ONLY through
 * this adapter interface. The adapter is implemented per-platform.
 *
 * ARCHITECTURE:
 *   ┌──────────────────────────────────┐
 *   │  VRE Core (.monitor, .VRE, .migrate) │
 *   └──────────────┬───────────────────┘
 *                  │ IEditorAdapter
 *   ┌──────────────┴───────────────────┐
 *   │  Platform Adapters               │
 *   │  ├── VSCodeAdapter (current)     │
 *   │  ├── CursorAdapter (future)      │
 *   │  ├── JetBrainsAdapter (future)   │
 *   │  └── CLIAdapter (future)         │
 *   └──────────────────────────────────┘
 */

/** Notification severity levels */
export type NotificationSeverity = 'info' | 'warning' | 'error';

/** Progress callback for long-running operations */
export interface ProgressReporter {
    report(message: string, increment?: number): void;
}

/** File selection result */
export interface FileSelection {
    path: string;
    content: string;
    language: string;
}

/**
 * IEditorAdapter — The contract that ANY editor platform must implement
 * to host the VRE extension.
 */
export interface IEditorAdapter {
    /** Platform identifier */
    readonly platformId: string;

    /** Get the current workspace root directory */
    getWorkspaceRoot(): string | null;

    /** Get the currently active file being edited */
    getActiveFile(): FileSelection | null;

    /** Show a notification to the user */
    showNotification(message: string, severity: NotificationSeverity, actions?: string[]): Promise<string | undefined>;

    /** Show progress for a long-running operation */
    withProgress<T>(title: string, task: (progress: ProgressReporter) => Promise<T>): Promise<T>;

    /** Open a file in the editor */
    openFile(filePath: string): Promise<void>;

    /** Open a virtual document with content */
    openVirtualDocument(content: string, language: string): Promise<void>;

    /** Save the active document if it has unsaved changes */
    saveActiveDocument(): Promise<void>;

    /** Log a message to the platform's output channel */
    log(message: string): void;

    /** Set a context key for conditional UI (e.g., menu visibility) */
    setContext(key: string, value: boolean): void;

    /** Get a configuration value */
    getConfig<T>(section: string, defaultValue: T): T;

    /** Register a disposable resource */
    registerDisposable(disposable: { dispose(): void }): void;
}

// ═══════════════════════════════════════════════════════════════════
//  VS Code Adapter Implementation
// ═══════════════════════════════════════════════════════════════════

let vscode: typeof import('vscode') | null = null;

/** Lazy-load vscode module (only in VS Code runtime) */
function getVSCode(): typeof import('vscode') {
    if (!vscode) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        vscode = require('vscode');
    }
    return vscode!;
}

export class VSCodeAdapter implements IEditorAdapter {
    readonly platformId = 'vscode';

    getWorkspaceRoot(): string | null {
        const vs = getVSCode();
        const folders = vs.workspace.workspaceFolders;
        return folders && folders.length > 0 ? folders[0].uri.fsPath : null;
    }

    getActiveFile(): FileSelection | null {
        const vs = getVSCode();
        const editor = vs.window.activeTextEditor;
        if (!editor) { return null; }
        return {
            path: editor.document.uri.fsPath,
            content: editor.document.getText(),
            language: editor.document.languageId,
        };
    }

    async showNotification(message: string, severity: NotificationSeverity, actions?: string[]): Promise<string | undefined> {
        const vs = getVSCode();
        const args: string[] = actions || [];
        switch (severity) {
            case 'info': return vs.window.showInformationMessage(message, ...args);
            case 'warning': return vs.window.showWarningMessage(message, ...args);
            case 'error': return vs.window.showErrorMessage(message, ...args);
        }
    }

    async withProgress<T>(title: string, task: (progress: ProgressReporter) => Promise<T>): Promise<T> {
        const vs = getVSCode();
        return vs.window.withProgress(
            { location: vs.ProgressLocation.Notification, title, cancellable: false },
            async (vsProgress) => {
                const reporter: ProgressReporter = {
                    report(message: string, increment?: number) {
                        vsProgress.report({ message, increment });
                    },
                };
                return task(reporter);
            },
        );
    }

    async openFile(filePath: string): Promise<void> {
        const vs = getVSCode();
        const doc = await vs.workspace.openTextDocument(vs.Uri.file(filePath));
        await vs.window.showTextDocument(doc);
    }

    async openVirtualDocument(content: string, language: string): Promise<void> {
        const vs = getVSCode();
        const doc = await vs.workspace.openTextDocument({ content, language });
        await vs.window.showTextDocument(doc);
    }

    async saveActiveDocument(): Promise<void> {
        const vs = getVSCode();
        const editor = vs.window.activeTextEditor;
        if (editor && editor.document.isDirty) {
            await editor.document.save();
        }
    }

    log(message: string): void {
        const vs = getVSCode();
        const channel = vs.window.createOutputChannel('VRE + Around');
        channel.appendLine(message);
    }

    setContext(key: string, value: boolean): void {
        const vs = getVSCode();
        vs.commands.executeCommand('setContext', key, value);
    }

    getConfig<T>(section: string, defaultValue: T): T {
        const vs = getVSCode();
        const config = vs.workspace.getConfiguration();
        return config.get<T>(section, defaultValue);
    }

    registerDisposable(disposable: { dispose(): void }): void {
        // In VS Code, disposables are managed by the extension context
        // This is a no-op here; the caller should push to context.subscriptions
        void disposable;
    }
}

// ═══════════════════════════════════════════════════════════════════
//  CLI Adapter (for headless/CI usage — future)
// ═══════════════════════════════════════════════════════════════════

export class CLIAdapter implements IEditorAdapter {
    readonly platformId = 'cli';
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    getWorkspaceRoot(): string { return this.workspaceRoot; }
    getActiveFile(): FileSelection | null { return null; }

    async showNotification(message: string, severity: NotificationSeverity): Promise<string | undefined> {
        const prefix = severity === 'error' ? '❌' : severity === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`${prefix} ${message}`); // eslint-disable-line no-console
        return undefined;
    }

    async withProgress<T>(_title: string, task: (progress: ProgressReporter) => Promise<T>): Promise<T> {
        return task({ report: (msg: string) => console.log(`  → ${msg}`) }); // eslint-disable-line no-console
    }

    async openFile(): Promise<void> { /* no-op in CLI */ }
    async openVirtualDocument(content: string): Promise<void> { console.log(content); } // eslint-disable-line no-console
    async saveActiveDocument(): Promise<void> { /* no-op in CLI */ }
    log(message: string): void { console.log(message); } // eslint-disable-line no-console
    setContext(): void { /* no-op in CLI */ }
    getConfig<T>(_section: string, defaultValue: T): T { return defaultValue; }
    registerDisposable(): void { /* no-op */ }
}

// ═══════════════════════════════════════════════════════════════════
//  Adapter Registry — Select the right adapter at startup
// ═══════════════════════════════════════════════════════════════════

let activeAdapter: IEditorAdapter | null = null;

export function setAdapter(adapter: IEditorAdapter): void {
    activeAdapter = adapter;
}

export function getAdapter(): IEditorAdapter {
    if (!activeAdapter) {
        // Default to VS Code if no adapter is explicitly set
        activeAdapter = new VSCodeAdapter();
    }
    return activeAdapter;
}
