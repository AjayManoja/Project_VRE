/**
 * Delta Engine — compares project needs vs system state.
 * Produces delta.X (AI-readable) and env.setup (human-readable).
 */

import { Dependency } from './scanner';
import { SystemSnapshot } from './system';

export interface DeltaItem {
    name: string;
    required: string;
    installed: string | null;
    status: 'satisfied' | 'missing' | 'mismatch';
    source: string;
}

export interface Delta {
    generatedAt: string;
    satisfied: DeltaItem[];
    missing: DeltaItem[];
    mismatched: DeltaItem[];
}

function parseVer(v: string): [number, number, number] {
    const c = v.replace(/^[v=]/, '').trim();
    const p = c.split('.').map(Number);
    return [p[0] || 0, p[1] || 0, p[2] || 0];
}

function cmpVer(a: [number, number, number], b: [number, number, number]): number {
    for (let i = 0; i < 3; i++) { if (a[i] < b[i]) return -1; if (a[i] > b[i]) return 1; }
    return 0;
}

function satisfies(installed: string, spec: string): boolean {
    if (spec === '*' || !spec) return true;
    const iv = parseVer(installed);
    if (spec.includes(',')) return spec.split(',').every(s => satisfies(installed, s.trim()));
    if (spec.startsWith('==')) return cmpVer(iv, parseVer(spec.slice(2))) === 0;
    if (spec.startsWith('!=')) return cmpVer(iv, parseVer(spec.slice(2))) !== 0;
    if (spec.startsWith('>=')) return cmpVer(iv, parseVer(spec.slice(2))) >= 0;
    if (spec.startsWith('<=')) return cmpVer(iv, parseVer(spec.slice(2))) <= 0;
    if (spec.startsWith('>') && !spec.startsWith('>=')) return cmpVer(iv, parseVer(spec.slice(1))) > 0;
    if (spec.startsWith('<') && !spec.startsWith('<=')) return cmpVer(iv, parseVer(spec.slice(1))) < 0;
    if (spec.startsWith('^')) { const rv = parseVer(spec.slice(1)); return iv[0] === rv[0] && cmpVer(iv, rv) >= 0; }
    if (spec.startsWith('~')) { const rv = parseVer(spec.slice(1)); return iv[0] === rv[0] && iv[1] === rv[1] && cmpVer(iv, rv) >= 0; }
    if (/^\d/.test(spec)) return cmpVer(iv, parseVer(spec)) >= 0;
    return false;
}

export function computeDelta(deps: Dependency[], snap: SystemSnapshot): Delta {
    const pipMap = new Map<string, string>();
    const npmMap = new Map<string, string>();
    const rtMap = new Map<string, string | null>();

    for (const p of snap.packages) {
        if (p.source === 'pip') pipMap.set(p.name, p.version);
        else npmMap.set(p.name, p.version);
    }
    for (const r of snap.runtimes) rtMap.set(r.name, r.version);

    const satisfied: DeltaItem[] = [];
    const missing: DeltaItem[] = [];
    const mismatched: DeltaItem[] = [];

    for (const dep of deps) {
        let installed: string | null = null;

        if (rtMap.has(dep.name)) installed = rtMap.get(dep.name) || null;
        else if (dep.source === 'pip') installed = pipMap.get(dep.name) || null;
        else if (dep.source === 'npm') installed = npmMap.get(dep.name) || null;
        else if (dep.source === 'engines') {
            installed = rtMap.get(dep.name) || null;
        }

        const item: DeltaItem = { name: dep.name, required: dep.spec, installed, status: 'missing', source: dep.source };

        if (installed === null) { item.status = 'missing'; missing.push(item); }
        else if (satisfies(installed, dep.spec)) { item.status = 'satisfied'; satisfied.push(item); }
        else { item.status = 'mismatch'; mismatched.push(item); }
    }

    return { generatedAt: new Date().toISOString(), satisfied, missing, mismatched };
}

export function formatDeltaX(delta: Delta, snap: SystemSnapshot): string {
    const l: string[] = [];

    l.push('=== VRE delta.X — Environment Gap Report ===');
    l.push(`Generated: ${delta.generatedAt}`);
    l.push('');

    l.push('SYSTEM:');
    l.push(`  OS: ${snap.hardware.osVersion}`);
    l.push(`  CPU: ${snap.hardware.cpu} (${snap.hardware.cores} cores)`);
    l.push(`  RAM: ${snap.hardware.ramFreeGb}GB free / ${snap.hardware.ramTotalGb}GB total`);
    if (snap.hardware.gpu) {
        l.push(`  GPU: ${snap.hardware.gpu}`);
        l.push(`  VRAM: ${snap.hardware.vramFreeGb}GB free / ${snap.hardware.vramTotalGb}GB total`);
    } else { l.push('  GPU: None'); }

    const found = snap.runtimes.filter(r => r.found);
    if (found.length) {
        l.push('');
        l.push('RUNTIMES:');
        for (const r of found) l.push(`  ${r.name}: ${r.version || 'found'}`);
    }

    l.push('');

    if (delta.satisfied.length) {
        l.push('SATISFIED:');
        for (const i of delta.satisfied) l.push(`  ${i.name} ${i.installed} ✓ (needs ${i.required})`);
        l.push('');
    }

    if (delta.missing.length) {
        l.push('MISSING:');
        for (const i of delta.missing) l.push(`  ${i.name} ✗ not installed (needs ${i.required})`);
        l.push('');
    }

    if (delta.mismatched.length) {
        l.push('MISMATCH:');
        for (const i of delta.mismatched) l.push(`  ${i.name} ${i.installed} ✗ (needs ${i.required})`);
        l.push('');
    }

    if (delta.missing.length === 0 && delta.mismatched.length === 0) {
        l.push('ALL REQUIREMENTS SATISFIED.');
        l.push('');
    }

    l.push('INSTRUCTION TO AI:');
    l.push('  This is the exact state of the developer machine.');
    l.push('  Do not assume any package is installed unless listed above.');
    l.push(`  Target OS-specific commands for: ${snap.hardware.osVersion}`);
    l.push('=== END ===');

    return l.join('\n');
}
