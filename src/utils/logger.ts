import * as vscode from 'vscode';

export enum Level { DEBUG, INFO, WARN, ERROR }

const NAMES: Record<Level, string> = {
    [Level.DEBUG]: 'DEBUG', [Level.INFO]: 'INFO',
    [Level.WARN]: 'WARN', [Level.ERROR]: 'ERROR',
};

export class Logger {
    private static inst: Logger | null = null;
    private ch: vscode.OutputChannel;
    private min: Level = Level.INFO;

    private constructor() {
        this.ch = vscode.window.createOutputChannel('VRE + Around');
        const cfg = vscode.workspace.getConfiguration('vre.logging');
        const map: Record<string, Level> = { debug: Level.DEBUG, info: Level.INFO, warn: Level.WARN, error: Level.ERROR };
        this.min = map[cfg.get<string>('level', 'info')] ?? Level.INFO;
    }

    static get(): Logger {
        if (!Logger.inst) Logger.inst = new Logger();
        return Logger.inst;
    }

    log(level: Level, src: string, msg: string): void {
        if (level < this.min) return;
        const ts = new Date().toISOString();
        this.ch.appendLine(`[${ts}] [${NAMES[level]}] [${src}] ${msg}`);
    }

    debug(src: string, msg: string): void { this.log(Level.DEBUG, src, msg); }
    info(src: string, msg: string): void { this.log(Level.INFO, src, msg); }
    warn(src: string, msg: string): void { this.log(Level.WARN, src, msg); }
    error(src: string, msg: string): void { this.log(Level.ERROR, src, msg); }
    show(): void { this.ch.show(true); }

    dispose(): void {
        this.ch.dispose();
        Logger.inst = null;
    }
}
