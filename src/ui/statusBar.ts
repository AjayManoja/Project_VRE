import * as vscode from 'vscode';
import { Sample } from '../monitor/watcher';

export class StatusBar {
    private items: vscode.StatusBarItem[] = [];

    constructor() {
        const cpu = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 200);
        cpu.text = '$(pulse) VRE';
        cpu.tooltip = 'VRE + Around';
        cpu.show();
        this.items.push(cpu);
    }

    update(sample: Sample): void {
        const parts = [`CPU ${sample.cpuPercent}%`, `RAM ${sample.ramUsedGb}/${sample.ramTotalGb}GB`];
        if (sample.gpuPercent !== null) parts.push(`GPU ${sample.gpuPercent}%`);
        if (sample.vramUsedGb !== null) parts.push(`VRAM ${sample.vramUsedGb}/${sample.vramTotalGb}GB`);
        this.items[0].text = `$(pulse) ${parts.join(' | ')}`;
    }

    setMonitoring(on: boolean): void {
        this.items[0].text = on ? '$(pulse) Monitoring...' : '$(pulse) VRE';
    }

    dispose(): void { this.items.forEach(i => i.dispose()); }
}
