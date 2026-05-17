/**
 * ═══════════════════════════════════════════════════════════════════
 *  Dashboard Panel — Rich webview showing live system metrics
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Provides a rich webview panel inside VS Code that displays:
 *      - Live CPU, RAM, GPU, VRAM gauges with animations
 *      - Historical trend charts (last 60 samples)
 *      - Active alerts and leak warnings
 *      - Delta.X summary (dependency gap)
 *      - VRE container status
 *
 *  USED BY:
 *    - src/commands.ts  (vre.showDashboard command)
 *    - src/monitor/hardwareMonitor.ts  (sends sample updates)
 *
 *  COMMUNICATION:
 *    Uses postMessage to send metric updates from the extension
 *    to the webview. The webview renders updates in real-time
 *    using vanilla JS (no framework dependencies).
 * ═══════════════════════════════════════════════════════════════════
 */

import * as vscode from 'vscode';
import { MetricsSample } from '../monitor/metricsCollector';
import { DeltaReport } from '../migrate/deltaEngine';

export class DashboardPanel {
    public static currentPanel: DashboardPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposed = false;

    private constructor(panel: vscode.WebviewPanel) {
        this.panel = panel;

        this.panel.onDidDispose(() => {
            this.disposed = true;
            DashboardPanel.currentPanel = undefined;
        });
    }

    /** Create or show the dashboard panel */
    static createOrShow(): DashboardPanel {
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
            return DashboardPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'vreDashboard',
            'VRE Dashboard',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel);
        DashboardPanel.currentPanel.panel.webview.html = getDashboardHtml();
        return DashboardPanel.currentPanel;
    }

    /** Send a metrics update to the webview */
    updateMetrics(sample: MetricsSample): void {
        if (this.disposed) { return; }
        this.panel.webview.postMessage({
            type: 'metrics',
            data: sample,
        });
    }

    /** Send delta report to the webview */
    updateDelta(delta: DeltaReport): void {
        if (this.disposed) { return; }
        this.panel.webview.postMessage({
            type: 'delta',
            data: delta,
        });
    }

    /** Send an alert to the webview */
    sendAlert(message: string, severity: string): void {
        if (this.disposed) { return; }
        this.panel.webview.postMessage({
            type: 'alert',
            data: { message, severity, timestamp: new Date().toISOString() },
        });
    }

    dispose(): void {
        this.panel.dispose();
    }
}

/** Generate the full dashboard HTML with embedded CSS and JS */
function getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VRE Dashboard</title>
    <style>
        :root {
            --bg-primary: #0d1117;
            --bg-secondary: #161b22;
            --bg-tertiary: #21262d;
            --border: #30363d;
            --text-primary: #e6edf3;
            --text-secondary: #8b949e;
            --text-muted: #6e7681;
            --accent-blue: #58a6ff;
            --accent-green: #3fb950;
            --accent-yellow: #d29922;
            --accent-red: #f85149;
            --accent-purple: #bc8cff;
            --gradient-blue: linear-gradient(135deg, #1a73e8, #58a6ff);
            --gradient-green: linear-gradient(135deg, #238636, #3fb950);
            --gradient-red: linear-gradient(135deg, #da3633, #f85149);
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            background: var(--bg-primary);
            color: var(--text-primary);
            font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
            padding: 20px;
            line-height: 1.5;
        }

        .header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--border);
        }

        .header h1 {
            font-size: 20px;
            font-weight: 600;
            background: var(--gradient-blue);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .header .badge {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 12px;
            background: var(--bg-tertiary);
            color: var(--text-secondary);
            border: 1px solid var(--border);
        }

        .header .badge.active {
            background: rgba(63, 185, 80, 0.15);
            color: var(--accent-green);
            border-color: rgba(63, 185, 80, 0.3);
        }

        /* ──── Gauge Cards ──── */
        .gauges {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }

        .gauge-card {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            position: relative;
            overflow: hidden;
        }

        .gauge-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--gradient-blue);
            opacity: 0.6;
        }

        .gauge-card.warn::before { background: var(--gradient-red); opacity: 0.8; }

        .gauge-label {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }

        .gauge-value {
            font-size: 32px;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
        }

        .gauge-sub {
            font-size: 13px;
            color: var(--text-muted);
            margin-top: 4px;
        }

        .gauge-bar {
            margin-top: 12px;
            height: 6px;
            background: var(--bg-tertiary);
            border-radius: 3px;
            overflow: hidden;
        }

        .gauge-bar-fill {
            height: 100%;
            border-radius: 3px;
            background: var(--accent-blue);
            transition: width 0.5s ease, background 0.3s ease;
        }

        .gauge-bar-fill.high { background: var(--accent-yellow); }
        .gauge-bar-fill.critical { background: var(--accent-red); }

        /* ──── History Chart ──── */
        .chart-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 24px;
        }

        .chart-section h2 {
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 16px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .chart-container {
            width: 100%;
            height: 120px;
            position: relative;
        }

        canvas { width: 100%; height: 100%; }

        .chart-legend {
            display: flex;
            gap: 16px;
            margin-top: 12px;
            font-size: 12px;
            color: var(--text-secondary);
        }

        .legend-item { display: flex; align-items: center; gap: 6px; }
        .legend-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
        }

        /* ──── Alerts ──── */
        .alerts-section {
            margin-bottom: 24px;
        }

        .alert-item {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-left: 3px solid var(--accent-yellow);
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 8px;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
            animation: slideIn 0.3s ease;
        }

        .alert-item.critical { border-left-color: var(--accent-red); }

        .alert-time {
            color: var(--text-muted);
            font-size: 11px;
            white-space: nowrap;
        }

        /* ──── Delta Summary ──── */
        .delta-section {
            background: var(--bg-secondary);
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 20px;
        }

        .delta-section h2 {
            font-size: 14px;
            color: var(--text-secondary);
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .delta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 12px;
        }

        .delta-stat {
            text-align: center;
            padding: 12px;
            border-radius: 8px;
            background: var(--bg-tertiary);
        }

        .delta-stat .number {
            font-size: 28px;
            font-weight: 700;
        }

        .delta-stat .label {
            font-size: 11px;
            color: var(--text-secondary);
            text-transform: uppercase;
        }

        .delta-stat.good .number { color: var(--accent-green); }
        .delta-stat.bad .number { color: var(--accent-red); }
        .delta-stat.warn .number { color: var(--accent-yellow); }

        /* ──── Processes ──── */
        .process-list {
            margin-top: 16px;
        }

        .process-item {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 12px;
            color: var(--text-secondary);
            border-bottom: 1px solid var(--bg-tertiary);
        }

        .process-item .name { color: var(--text-primary); }

        @keyframes slideIn {
            from { opacity: 0; transform: translateX(-10px); }
            to { opacity: 1; transform: translateX(0); }
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--text-muted);
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>⚡ VRE + Around</h1>
        <span class="badge" id="monitorBadge">Monitor: Idle</span>
    </div>

    <!-- Gauge Cards -->
    <div class="gauges">
        <div class="gauge-card" id="cpuCard">
            <div class="gauge-label">CPU Usage</div>
            <div class="gauge-value" id="cpuValue">--%</div>
            <div class="gauge-sub" id="cpuSub">Waiting for data...</div>
            <div class="gauge-bar"><div class="gauge-bar-fill" id="cpuBar" style="width:0%"></div></div>
        </div>
        <div class="gauge-card" id="ramCard">
            <div class="gauge-label">RAM Usage</div>
            <div class="gauge-value" id="ramValue">-- GB</div>
            <div class="gauge-sub" id="ramSub">-- / -- GB</div>
            <div class="gauge-bar"><div class="gauge-bar-fill" id="ramBar" style="width:0%"></div></div>
        </div>
        <div class="gauge-card" id="gpuCard">
            <div class="gauge-label">GPU Usage</div>
            <div class="gauge-value" id="gpuValue">N/A</div>
            <div class="gauge-sub" id="gpuSub">No GPU detected</div>
            <div class="gauge-bar"><div class="gauge-bar-fill" id="gpuBar" style="width:0%"></div></div>
        </div>
        <div class="gauge-card" id="vramCard">
            <div class="gauge-label">VRAM Usage</div>
            <div class="gauge-value" id="vramValue">N/A</div>
            <div class="gauge-sub" id="vramSub">--</div>
            <div class="gauge-bar"><div class="gauge-bar-fill" id="vramBar" style="width:0%"></div></div>
        </div>
    </div>

    <!-- History Chart -->
    <div class="chart-section">
        <h2>Resource History (Last 60 Samples)</h2>
        <div class="chart-container">
            <canvas id="historyChart"></canvas>
        </div>
        <div class="chart-legend">
            <div class="legend-item"><div class="legend-dot" style="background:#58a6ff"></div>CPU</div>
            <div class="legend-item"><div class="legend-dot" style="background:#3fb950"></div>RAM</div>
            <div class="legend-item"><div class="legend-dot" style="background:#bc8cff"></div>GPU</div>
            <div class="legend-item"><div class="legend-dot" style="background:#f85149"></div>VRAM</div>
        </div>
    </div>

    <!-- Alerts -->
    <div class="alerts-section" id="alertsSection" style="display:none">
        <div class="chart-section">
            <h2>⚠️ Active Alerts</h2>
            <div id="alertsList"></div>
        </div>
    </div>

    <!-- Delta Summary -->
    <div class="delta-section" id="deltaSection">
        <h2>📦 Dependency Delta</h2>
        <div class="delta-grid" id="deltaGrid">
            <div class="empty-state" style="grid-column: 1/-1">
                Run "VRE: Scan Dependencies" to see environment gap
            </div>
        </div>
    </div>

    <!-- Top Processes -->
    <div class="chart-section" style="margin-top:16px">
        <h2>Top Processes</h2>
        <div class="process-list" id="processList">
            <div class="empty-state">Waiting for monitor data...</div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // History data for chart
        const history = { cpu: [], ram: [], gpu: [], vram: [] };
        const MAX_HISTORY = 60;

        // Listen for messages from the extension
        window.addEventListener('message', event => {
            const msg = event.data;

            if (msg.type === 'metrics') {
                updateGauges(msg.data);
                updateHistory(msg.data);
                drawChart();
                updateProcessList(msg.data.topProcesses || []);

                document.getElementById('monitorBadge').textContent = 'Monitor: Active';
                document.getElementById('monitorBadge').classList.add('active');
            }

            if (msg.type === 'delta') {
                updateDelta(msg.data);
            }

            if (msg.type === 'alert') {
                addAlert(msg.data);
            }
        });

        function updateGauges(data) {
            // CPU
            setGauge('cpu', data.cpuPercent, '%', '');
            // RAM
            const ramPct = Math.round((data.ramUsedGb / data.ramTotalGb) * 100);
            document.getElementById('ramValue').textContent = data.ramUsedGb + ' GB';
            document.getElementById('ramSub').textContent = data.ramUsedGb + ' / ' + data.ramTotalGb + ' GB';
            setBar('ramBar', ramPct);
            if (ramPct > 85) document.getElementById('ramCard').classList.add('warn');
            else document.getElementById('ramCard').classList.remove('warn');
            // GPU
            if (data.gpuPercent !== null) {
                setGauge('gpu', data.gpuPercent, '%', '');
            }
            // VRAM
            if (data.vramUsedGb !== null && data.vramTotalGb !== null) {
                const vramPct = Math.round((data.vramUsedGb / data.vramTotalGb) * 100);
                document.getElementById('vramValue').textContent = data.vramUsedGb + ' GB';
                document.getElementById('vramSub').textContent = data.vramUsedGb + ' / ' + data.vramTotalGb + ' GB';
                setBar('vramBar', vramPct);
                if (vramPct > 90) document.getElementById('vramCard').classList.add('warn');
            }
        }

        function setGauge(id, value, suffix) {
            document.getElementById(id + 'Value').textContent = value + suffix;
            setBar(id + 'Bar', value);
        }

        function setBar(id, pct) {
            const bar = document.getElementById(id);
            bar.style.width = Math.min(pct, 100) + '%';
            bar.className = 'gauge-bar-fill';
            if (pct > 90) bar.classList.add('critical');
            else if (pct > 70) bar.classList.add('high');
        }

        function updateHistory(data) {
            history.cpu.push(data.cpuPercent);
            history.ram.push(Math.round((data.ramUsedGb / data.ramTotalGb) * 100));
            history.gpu.push(data.gpuPercent || 0);
            history.vram.push(
                data.vramUsedGb && data.vramTotalGb
                    ? Math.round((data.vramUsedGb / data.vramTotalGb) * 100)
                    : 0
            );
            // Trim
            for (const key of Object.keys(history)) {
                if (history[key].length > MAX_HISTORY) history[key].shift();
            }
        }

        function drawChart() {
            const canvas = document.getElementById('historyChart');
            const ctx = canvas.getContext('2d');
            const w = canvas.offsetWidth;
            const h = canvas.offsetHeight;
            canvas.width = w * 2; canvas.height = h * 2;
            ctx.scale(2, 2);

            ctx.clearRect(0, 0, w, h);

            // Grid
            ctx.strokeStyle = 'rgba(48, 54, 61, 0.5)';
            ctx.lineWidth = 1;
            for (let y = 0; y <= 100; y += 25) {
                const py = h - (y / 100) * h;
                ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
            }

            const colors = { cpu: '#58a6ff', ram: '#3fb950', gpu: '#bc8cff', vram: '#f85149' };
            for (const [key, color] of Object.entries(colors)) {
                const data = history[key];
                if (data.length < 2) continue;
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let i = 0; i < data.length; i++) {
                    const x = (i / (MAX_HISTORY - 1)) * w;
                    const y = h - (data[i] / 100) * h;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }
        }

        function updateDelta(delta) {
            const grid = document.getElementById('deltaGrid');
            grid.innerHTML = [
                '<div class="delta-stat good"><div class="number">' + delta.satisfied.length + '</div><div class="label">Satisfied</div></div>',
                '<div class="delta-stat bad"><div class="number">' + delta.missing.length + '</div><div class="label">Missing</div></div>',
                '<div class="delta-stat warn"><div class="number">' + delta.mismatched.length + '</div><div class="label">Mismatched</div></div>',
            ].join('');
        }

        function addAlert(data) {
            const section = document.getElementById('alertsSection');
            section.style.display = 'block';
            const list = document.getElementById('alertsList');
            const cls = data.severity === 'critical' ? 'alert-item critical' : 'alert-item';
            const html = '<div class="' + cls + '"><span class="alert-time">' +
                new Date(data.timestamp).toLocaleTimeString() +
                '</span>' + data.message + '</div>';
            list.insertAdjacentHTML('afterbegin', html);
            // Keep only last 10 alerts
            while (list.children.length > 10) list.removeChild(list.lastChild);
        }

        function updateProcessList(processes) {
            const list = document.getElementById('processList');
            if (!processes.length) return;
            list.innerHTML = processes.map(p =>
                '<div class="process-item"><span class="name">' + p.name +
                '</span><span>CPU: ' + p.cpu + '% | Mem: ' + p.memory + 'MB</span></div>'
            ).join('');
        }
    </script>
</body>
</html>`;
}
