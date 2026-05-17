/**
 * Dashboard Panel — Production-grade webview with CSP + nonce security
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
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

    static createOrShow(): DashboardPanel {
        if (DashboardPanel.currentPanel) {
            DashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.Beside);
            return DashboardPanel.currentPanel;
        }

        const panel = vscode.window.createWebviewPanel(
            'vreDashboard',
            'VRE Dashboard',
            vscode.ViewColumn.Beside,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        DashboardPanel.currentPanel = new DashboardPanel(panel);
        DashboardPanel.currentPanel.render();
        return DashboardPanel.currentPanel;
    }

    private render(): void {
        const nonce = crypto.randomBytes(16).toString('hex');
        this.panel.webview.html = getDashboardHtml(nonce, this.panel.webview);
    }

    updateMetrics(sample: MetricsSample): void {
        if (this.disposed) { return; }
        this.panel.webview.postMessage({ type: 'metrics', data: sample });
    }

    updateDelta(delta: DeltaReport): void {
        if (this.disposed) { return; }
        this.panel.webview.postMessage({ type: 'delta', data: delta });
    }

    sendAlert(message: string, severity: string): void {
        if (this.disposed) { return; }
        // Sanitize message to prevent XSS
        const safeMsg = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        this.panel.webview.postMessage({
            type: 'alert',
            data: { message: safeMsg, severity, timestamp: new Date().toISOString() },
        });
    }

    dispose(): void { this.panel.dispose(); }
}

function getDashboardHtml(nonce: string, webview: vscode.Webview): string {
    const csp = `default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>VRE Dashboard</title>
<style nonce="${nonce}">
:root{--bg0:#0d1117;--bg1:#161b22;--bg2:#21262d;--bd:#30363d;--t1:#e6edf3;--t2:#8b949e;--t3:#6e7681;--blue:#58a6ff;--green:#3fb950;--yellow:#d29922;--red:#f85149;--purple:#bc8cff}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg0);color:var(--t1);font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;padding:20px;line-height:1.5}
.hdr{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--bd)}
.hdr h1{font-size:20px;font-weight:600;background:linear-gradient(135deg,#1a73e8,#58a6ff);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.badge{font-size:11px;padding:2px 8px;border-radius:12px;background:var(--bg2);color:var(--t2);border:1px solid var(--bd)}
.badge.active{background:rgba(63,185,80,.15);color:var(--green);border-color:rgba(63,185,80,.3)}
.gauges{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}
.gc{background:var(--bg1);border:1px solid var(--bd);border-radius:12px;padding:20px;position:relative;overflow:hidden;transition:box-shadow .3s}
.gc:hover{box-shadow:0 0 20px rgba(88,166,255,.08)}
.gc::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(135deg,#1a73e8,#58a6ff);opacity:.6;transition:opacity .3s}
.gc.warn::before{background:linear-gradient(135deg,#da3633,#f85149);opacity:.8}
.gl{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:var(--t2);margin-bottom:8px}
.gv{font-size:32px;font-weight:700;font-variant-numeric:tabular-nums;transition:color .3s}
.gs{font-size:13px;color:var(--t3);margin-top:4px}
.gb{margin-top:12px;height:6px;background:var(--bg2);border-radius:3px;overflow:hidden}
.gf{height:100%;border-radius:3px;background:var(--blue);transition:width .5s ease,background .3s}
.gf.high{background:var(--yellow)}.gf.crit{background:var(--red)}
.sec{background:var(--bg1);border:1px solid var(--bd);border-radius:12px;padding:20px;margin-bottom:24px}
.sec h2{font-size:14px;color:var(--t2);margin-bottom:16px;text-transform:uppercase;letter-spacing:1px}
.cc{width:100%;height:140px;position:relative}
canvas{width:100%;height:100%}
.lg{display:flex;gap:16px;margin-top:12px;font-size:12px;color:var(--t2)}
.li{display:flex;align-items:center;gap:6px}
.ld{width:8px;height:8px;border-radius:50%}
.ai{background:var(--bg1);border:1px solid var(--bd);border-left:3px solid var(--yellow);border-radius:8px;padding:12px 16px;margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:8px;animation:si .3s ease}
.ai.crit{border-left-color:var(--red)}
.at{color:var(--t3);font-size:11px;white-space:nowrap}
.dg{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
.ds{text-align:center;padding:12px;border-radius:8px;background:var(--bg2);transition:transform .2s}
.ds:hover{transform:scale(1.05)}
.ds .n{font-size:28px;font-weight:700}
.ds .l{font-size:11px;color:var(--t2);text-transform:uppercase}
.ds.good .n{color:var(--green)}.ds.bad .n{color:var(--red)}.ds.warn .n{color:var(--yellow)}
.pi{display:flex;justify-content:space-between;padding:8px 0;font-size:12px;color:var(--t2);border-bottom:1px solid var(--bg2)}
.pi .pn{color:var(--t1);font-weight:500}
.pi .pb{height:4px;flex:1;margin:0 12px;background:var(--bg2);border-radius:2px;overflow:hidden;align-self:center}
.pi .pf{height:100%;background:var(--blue);border-radius:2px;transition:width .5s}
.es{text-align:center;padding:40px;color:var(--t3);font-size:14px}
.ver{text-align:center;margin-top:24px;font-size:11px;color:var(--t3);padding-top:16px;border-top:1px solid var(--bg2)}
@keyframes si{from{opacity:0;transform:translateX(-10px)}to{opacity:1;transform:translateX(0)}}
</style>
</head>
<body>
<div class="hdr"><h1>⚡ VRE + Around</h1><span class="badge" id="mb">Monitor: Idle</span><span class="badge" id="vb">v1.0.0</span></div>
<div class="gauges">
<div class="gc" id="cc"><div class="gl">CPU Usage</div><div class="gv" id="cv">--%</div><div class="gs" id="cs">Waiting for data...</div><div class="gb"><div class="gf" id="cb" style="width:0%"></div></div></div>
<div class="gc" id="rc"><div class="gl">RAM Usage</div><div class="gv" id="rv">-- GB</div><div class="gs" id="rs">-- / -- GB</div><div class="gb"><div class="gf" id="rb" style="width:0%"></div></div></div>
<div class="gc" id="gc2"><div class="gl">GPU Usage</div><div class="gv" id="gv2">N/A</div><div class="gs" id="gs2">No GPU detected</div><div class="gb"><div class="gf" id="gb2" style="width:0%"></div></div></div>
<div class="gc" id="vc"><div class="gl">VRAM Usage</div><div class="gv" id="vv">N/A</div><div class="gs" id="vs">--</div><div class="gb"><div class="gf" id="vb2" style="width:0%"></div></div></div>
</div>
<div class="sec"><h2>Resource History (Last 60 Samples)</h2><div class="cc"><canvas id="hc"></canvas></div>
<div class="lg"><div class="li"><div class="ld" style="background:#58a6ff"></div>CPU</div><div class="li"><div class="ld" style="background:#3fb950"></div>RAM</div><div class="li"><div class="ld" style="background:#bc8cff"></div>GPU</div><div class="li"><div class="ld" style="background:#f85149"></div>VRAM</div></div></div>
<div id="as" style="display:none"><div class="sec"><h2>⚠️ Active Alerts</h2><div id="al"></div></div></div>
<div class="sec" id="dd"><h2>📦 Dependency Delta</h2><div class="dg" id="dg"><div class="es" style="grid-column:1/-1">Run "VRE: Scan Dependencies" to see environment gap</div></div></div>
<div class="sec"><h2>Top Processes</h2><div id="pl"><div class="es">Waiting for monitor data...</div></div></div>
<div class="ver">VRE + Around Extension — Environment-Aware AI Coding</div>

<script nonce="${nonce}">
(function(){
const api=acquireVsCodeApi();
const H={cpu:[],ram:[],gpu:[],vram:[]},MH=60;
function $(id){return document.getElementById(id)}
function bar(id,p){const b=$(id);if(!b)return;b.style.width=Math.min(p,100)+'%';b.className='gf';if(p>90)b.classList.add('crit');else if(p>70)b.classList.add('high')}
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML}

window.addEventListener('message',function(e){
const m=e.data;
if(m.type==='metrics'){
const d=m.data;
$('cv').textContent=d.cpuPercent+'%';bar('cb',d.cpuPercent);
if(d.cpuPercent>90)$('cc').classList.add('warn');else $('cc').classList.remove('warn');
$('rv').textContent=d.ramUsedGb+' GB';$('rs').textContent=d.ramUsedGb+' / '+d.ramTotalGb+' GB';
const rp=Math.round((d.ramUsedGb/d.ramTotalGb)*100);bar('rb',rp);
if(rp>85)$('rc').classList.add('warn');else $('rc').classList.remove('warn');
if(d.gpuPercent!==null){$('gv2').textContent=d.gpuPercent+'%';$('gs2').textContent='Active';bar('gb2',d.gpuPercent)}
if(d.vramUsedGb!==null&&d.vramTotalGb!==null){
$('vv').textContent=d.vramUsedGb+' GB';$('vs').textContent=d.vramUsedGb+' / '+d.vramTotalGb+' GB';
const vp=Math.round((d.vramUsedGb/d.vramTotalGb)*100);bar('vb2',vp);
if(vp>90)$('vc').classList.add('warn');else $('vc').classList.remove('warn');
}
H.cpu.push(d.cpuPercent);H.ram.push(rp);H.gpu.push(d.gpuPercent||0);
H.vram.push(d.vramUsedGb&&d.vramTotalGb?Math.round((d.vramUsedGb/d.vramTotalGb)*100):0);
for(const k of Object.keys(H)){if(H[k].length>MH)H[k].shift()}
drawChart();
if(d.topProcesses&&d.topProcesses.length){
$('pl').innerHTML=d.topProcesses.map(function(p){
const w=Math.min(p.cpu,100);
return '<div class="pi"><span class="pn">'+esc(p.name)+'</span><div class="pb"><div class="pf" style="width:'+w+'%"></div></div><span>CPU:'+p.cpu+'% | '+p.memory+'MB</span></div>';
}).join('');
}
$('mb').textContent='Monitor: Active';$('mb').classList.add('active');
}
if(m.type==='delta'){
const d=m.data;
$('dg').innerHTML='<div class="ds good"><div class="n">'+d.satisfied.length+'</div><div class="l">Satisfied</div></div>'
+'<div class="ds bad"><div class="n">'+d.missing.length+'</div><div class="l">Missing</div></div>'
+'<div class="ds warn"><div class="n">'+d.mismatched.length+'</div><div class="l">Mismatched</div></div>';
}
if(m.type==='alert'){
$('as').style.display='block';
const l=$('al'),cls=m.data.severity==='critical'?'ai crit':'ai';
const div=document.createElement('div');div.className=cls;
div.innerHTML='<span class="at">'+new Date(m.data.timestamp).toLocaleTimeString()+'</span>'+esc(m.data.message);
l.insertBefore(div,l.firstChild);
while(l.children.length>10)l.removeChild(l.lastChild);
}
});

function drawChart(){
const c=$('hc');if(!c)return;const ctx=c.getContext('2d');
const w=c.offsetWidth,h=c.offsetHeight;c.width=w*2;c.height=h*2;ctx.scale(2,2);
ctx.clearRect(0,0,w,h);
ctx.strokeStyle='rgba(48,54,61,.5)';ctx.lineWidth=1;
for(let y=0;y<=100;y+=25){const py=h-(y/100)*h;ctx.beginPath();ctx.moveTo(0,py);ctx.lineTo(w,py);ctx.stroke()}
const colors={cpu:'#58a6ff',ram:'#3fb950',gpu:'#bc8cff',vram:'#f85149'};
for(const[k,col]of Object.entries(colors)){
const d=H[k];if(d.length<2)continue;
ctx.strokeStyle=col;ctx.lineWidth=1.5;ctx.beginPath();
for(let i=0;i<d.length;i++){const x=(i/(MH-1))*w,y=h-(d[i]/100)*h;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}
ctx.stroke();
}
}
})();
</script>
</body>
</html>`;
}
