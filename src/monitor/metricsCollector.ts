/**
 * ═══════════════════════════════════════════════════════════════════
 *  Metrics Collector — Gathers live hardware metrics
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Single-point collection of CPU, RAM, GPU, and VRAM metrics.
 *    Called by hardwareMonitor.ts at the configured polling interval.
 *    Returns a MetricsSample that is logged, displayed, and analyzed
 *    for anomalies.
 *
 *  USED BY:
 *    - src/monitor/hardwareMonitor.ts  (polling loop)
 *    - src/ui/dashboardPanel.ts        (display)
 *
 *  DESIGN DECISION:
 *    Each call is stateless — the collector does not remember previous
 *    samples. Trend analysis (leak detection) is handled separately
 *    by leakDetector.ts, which receives the sample history.
 * ═══════════════════════════════════════════════════════════════════
 */

import * as os from 'os';
import { getGpuMetrics, getTopProcesses } from '../utils/platform';

export interface MetricsSample {
    /** ISO timestamp of the sample */
    timestamp: string;
    /** Elapsed seconds since monitoring started */
    elapsedSeconds: number;
    /** CPU usage percentage across all cores */
    cpuPercent: number;
    /** RAM used in GB */
    ramUsedGb: number;
    /** Total RAM in GB */
    ramTotalGb: number;
    /** GPU utilization percentage (null if no GPU) */
    gpuPercent: number | null;
    /** VRAM used in GB (null if no GPU) */
    vramUsedGb: number | null;
    /** VRAM total in GB (null if no GPU) */
    vramTotalGb: number | null;
    /** Top CPU-consuming processes */
    topProcesses: Array<{ name: string; cpu: number; memory: number }>;
}

/** Tracks CPU timing between samples for delta calculation */
let lastCpuTimes: { idle: number; total: number } | null = null;

/**
 * Get CPU usage percentage by comparing with previous sample.
 * First call returns an estimate based on current instantaneous values.
 */
function getCpuPercent(): number {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
        const t = cpu.times;
        idle += t.idle;
        total += t.user + t.nice + t.sys + t.idle + t.irq;
    }

    if (lastCpuTimes) {
        const idleDelta = idle - lastCpuTimes.idle;
        const totalDelta = total - lastCpuTimes.total;
        lastCpuTimes = { idle, total };
        if (totalDelta === 0) { return 0; }
        return Math.round((1 - idleDelta / totalDelta) * 100);
    }

    lastCpuTimes = { idle, total };
    // Rough estimate for first sample
    return Math.round((1 - idle / total) * 100);
}

/**
 * Collect a single metrics sample.
 * @param startTime - Date when monitoring started (for elapsed calc)
 */
export function collectMetrics(startTime: Date): MetricsSample {
    const now = new Date();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    const gpu = getGpuMetrics();
    const topProcesses = getTopProcesses(5);

    return {
        timestamp: now.toISOString(),
        elapsedSeconds: Math.round((now.getTime() - startTime.getTime()) / 1000),
        cpuPercent: getCpuPercent(),
        ramUsedGb: Math.round(usedMem / (1024 ** 3) * 100) / 100,
        ramTotalGb: Math.round(totalMem / (1024 ** 3) * 100) / 100,
        gpuPercent: gpu ? gpu.utilizationPercent : null,
        vramUsedGb: gpu ? gpu.vramUsedGb : null,
        vramTotalGb: gpu ? gpu.vramTotalGb : null,
        topProcesses,
    };
}

/**
 * Format a MetricsSample as a single log line for runtime.log.
 *
 * Example output:
 *   [00:15] RAM: 3.7GB / 16GB  |  CPU: 42%  |  GPU: 70%  |  VRAM: 5.8GB / 8GB
 */
export function formatMetricsLine(sample: MetricsSample): string {
    const elapsed = formatElapsed(sample.elapsedSeconds);
    let line = `[${elapsed}] RAM: ${sample.ramUsedGb}GB / ${sample.ramTotalGb}GB  |  CPU: ${sample.cpuPercent}%`;

    if (sample.gpuPercent !== null) {
        line += `  |  GPU: ${sample.gpuPercent}%`;
    }
    if (sample.vramUsedGb !== null && sample.vramTotalGb !== null) {
        line += `  |  VRAM: ${sample.vramUsedGb}GB / ${sample.vramTotalGb}GB`;
    }

    return line;
}

/** Format seconds to MM:SS */
function formatElapsed(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

/** Reset CPU tracking state (call when monitor stops/restarts) */
export function resetCpuTracking(): void {
    lastCpuTimes = null;
}
