/**
 * ═══════════════════════════════════════════════════════════════════
 *  Status Bar — Shows live hardware metrics in the VS Code footer
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Creates status bar items that display real-time CPU, RAM, and
 *    GPU metrics at a glance. Clicking any item opens the full
 *    VRE dashboard.
 *
 *  ITEMS:
 *    [VRE ●]  [CPU: 42%]  [RAM: 8.2/16GB]  [GPU: 70% | VRAM: 5.8/8GB]
 *
 *  USED BY:
 *    - src/extension.ts  (created on activation)
 *    - src/monitor/hardwareMonitor.ts  (updated on each sample)
 * ═══════════════════════════════════════════════════════════════════
 */

import * as vscode from 'vscode';
import { MetricsSample } from '../monitor/metricsCollector';

export class VreStatusBar {
    private statusItem: vscode.StatusBarItem;
    private cpuItem: vscode.StatusBarItem;
    private ramItem: vscode.StatusBarItem;
    private gpuItem: vscode.StatusBarItem;

    constructor() {
        // Main VRE indicator
        this.statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusItem.text = '$(server-environment) VRE';
        this.statusItem.tooltip = 'VRE + Around — Click to open dashboard';
        this.statusItem.command = 'vre.showDashboard';
        this.statusItem.show();

        // CPU metric
        this.cpuItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
        this.cpuItem.text = '$(pulse) CPU: --';
        this.cpuItem.tooltip = 'CPU Usage';
        this.cpuItem.command = 'vre.showDashboard';

        // RAM metric
        this.ramItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
        this.ramItem.text = '$(database) RAM: --';
        this.ramItem.tooltip = 'RAM Usage';
        this.ramItem.command = 'vre.showDashboard';

        // GPU metric
        this.gpuItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
        this.gpuItem.text = '$(zap) GPU: --';
        this.gpuItem.tooltip = 'GPU / VRAM Usage';
        this.gpuItem.command = 'vre.showDashboard';
    }

    /** Update status bar with the latest metrics sample */
    update(sample: MetricsSample): void {
        // CPU
        this.cpuItem.text = `$(pulse) CPU: ${sample.cpuPercent}%`;
        this.cpuItem.backgroundColor = sample.cpuPercent > 90
            ? new vscode.ThemeColor('statusBarItem.errorBackground')
            : undefined;
        this.cpuItem.show();

        // RAM
        this.ramItem.text = `$(database) RAM: ${sample.ramUsedGb}/${sample.ramTotalGb}GB`;
        const ramPercent = (sample.ramUsedGb / sample.ramTotalGb) * 100;
        this.ramItem.backgroundColor = ramPercent > 85
            ? new vscode.ThemeColor('statusBarItem.warningBackground')
            : undefined;
        this.ramItem.show();

        // GPU (only show if GPU exists)
        if (sample.gpuPercent !== null) {
            let gpuText = `$(zap) GPU: ${sample.gpuPercent}%`;
            if (sample.vramUsedGb !== null && sample.vramTotalGb !== null) {
                gpuText += ` | VRAM: ${sample.vramUsedGb}/${sample.vramTotalGb}GB`;
            }
            this.gpuItem.text = gpuText;
            this.gpuItem.backgroundColor = sample.gpuPercent > 90
                ? new vscode.ThemeColor('statusBarItem.errorBackground')
                : undefined;
            this.gpuItem.show();
        } else {
            this.gpuItem.hide();
        }
    }

    /** Show the monitoring-active indicator */
    setMonitoring(active: boolean): void {
        if (active) {
            this.statusItem.text = '$(server-environment) VRE ●';
            this.statusItem.backgroundColor = new vscode.ThemeColor('statusBarItem.prominentBackground');
            this.statusItem.tooltip = 'VRE + Around — Monitoring Active';
        } else {
            this.statusItem.text = '$(server-environment) VRE';
            this.statusItem.backgroundColor = undefined;
            this.statusItem.tooltip = 'VRE + Around — Click to open dashboard';
            this.cpuItem.hide();
            this.ramItem.hide();
            this.gpuItem.hide();
        }
    }

    dispose(): void {
        this.statusItem.dispose();
        this.cpuItem.dispose();
        this.ramItem.dispose();
        this.gpuItem.dispose();
    }
}
