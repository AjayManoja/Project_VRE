/**
 * ═══════════════════════════════════════════════════════════════════
 *  Leak Detector — Detects memory leaks from sample history
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Analyzes a sliding window of MetricsSamples to detect:
 *      1. RAM leak: consistent upward drift in RAM usage
 *      2. VRAM leak: consistent upward drift in VRAM usage
 *      3. CPU saturation: sustained 100% CPU for extended periods
 *      4. VRAM ceiling: VRAM approaching configured alert threshold
 *
 *  ALGORITHM:
 *    Uses linear regression over the last N samples to compute
 *    the slope of RAM/VRAM usage. If the slope exceeds a threshold
 *    (configurable via vre.monitor.leakThresholdMb) and the R²
 *    value indicates a strong linear trend (not just noise), a
 *    leak warning is issued.
 *
 *  USED BY:
 *    - src/monitor/hardwareMonitor.ts  (after each sample collection)
 * ═══════════════════════════════════════════════════════════════════
 */

import { MetricsSample } from './metricsCollector';

export interface LeakAlert {
    type: 'ram_leak' | 'vram_leak' | 'cpu_saturation' | 'vram_ceiling' | 'process_spike';
    severity: 'warning' | 'critical';
    message: string;
    details: {
        growthRateMbPerInterval?: number;
        currentValue?: number;
        threshold?: number;
        rSquared?: number;
        processName?: string;
    };
}

/**
 * Simple linear regression: returns { slope, intercept, rSquared }.
 * slope is in units-per-sample (e.g., GB-per-sample-interval).
 */
function linearRegression(values: number[]): { slope: number; rSquared: number } {
    const n = values.length;
    if (n < 3) { return { slope: 0, rSquared: 0 }; }

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += values[i];
        sumXY += i * values[i];
        sumX2 += i * i;
        sumY2 += values[i] * values[i];
    }

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) { return { slope: 0, rSquared: 0 }; }

    const slope = (n * sumXY - sumX * sumY) / denom;

    // R² calculation
    const meanY = sumY / n;
    let ssTot = 0, ssRes = 0;
    for (let i = 0; i < n; i++) {
        const predicted = (slope * i) + (sumY / n - slope * sumX / n);
        ssTot += (values[i] - meanY) ** 2;
        ssRes += (values[i] - predicted) ** 2;
    }
    const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

    return { slope, rSquared };
}

/**
 * Analyze a history of metrics samples and detect anomalies.
 *
 * @param samples        - Recent metrics samples (at least 3 needed)
 * @param leakThresholdMb - RAM growth rate (MB/interval) to trigger warning
 * @param vramAlertPercent - VRAM usage percentage to trigger ceiling alert
 * @param intervalSeconds  - Polling interval in seconds
 */
export function detectAnomalies(
    samples: MetricsSample[],
    leakThresholdMb: number = 100,
    vramAlertPercent: number = 90,
    intervalSeconds: number = 5,
): LeakAlert[] {
    const alerts: LeakAlert[] = [];

    if (samples.length < 3) {
        return alerts; // Need at least 3 samples for trend analysis
    }

    // Use last 12 samples (1 minute at 5s interval) for trend analysis
    const window = samples.slice(-12);
    const latest = samples[samples.length - 1];

    // ──── RAM Leak Detection ────
    const ramValues = window.map(s => s.ramUsedGb);
    const ramRegression = linearRegression(ramValues);
    const ramGrowthMbPerInterval = ramRegression.slope * 1024; // GB to MB

    if (ramGrowthMbPerInterval > leakThresholdMb && ramRegression.rSquared > 0.7) {
        const growthPerMinute = ramGrowthMbPerInterval * (60 / intervalSeconds);
        alerts.push({
            type: 'ram_leak',
            severity: ramGrowthMbPerInterval > leakThresholdMb * 2 ? 'critical' : 'warning',
            message: `RAM growing at +${Math.round(growthPerMinute)}MB/min — possible memory leak detected`,
            details: {
                growthRateMbPerInterval: Math.round(ramGrowthMbPerInterval),
                currentValue: latest.ramUsedGb,
                rSquared: Math.round(ramRegression.rSquared * 100) / 100,
            },
        });
    }

    // ──── VRAM Leak Detection ────
    if (latest.vramUsedGb !== null && latest.vramTotalGb !== null) {
        const vramValues = window
            .filter(s => s.vramUsedGb !== null)
            .map(s => s.vramUsedGb as number);

        if (vramValues.length >= 3) {
            const vramRegression = linearRegression(vramValues);
            const vramGrowthMbPerInterval = vramRegression.slope * 1024;

            if (vramGrowthMbPerInterval > leakThresholdMb / 2 && vramRegression.rSquared > 0.7) {
                alerts.push({
                    type: 'vram_leak',
                    severity: 'warning',
                    message: `VRAM growing at +${Math.round(vramGrowthMbPerInterval * (60 / intervalSeconds))}MB/min — possible GPU memory leak`,
                    details: {
                        growthRateMbPerInterval: Math.round(vramGrowthMbPerInterval),
                        currentValue: latest.vramUsedGb,
                        rSquared: Math.round(vramRegression.rSquared * 100) / 100,
                    },
                });
            }
        }

        // ──── VRAM Ceiling Detection ────
        const vramPercent = (latest.vramUsedGb / latest.vramTotalGb) * 100;
        if (vramPercent >= vramAlertPercent) {
            alerts.push({
                type: 'vram_ceiling',
                severity: vramPercent >= 95 ? 'critical' : 'warning',
                message: `VRAM at ${Math.round(vramPercent)}% capacity (${latest.vramUsedGb}GB / ${latest.vramTotalGb}GB)`,
                details: {
                    currentValue: vramPercent,
                    threshold: vramAlertPercent,
                },
            });
        }
    }

    // ──── CPU Saturation Detection ────
    const recentCpu = window.slice(-6); // Last 30 seconds
    const avgCpu = recentCpu.reduce((sum, s) => sum + s.cpuPercent, 0) / recentCpu.length;
    if (avgCpu >= 95 && recentCpu.length >= 6) {
        alerts.push({
            type: 'cpu_saturation',
            severity: 'warning',
            message: `CPU pegged at ${Math.round(avgCpu)}% for ${recentCpu.length * intervalSeconds} seconds`,
            details: {
                currentValue: avgCpu,
                threshold: 95,
            },
        });
    }

    // ──── New High-CPU Process Detection ────
    if (samples.length >= 2) {
        const previous = samples[samples.length - 2];
        const prevNames = new Set(previous.topProcesses.map(p => p.name));
        for (const proc of latest.topProcesses) {
            if (!prevNames.has(proc.name) && proc.cpu > 50) {
                alerts.push({
                    type: 'process_spike',
                    severity: 'warning',
                    message: `New high-CPU process detected: "${proc.name}" using ${proc.cpu}% CPU`,
                    details: {
                        processName: proc.name,
                        currentValue: proc.cpu,
                    },
                });
            }
        }
    }

    return alerts;
}
