import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { runVRE } from '../vre/index';
import { runMigrate } from '../migrate/index';
import { Monitor } from '../monitor/watcher';
import { Logger } from '../utils/logger';

export class CLIServer {
    private server: http.Server;
    private log = Logger.get();
    private activated = false;
    
    constructor(private root: string, private monitor: Monitor | undefined) {
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
    }

    public start(): void {
        this.server.listen(0, '127.0.0.1', () => {
            const port = (this.server.address() as any).port;
            const vreDir = path.join(this.root, '.VRE');
            if (!fs.existsSync(vreDir)) {
                fs.mkdirSync(vreDir, { recursive: true });
            }
            fs.writeFileSync(path.join(vreDir, '.cli_port'), port.toString(), 'utf8');
            this.generateCliWrappers(vreDir);
        });
    }

    public dispose(): void {
        this.server.close();
    }

    private generateCliWrappers(vreDir: string): void {
        const binDir = path.join(vreDir, 'bin');
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }

        const cliJs = `
const http = require('http');
const fs = require('fs');
const path = require('path');
const portPath = path.join(__dirname, '..', '.cli_port');
if (!fs.existsSync(portPath)) {
    console.error('VRE CLI Error: Extension not running. Open VS Code.');
    process.exit(1);
}
const port = fs.readFileSync(portPath, 'utf8').trim();
const cmd = process.argv[2] || 'help';
const args = process.argv.slice(3);
const req = http.request(\`http://127.0.0.1:\${port}/\${cmd}\`, { method: 'POST' }, res => {
    res.pipe(process.stdout);
});
req.on('error', err => {
    console.error('VRE CLI Error: Could not connect to extension host. Is VS Code open?');
});
req.write(JSON.stringify({ cwd: process.cwd(), args }));
req.end();
        `.trim();

        const vreCmd = `@echo off\nnode "%~dp0cli.js" %*\nif "%1"=="activate" (\n    prompt [VRE ACTIVATED] $P$G\n)\nif "%1"=="execute" (\n    prompt [VRE ACTIVATED] $P$G\n)\nif "%1"=="deactivate" (\n    prompt $P$G\n)\nif "%1"=="stop" (\n    prompt $P$G\n)`;
        const vreSh = `#!/bin/bash\nnode "$(dirname "$0")/cli.js" "$@"`;
        const vrePs1 = `$argsList = @()\nforeach ($arg in $args) { $argsList += $arg }\nnode "$PSScriptRoot\\cli.js" $argsList\nif ($args[0] -eq "activate" -or $args[0] -eq "execute") {\n    function global:prompt {\n        "[VRE ACTIVATED] $($(Get-Location).Path) > "\n    }\n} elseif ($args[0] -eq "deactivate" -or $args[0] -eq "stop") {\n    if (Get-Command global:prompt -ErrorAction SilentlyContinue) {\n        Remove-Item Function:\\prompt -ErrorAction SilentlyContinue\n    }\n}`;

        fs.writeFileSync(path.join(binDir, 'cli.js'), cliJs, 'utf8');
        fs.writeFileSync(path.join(binDir, 'vre.cmd'), vreCmd, 'utf8');
        fs.writeFileSync(path.join(binDir, 'vre'), vreSh, { encoding: 'utf8', mode: 0o755 });
        fs.writeFileSync(path.join(binDir, 'vre.ps1'), vrePs1, 'utf8');
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body || '{}');
                const cmd = req.url?.replace('/', '');
                
                // Hook logger to response
                const originalListener = this.log.listener;
                this.log.listener = (msg) => {
                    res.write(msg);
                    if (originalListener) originalListener(msg);
                };

                try {
                    if (cmd === 'activate' || cmd === 'execute') {
                        this.activated = true;
                        const vreDir = path.join(this.root, '.VRE');
                        if (!fs.existsSync(vreDir)) {
                            fs.mkdirSync(vreDir, { recursive: true });
                        }
                        const configPath = path.join(vreDir, 'config.json');
                        if (!fs.existsSync(configPath)) {
                            fs.writeFileSync(configPath, JSON.stringify({ monitor: false }, null, 2), 'utf8');
                        }
                        // Trigger dependency scan automatically to align workspace
                        await runMigrate(this.root);

                        res.write(`[VRE ACTIVATED] ${this.root}\n`);
                        res.end();
                    } else if (cmd === 'deactivate' || cmd === 'stop') {
                        this.activated = false;
                        this.monitor?.stop();
                        res.write(`[VRE DEACTIVATED]\n`);
                        res.end();
                    } else {
                        if (!this.activated) {
                            res.write(`[VRE CLI] Error: Environment not active. Run 'vre activate' first.\n`);
                            res.end();
                            return;
                        }

                        if (cmd === 'run') {
                        const target = data.args[0] ? path.resolve(data.cwd, data.args[0]) : null;
                        if (!target || !fs.existsSync(target)) {
                            res.write(`[VRE CLI] Error: File not found: ${target || 'none specified'}\n`);
                        } else {
                            res.write(`[VRE CLI] Starting transparent VRE run for ${path.basename(target)}\n`);
                            
                            // Auto-trigger telemetry lifecycle logic
                            const configPath = path.join(this.root, '.VRE', 'config.json');
                            let autoMonitor = false;
                            if (fs.existsSync(configPath)) {
                                try {
                                    const conf = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                                    if (conf.monitor === true) autoMonitor = true;
                                } catch (e) {}
                            }
                            
                            if (autoMonitor) {
                                res.write(`[VRE CLI] Auto-monitor enabled via config. Starting telemetry...\n`);
                                this.monitor?.start();
                            }
                            
                            await runVRE(target, this.root);
                        }
                        res.end();
                    } else if (cmd === 'scan') {
                        res.write(`[VRE CLI] Triggering workspace .migrate scanner...\n`);
                        const result = await runMigrate(this.root);
                        res.write(`[VRE CLI] Scan complete. Satisfied: ${result.delta.satisfied.length}, Missing: ${result.delta.missing.length}\n`);
                        res.end();
                    } else if (cmd === 'monitor') {
                        res.write(`[VRE Monitoring] Active on: ${this.root}\n> Run your heavy model script now! Sampling CPU, RAM, GPU, VRAM...\n`);
                        this.monitor?.start();
                        
                        // Keep connection open and stream monitor events
                        const listener = (sample: any) => {
                            const vramInfo = sample.vramUsedGb !== null ? ` | GPU: ${sample.gpuPercent}% | VRAM: ${sample.vramUsedGb}GB/${sample.vramTotalGb}GB` : '';
                            res.write(`[Monitor] ${new Date().toLocaleTimeString()} - CPU: ${sample.cpuPercent}% | RAM: ${sample.ramUsedGb}GB/${sample.ramTotalGb}GB${vramInfo}\n`);
                        };
                        this.monitor?.on('sample', listener);
                        
                        req.on('close', () => {
                            this.monitor?.removeListener('sample', listener);
                            res.end();
                        });
                        // Don't close res immediately, let it stream
                        return;
                    } else {
                        res.write(`[VRE CLI] Unknown command. Use: activate, execute, deactivate, stop, run <file>, scan, monitor\n`);
                        res.end();
                    }
                }
                } finally {
                    // Restore original listener
                    if (cmd !== 'monitor') {
                        this.log.listener = originalListener;
                    }
                }
            } catch(e: any) {
                res.end(`[VRE CLI] Error: ${e.message}\n`);
            }
        });
    }
}
