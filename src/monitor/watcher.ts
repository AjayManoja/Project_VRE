/**
 * Process Watchdog — monitors hardware while VRE is executing.
 * Tied to a specific execution, not just general system stats.
 */

import * as os from 'os';
import { EventEmitter } from 'events';
import { getCpuPercent, getGpuUsage } from '../utils/platform';
import { Logger } from '../utils/logger';

const LOG = 'Monitor';

export interface Sample {
    ts: string;
    cpuPercent: number;
    ramUsedGb: number;
    ramTotalGb: number;
    gpuPercent: number | null;
    vramUsedGb: number | null;
    vramTotalGb: number | null;
}

export interface LeakWarning {
    metric: string;
    trend: number[];
    ratePerSample: number;
}

export class Monitor extends EventEmitter {
    private timer: ReturnType<typeof setInterval> | null = null;
    private samples: Sample[] = [];
    private intervalMs: number;
    private log = Logger.get();
    running = false;

    constructor(intervalMs = 5000) {
        super();
        this.intervalMs = intervalMs;
    }

    start(): void {
        if (this.running) return;
        this.running = true;
        this.samples = [];
        this.log.info(LOG, `Monitor started (${this.intervalMs}ms interval)`);

        this.timer = setInterval(() => this.tick(), this.intervalMs);
        this.tick(); // immediate first sample
    }

    stop(): void {
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        this.running = false;
        this.log.info(LOG, `Monitor stopped (${this.samples.length} samples collected)`);
    }

    private tick(): void {
        const gpu = getGpuUsage();
        const sample: Sample = {
            ts: new Date().toISOString(),
            cpuPercent: getCpuPercent(),
            ramUsedGb: Math.round((os.totalmem() - os.freemem()) / (1024 ** 3) * 10) / 10,
            ramTotalGb: Math.round(os.totalmem() / (1024 ** 3) * 10) / 10,
            gpuPercent: gpu?.percent ?? null,
            vramUsedGb: gpu?.usedGb ?? null,
            vramTotalGb: gpu?.totalGb ?? null,
        };

        this.samples.push(sample);
        if (this.samples.length > 120) this.samples.shift(); // rolling window

        this.emit('sample', sample);

        // check for leaks
        if (this.samples.length >= 10) {
            this.checkLeak('RAM', this.samples.map(s => s.ramUsedGb));
            if (sample.vramUsedGb !== null) {
                this.checkLeak('VRAM', this.samples.map(s => s.vramUsedGb!).filter(v => v !== null));
            }
        }
    }

    private checkLeak(metric: string, values: number[]): void {
        // simple linear regression on last 30 samples
        const recent = values.slice(-30);
        const n = recent.length;
        if (n < 10) return;

        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        for (let i = 0; i < n; i++) {
            sumX += i; sumY += recent[i]; sumXY += i * recent[i]; sumX2 += i * i;
        }
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const rateGbPerSample = Math.round(slope * 1000) / 1000;

        // alert if growing more than 50MB per sample
        if (rateGbPerSample > 0.05) {
            const warning: LeakWarning = { metric, trend: recent.slice(-6), ratePerSample: rateGbPerSample };
            this.emit('leak', warning);
            this.log.warn(LOG, `${metric} leak detected: +${rateGbPerSample}GB/sample`);
        }
    }

    getHistory(): Sample[] { return [...this.samples]; }

    /** Get the last N samples for crash report context */
    getRecentTrend(n = 10): Sample[] { return this.samples.slice(-n); }

    dispose(): void { this.stop(); this.removeAllListeners(); }
}
