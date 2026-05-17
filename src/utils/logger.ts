/**
 * Production Logger — Log rotation, configurable levels, testable singleton
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    ALERT = 4,
}

const LEVEL_NAMES: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.INFO]: 'INFO',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR',
    [LogLevel.ALERT]: 'ALERT',
};

export interface LogEntry {
    timestamp: string;
    level: string;
    source: string;
    message: string;
    data?: Record<string, unknown>;
}

export class Logger {
    private static instance: Logger | null = null;
    private outputChannel: vscode.OutputChannel;
    private runtimeLogPath: string | null = null;
    private minLevel: LogLevel = LogLevel.INFO;
    private maxFileSizeBytes: number = 10 * 1024 * 1024; // 10MB default
    private writeBuffer: string[] = [];
    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('VRE + Around', { log: true });
        this.loadConfig();
    }

    static getInstance(): Logger {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }

    /** Reset singleton — ONLY for testing */
    static resetInstance(): void {
        if (Logger.instance) {
            Logger.instance.dispose();
            Logger.instance = null;
        }
    }

    /** Load log level from VS Code settings */
    private loadConfig(): void {
        const config = vscode.workspace.getConfiguration('vre.logging');
        const levelStr = config.get<string>('level', 'info').toLowerCase();
        const levelMap: Record<string, LogLevel> = {
            debug: LogLevel.DEBUG,
            info: LogLevel.INFO,
            warn: LogLevel.WARN,
            error: LogLevel.ERROR,
        };
        this.minLevel = levelMap[levelStr] ?? LogLevel.INFO;
        this.maxFileSizeBytes = (config.get<number>('maxFileSizeMb', 10)) * 1024 * 1024;
    }

    setWorkspaceRoot(root: string): void {
        const monitorDir = path.join(root, '.monitor');
        try {
            fs.mkdirSync(monitorDir, { recursive: true });
        } catch { /* directory may already exist */ }
        this.runtimeLogPath = path.join(monitorDir, 'runtime.log');
    }

    private shouldLog(level: LogLevel): boolean {
        return level >= this.minLevel;
    }

    private log(level: LogLevel, source: string, message: string, data?: Record<string, unknown>): void {
        if (!this.shouldLog(level)) { return; }

        const timestamp = new Date().toISOString();
        const levelName = LEVEL_NAMES[level];
        const prefix = level === LogLevel.ALERT ? '🚨 ' : level === LogLevel.ERROR ? '❌ ' : '';
        const line = `${prefix}[${timestamp}] [${levelName}] [${source}] ${message}`;

        this.outputChannel.appendLine(line);

        // Buffered disk writes
        if (this.runtimeLogPath) {
            const entry: LogEntry = { timestamp, level: levelName, source, message };
            if (data) { entry.data = data; }
            this.writeBuffer.push(JSON.stringify(entry));
            this.scheduleFlush();
        }
    }

    /** Batch disk writes for performance */
    private scheduleFlush(): void {
        if (this.flushTimer) { return; }
        this.flushTimer = setTimeout(() => {
            this.flush();
            this.flushTimer = null;
        }, 1000);
    }

    private flush(): void {
        if (!this.runtimeLogPath || this.writeBuffer.length === 0) { return; }
        try {
            // Log rotation check
            this.rotateIfNeeded();
            fs.appendFileSync(this.runtimeLogPath, this.writeBuffer.join('\n') + '\n');
        } catch {
            // Never crash the extension for logging failures
        }
        this.writeBuffer = [];
    }

    /** Rotate log file if it exceeds max size */
    private rotateIfNeeded(): void {
        if (!this.runtimeLogPath) { return; }
        try {
            const stat = fs.statSync(this.runtimeLogPath);
            if (stat.size > this.maxFileSizeBytes) {
                const rotatedPath = this.runtimeLogPath + '.1';
                // Keep only one rotated backup
                try { fs.unlinkSync(rotatedPath + '.old'); } catch { /* skip */ }
                try { fs.renameSync(rotatedPath, rotatedPath + '.old'); } catch { /* skip */ }
                fs.renameSync(this.runtimeLogPath, rotatedPath);
            }
        } catch {
            // File doesn't exist yet — fine
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
        vscode.window.showWarningMessage(`VRE Alert: ${message}`);
    }

    show(): void {
        this.outputChannel.show(true);
    }

    dispose(): void {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.flush(); // Final flush
        this.outputChannel.dispose();
        Logger.instance = null;
    }
}
