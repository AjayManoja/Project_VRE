/**
 * ═══════════════════════════════════════════════════════════════════
 *  Hardware Monitor — Main monitoring loop for .monitor layer
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Manages the lifecycle of the live hardware monitoring daemon:
 *      - Start/stop the polling loop
 *      - Collect metrics at each interval
 *      - Run leak detection on accumulated samples
 *      - Write to runtime.log
 *      - Emit events for UI updates
 *
 *  USED BY:
 *    - src/commands.ts          (vre.startMonitor / vre.stopMonitor)
 *    - src/ui/dashboardPanel.ts (subscribes to metric events)
 *    - src/ui/statusBar.ts      (shows live CPU/RAM in status bar)
 *
 *  LIFECYCLE:
 *    1. start() → begins polling at configured interval
 *    2. Each tick: collectMetrics() → detectAnomalies() → emit
 *    3. stop() → clears interval, writes final summary
 *
 *  EVENTS:
 *    Uses VS Code EventEmitter to push updates to subscribers.
 * ═══════════════════════════════════════════════════════════════════
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { collectMetrics, formatMetricsLine, resetCpuTracking, MetricsSample } from './metricsCollector';
import { detectAnomalies, LeakAlert } from './leakDetector';

const LOG_SOURCE = 'Monitor';

export interface MonitorEvent {
    type: 'sample' | 'alert' | 'started' | 'stopped';
    sample?: MetricsSample;
    alerts?: LeakAlert[];
}

export class HardwareMonitor {
    private isRunning = false;
    private intervalHandle: ReturnType<typeof setInterval> | null = null;
    private startTime: Date = new Date();
    private samples: MetricsSample[] = [];
    private workspaceRoot: string;

    /** Configuration */
    private intervalMs: number;
    private leakThresholdMb: number;
    private vramAlertPercent: number;

    /** VS Code event emitter for UI subscriptions */
    private _onMonitorEvent = new vscode.EventEmitter<MonitorEvent>();
    readonly onMonitorEvent = this._onMonitorEvent.event;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;

        // Read configuration from VS Code settings
        const config = vscode.workspace.getConfiguration('vre.monitor');
        this.intervalMs = (config.get<number>('intervalSeconds') || 5) * 1000;
        this.leakThresholdMb = config.get<number>('leakThresholdMb') || 100;
        this.vramAlertPercent = config.get<number>('vramAlertPercent') || 90;
    }

    /** Whether the monitor is currently running */
    get running(): boolean {
        return this.isRunning;
    }

    /** Get the collected samples history */
    get history(): readonly MetricsSample[] {
        return this.samples;
    }

    /** Get the latest sample, or null if none collected yet */
    get latest(): MetricsSample | null {
        return this.samples.length > 0 ? this.samples[this.samples.length - 1] : null;
    }

    /**
     * Start the hardware monitoring loop.
     * Collects samples at the configured interval and analyzes for anomalies.
     */
    start(): void {
        if (this.isRunning) {
            Logger.getInstance().warn(LOG_SOURCE, 'Monitor is already running');
            return;
        }

        const logger = Logger.getInstance();
        this.isRunning = true;
        this.startTime = new Date();
        this.samples = [];
        resetCpuTracking();

        logger.info(LOG_SOURCE, `═══ Hardware Monitor Started ═══ (interval: ${this.intervalMs / 1000}s)`);
        this._onMonitorEvent.fire({ type: 'started' });

        // Write header to runtime.log
        const monitorDir = path.join(this.workspaceRoot, '.monitor');
        fs.mkdirSync(monitorDir, { recursive: true });
        const logPath = path.join(monitorDir, 'runtime.log');
        fs.appendFileSync(logPath, `\n═══ Monitor Session Started: ${this.startTime.toISOString()} ═══\n`);

        // Start polling
        this.intervalHandle = setInterval(() => {
            this.tick();
        }, this.intervalMs);

        // Immediate first tick
        this.tick();
    }

    /** Single monitoring tick: collect → analyze → emit */
    private tick(): void {
        if (!this.isRunning) { return; }

        const logger = Logger.getInstance();

        try {
            // Collect metrics
            const sample = collectMetrics(this.startTime);
            this.samples.push(sample);

            // Keep only last 720 samples (1 hour at 5s interval) to limit memory
            if (this.samples.length > 720) {
                this.samples.shift();
            }

            // Format and log
            const line = formatMetricsLine(sample);
            logger.info(LOG_SOURCE, line);

            // Write to runtime.log on disk
            const logPath = path.join(this.workspaceRoot, '.monitor', 'runtime.log');
            try {
                fs.appendFileSync(logPath, line + '\n');
            } catch { /* skip disk write failures */ }

            // Fire sample event for UI
            this._onMonitorEvent.fire({ type: 'sample', sample });

            // Run anomaly detection
            const alerts = detectAnomalies(
                this.samples,
                this.leakThresholdMb,
                this.vramAlertPercent,
                this.intervalMs / 1000
            );

            if (alerts.length > 0) {
                for (const alert of alerts) {
                    const prefix = alert.severity === 'critical' ? '🚨' : '⚠️';
                    logger.alert(LOG_SOURCE, `${prefix} ${alert.message}`);

                    // Write alerts to runtime.log
                    try {
                        fs.appendFileSync(logPath, `${prefix}  ${line} — ${alert.message}\n`);
                    } catch { /* skip */ }
                }

                this._onMonitorEvent.fire({ type: 'alert', alerts });
            }
        } catch (err) {
            logger.error(LOG_SOURCE, `Monitoring tick failed: ${err}`);
        }
    }

    /** Stop the hardware monitoring loop */
    stop(): void {
        if (!this.isRunning) { return; }

        const logger = Logger.getInstance();
        this.isRunning = false;

        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = null;
        }

        // Write session summary
        const elapsed = Math.round((Date.now() - this.startTime.getTime()) / 1000);
        const summary = [
            `═══ Monitor Session Ended: ${new Date().toISOString()} ═══`,
            `  Duration: ${Math.floor(elapsed / 60)}m ${elapsed % 60}s`,
            `  Samples collected: ${this.samples.length}`,
        ];

        if (this.samples.length > 0) {
            const ramValues = this.samples.map(s => s.ramUsedGb);
            const cpuValues = this.samples.map(s => s.cpuPercent);
            summary.push(`  RAM range: ${Math.min(...ramValues).toFixed(1)}GB — ${Math.max(...ramValues).toFixed(1)}GB`);
            summary.push(`  CPU range: ${Math.min(...cpuValues)}% — ${Math.max(...cpuValues)}%`);
        }

        const summaryText = summary.join('\n');
        logger.info(LOG_SOURCE, summaryText);

        const logPath = path.join(this.workspaceRoot, '.monitor', 'runtime.log');
        try {
            fs.appendFileSync(logPath, summaryText + '\n\n');
        } catch { /* skip */ }

        this._onMonitorEvent.fire({ type: 'stopped' });
        logger.info(LOG_SOURCE, '═══ Hardware Monitor Stopped ═══');
    }

    /** Dispose resources */
    dispose(): void {
        this.stop();
        this._onMonitorEvent.dispose();
    }
}
