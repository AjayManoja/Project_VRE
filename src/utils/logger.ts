/**
 * ═══════════════════════════════════════════════════════════════════
 *  VRE Logger — Centralized logging for the entire extension
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Provides a single OutputChannel in the VS Code panel for all
 *    VRE subsystems (.monitor, .VRE, .migrate) to log through.
 *    Supports severity levels and structured JSON log entries
 *    that are also written to .monitor/runtime.log on disk.
 *
 *  USED BY:
 *    - src/monitor/hardwareMonitor.ts  (runtime metrics)
 *    - src/migrate/index.ts           (scan results)
 *    - src/vre/index.ts               (container lifecycle)
 *    - src/extension.ts               (activation/deactivation)
 *
 *  DESIGN DECISION:
 *    Uses a singleton pattern so any module can call
 *    `Logger.info(...)` without passing channel references around.
 * ═══════════════════════════════════════════════════════════════════
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR',
    ALERT = 'ALERT',
}

/** Structured log entry written to runtime.log */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    source: string;
    message: string;
    data?: Record<string, unknown>;
}

export class Logger {
    private static instance: Logger;
    private outputChannel: vscode.OutputChannel;
    private runtimeLogPath: string | null = null;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('VRE + Around');
    }

    /** Get or create the singleton Logger instance */
    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /**
     * Set the workspace root so runtime.log can be written
     * to .monitor/runtime.log inside the project.
     */
    setWorkspaceRoot(root: string): void {
        const monitorDir = path.join(root, '.monitor');
        if (!fs.existsSync(monitorDir)) {
            fs.mkdirSync(monitorDir, { recursive: true });
        }
        this.runtimeLogPath = path.join(monitorDir, 'runtime.log');
    }

    /** Format a timestamp for log entries */
    private getTimestamp(): string {
        return new Date().toISOString();
    }

    /** Write a log entry to the VS Code output channel and optionally to disk */
    private log(level: LogLevel, source: string, message: string, data?: Record<string, unknown>): void {
        const timestamp = this.getTimestamp();
        const prefix = level === LogLevel.ALERT ? '⚠️ ' : '';
        const line = `${prefix}[${timestamp}] [${level}] [${source}] ${message}`;

        this.outputChannel.appendLine(line);

        // Also write structured JSON to runtime.log on disk
        if (this.runtimeLogPath) {
            const entry: LogEntry = { timestamp, level, source, message };
            if (data) { entry.data = data; }
            try {
                fs.appendFileSync(this.runtimeLogPath, JSON.stringify(entry) + '\n');
            } catch {
                // Silently skip if disk write fails — never crash the extension for logging
            }
        }
    }

    debug(source: string, message: string, data?: Record<string, unknown>): void {
        this.log(LogLevel.DEBUG, source, message, data);
    }

    info(source: string, message: string, data?: Record<string, unknown>): void {
        this.log(LogLevel.INFO, source, message, data);
    }

    warn(source: string, message: string, data?: Record<string, unknown>): void {
        this.log(LogLevel.WARN, source, message, data);
    }

    error(source: string, message: string, data?: Record<string, unknown>): void {
        this.log(LogLevel.ERROR, source, message, data);
    }

    alert(source: string, message: string, data?: Record<string, unknown>): void {
        this.log(LogLevel.ALERT, source, message, data);
        // Alerts also surface as VS Code warning notifications
        vscode.window.showWarningMessage(`VRE Alert: ${message}`);
    }

    /** Show the output channel in the editor panel */
    show(): void {
        this.outputChannel.show(true);
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}
