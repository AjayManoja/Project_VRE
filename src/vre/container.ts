/**
 * Soft Container — isolated execution with temporary dependency installation.
 *
 * Not Docker. Not a VM. A lightweight scope that:
 *   1. Reads delta.X to know what's missing
 *   2. Installs only missing packages into a temporary directory
 *   3. Runs the code with that directory on the path
 *   4. Cleans up after — system returns to original state
 *
 * For Python: uses pip install --target to a temp dir, sets PYTHONPATH
 * For Node: uses npm install --prefix to a temp dir, sets NODE_PATH
 */

import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Delta } from '../migrate/delta';
import { execAsync } from '../utils/platform';
import { Logger } from '../utils/logger';
import { classify, parsePython, parseNode, Classification, ParsedError } from './classifier';

const LOG = 'Container';

export interface ContainerResult {
    success: boolean;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
    error: {
        parsed: ParsedError;
        classification: Classification;
    } | null;
}

export class SoftContainer {
    private root: string;
    private tempDir: string;
    private installed: string[] = [];
    private log = Logger.get();

    constructor(root: string) {
        this.root = root;
        this.tempDir = path.join(root, '.VRE', '.container_tmp');
    }

    /**
     * Install missing deps from delta into the temp scope.
     * Returns list of what was installed.
     */
    async setup(delta: Delta): Promise<string[]> {
        const missing = delta.missing.filter(i => i.source === 'pip' || i.source === 'npm');
        if (missing.length === 0) {
            this.log.info(LOG, 'No missing deps to install');
            return [];
        }

        fs.mkdirSync(this.tempDir, { recursive: true });

        const pipMissing = missing.filter(i => i.source === 'pip');
        const npmMissing = missing.filter(i => i.source === 'npm');

        // install pip packages into temp dir
        if (pipMissing.length > 0) {
            const names = pipMissing.map(i => i.name);
            const cmd = `pip install --target "${this.tempDir}" ${names.join(' ')}`;
            this.log.info(LOG, `Installing pip: ${names.join(', ')}`);
            const result = await execAsync(cmd);
            if (result !== null) {
                this.installed.push(...names);
                this.log.info(LOG, 'pip install to container succeeded');
            } else {
                this.log.warn(LOG, 'pip install to container failed — running without them');
            }
        }

        // install npm packages into temp dir
        if (npmMissing.length > 0) {
            const names = npmMissing.map(i => i.name);
            const cmd = `npm install --prefix "${this.tempDir}" ${names.join(' ')}`;
            this.log.info(LOG, `Installing npm: ${names.join(', ')}`);
            const result = await execAsync(cmd);
            if (result !== null) {
                this.installed.push(...names);
            } else {
                this.log.warn(LOG, 'npm install to container failed');
            }
        }

        return this.installed;
    }

    /**
     * Run a script inside the container scope.
     */
    execute(proxyPath: string, lang: 'python' | 'node', timeoutMs: number): Promise<ContainerResult> {
        return new Promise(resolve => {
            const start = Date.now();
            let stdout = '', stderr = '';
            let timedOut = false;

            // build env with temp dir on path
            const env = { ...process.env };
            if (lang === 'python') {
                env.PYTHONIOENCODING = 'utf-8';
                if (fs.existsSync(this.tempDir)) {
                    env.PYTHONPATH = this.tempDir + (env.PYTHONPATH ? path.delimiter + env.PYTHONPATH : '');
                }
            }
            if (lang === 'node' && fs.existsSync(path.join(this.tempDir, 'node_modules'))) {
                env.NODE_PATH = path.join(this.tempDir, 'node_modules') + (env.NODE_PATH ? path.delimiter + env.NODE_PATH : '');
            }

            const cmd = lang === 'python' ? 'python' : 'node';
            const child: ChildProcess = spawn(cmd, [proxyPath], {
                cwd: this.root,
                env,
                stdio: ['pipe', 'pipe', 'pipe'],
            });

            const timer = setTimeout(() => {
                timedOut = true;
                child.kill('SIGTERM');
                this.log.warn(LOG, 'Execution timed out');
            }, timeoutMs);

            child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
            child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

            child.on('close', (code: number | null) => {
                clearTimeout(timer);
                const dur = Date.now() - start;

                let error: ContainerResult['error'] = null;
                if (code !== 0 && stderr.trim()) {
                    const parsed = lang === 'python' ? parsePython(stderr) : parseNode(stderr);
                    const classification = classify(stderr);
                    error = { parsed, classification };
                    this.log.error(LOG, `Category ${classification.category}: ${parsed.type}: ${parsed.message}`);
                }

                resolve({ success: code === 0, exitCode: code, stdout, stderr, durationMs: dur, timedOut, error });
            });

            child.on('error', (err: Error) => {
                clearTimeout(timer);
                resolve({
                    success: false, exitCode: -1, stdout, stderr: err.message,
                    durationMs: Date.now() - start, timedOut: false,
                    error: {
                        parsed: { type: 'SpawnError', message: err.message, file: proxyPath, line: null, func: null, stack: [] },
                        classification: { category: 2, note: 'Could not start the process — check runtime is installed' },
                    },
                });
            });
        });
    }

    /**
     * Clean up — remove temp directory, system returns to original state.
     */
    cleanup(): void {
        if (fs.existsSync(this.tempDir)) {
            try {
                fs.rmSync(this.tempDir, { recursive: true, force: true });
                this.log.info(LOG, `Cleaned up container (${this.installed.length} temp packages removed)`);
            } catch (err) {
                this.log.warn(LOG, `Cleanup failed: ${err}`);
            }
        }
        this.installed = [];
    }
}
