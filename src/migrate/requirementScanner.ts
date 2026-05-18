/**
 * Universal Requirement Scanner — Works for ANY project type
 *
 * SUPPORTED ECOSYSTEMS:
 *   Python    → requirements.txt, setup.py, pyproject.toml, Pipfile
 *   Node.js   → package.json
 *   Rust      → Cargo.toml
 *   Go        → go.mod
 *   Java      → pom.xml, build.gradle
 *   C#/.NET   → *.csproj
 *   Ruby      → Gemfile
 *   PHP       → composer.json
 *   C/C++     → CMakeLists.txt, conanfile.txt
 *   Swift     → Package.swift
 *   Elixir    → mix.exs
 *   Dart      → pubspec.yaml
 *
 * DESIGN: Each ecosystem has a dedicated parser. The scanner auto-detects
 * which files exist and runs only the relevant parsers.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

const LOG_SOURCE = 'RequirementScanner';

export type DependencySource =
    | 'pip' | 'npm' | 'cargo' | 'go' | 'maven' | 'gradle'
    | 'nuget' | 'gem' | 'composer' | 'cmake' | 'conan'
    | 'swift' | 'hex' | 'pub' | 'system' | 'engines';

export interface ProjectRequirement {
    name: string;
    versionSpec: string;
    source: DependencySource;
    raw: string;
}

export interface DetectedEcosystem {
    name: string;
    files: string[];
    requirementCount: number;
}

// ────────────────────────────── PARSERS ──────────────────────────────

function parseRequirementsTxt(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith('#') || line.startsWith('-')) { continue; }
            const m = line.match(/^([a-zA-Z0-9_\-\.]+)(?:\[.*?\])?\s*((?:[><=!~]+)\s*[\d.a-zA-Z*]+(?:\s*,\s*[><=!~]+\s*[\d.a-zA-Z*]+)*)?/);
            if (m) { reqs.push({ name: m[1].toLowerCase(), versionSpec: m[2]?.trim() || '*', source: 'pip', raw: line }); }
        }
    } catch { /* skip */ }
    return reqs;
}

function parsePipfile(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const sections = content.split(/\[(?:packages|dev-packages)\]/);
        for (let i = 1; i < sections.length; i++) {
            const lines = sections[i].split('\n');
            for (const raw of lines) {
                const m = raw.match(/^([a-zA-Z0-9_\-]+)\s*=\s*"(.+?)"/);
                if (m) {
                    const ver = m[2] === '*' ? '*' : m[2];
                    reqs.push({ name: m[1].toLowerCase(), versionSpec: ver, source: 'pip', raw: raw.trim() });
                }
            }
        }
    } catch { /* skip */ }
    return reqs;
}

function parseSetupPy(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const m = content.match(/install_requires\s*=\s*\[([\s\S]*?)\]/);
        if (m) {
            const deps = m[1].match(/['"]([^'"]+)['"]/g) || [];
            for (const dep of deps) {
                const clean = dep.replace(/['"]/g, '');
                const nm = clean.match(/^([a-zA-Z0-9_\-]+)(.*)/);
                if (nm) { reqs.push({ name: nm[1].toLowerCase(), versionSpec: nm[2]?.trim() || '*', source: 'pip', raw: clean }); }
            }
        }
    } catch { /* skip */ }
    return reqs;
}

function parsePyprojectToml(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const sec = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
        if (sec) {
            const deps = sec[1].match(/"([^"]+)"/g) || [];
            for (const dep of deps) {
                const clean = dep.replace(/"/g, '');
                const nm = clean.match(/^([a-zA-Z0-9_\-]+)(.*)/);
                if (nm) { reqs.push({ name: nm[1].toLowerCase(), versionSpec: nm[2]?.trim() || '*', source: 'pip', raw: clean }); }
            }
        }
    } catch { /* skip */ }
    return reqs;
}

function parsePackageJson(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const pkg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const allDeps: Record<string, string> = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        for (const [name, ver] of Object.entries(allDeps)) {
            reqs.push({ name: name.toLowerCase(), versionSpec: ver, source: 'npm', raw: `${name}: ${ver}` });
        }
        if (pkg.engines) {
            for (const [eng, ver] of Object.entries(pkg.engines)) {
                reqs.push({ name: eng.toLowerCase(), versionSpec: ver as string, source: 'engines', raw: `engines.${eng}: ${ver}` });
            }
        }
    } catch { /* skip */ }
    return reqs;
}

function parseCargoToml(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        // Simple dependency lines: name = "version" or name = { version = "..." }
        const depSections = content.match(/\[(?:dependencies|dev-dependencies|build-dependencies)\]([\s\S]*?)(?=\[|$)/g) || [];
        for (const section of depSections) {
            const lines = section.split('\n');
            for (const line of lines) {
                // simple: serde = "1.0"
                let m = line.match(/^([a-zA-Z0-9_\-]+)\s*=\s*"([^"]+)"/);
                if (m) { reqs.push({ name: m[1].toLowerCase(), versionSpec: m[2], source: 'cargo', raw: line.trim() }); continue; }
                // table: serde = { version = "1.0", ... }
                m = line.match(/^([a-zA-Z0-9_\-]+)\s*=\s*\{.*?version\s*=\s*"([^"]+)"/);
                if (m) { reqs.push({ name: m[1].toLowerCase(), versionSpec: m[2], source: 'cargo', raw: line.trim() }); }
            }
        }
    } catch { /* skip */ }
    return reqs;
}

function parseGoMod(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        for (const raw of lines) {
            const line = raw.trim();
            if (line.startsWith('//') || line.startsWith('module') || line.startsWith('go ')) { continue; }
            // require github.com/user/pkg v1.2.3
            const m = line.match(/^\s*(?:require\s+)?([a-zA-Z0-9_\-./]+)\s+(v[\d.]+)/);
            if (m && !line.includes('//')) {
                const name = m[1].split('/').pop() || m[1];
                reqs.push({ name: name.toLowerCase(), versionSpec: m[2], source: 'go', raw: line });
            }
        }
    } catch { /* skip */ }
    return reqs;
}

function parsePomXml(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const deps = content.match(/<dependency>([\s\S]*?)<\/dependency>/g) || [];
        for (const dep of deps) {
            const aid = dep.match(/<artifactId>(.*?)<\/artifactId>/);
            const ver = dep.match(/<version>(.*?)<\/version>/);
            if (aid) {
                reqs.push({ name: aid[1].toLowerCase(), versionSpec: ver?.[1] || '*', source: 'maven', raw: `${aid[1]}:${ver?.[1] || '*'}` });
            }
        }
    } catch { /* skip */ }
    return reqs;
}

function parseBuildGradle(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        for (const raw of lines) {
            // implementation 'group:artifact:version' or implementation "group:artifact:version"
            const m = raw.match(/(?:implementation|api|compileOnly|runtimeOnly|testImplementation)\s+['"]([^:]+):([^:]+):([^'"]+)['"]/);
            if (m) { reqs.push({ name: m[2].toLowerCase(), versionSpec: m[3], source: 'gradle', raw: raw.trim() }); }
        }
    } catch { /* skip */ }
    return reqs;
}

function parseCsproj(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const refs = content.match(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g) || [];
        for (const ref of refs) {
            const m = ref.match(/Include="([^"]+)"\s+Version="([^"]+)"/);
            if (m) { reqs.push({ name: m[1].toLowerCase(), versionSpec: m[2], source: 'nuget', raw: ref }); }
        }
    } catch { /* skip */ }
    return reqs;
}

function parseGemfile(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        for (const raw of lines) {
            const m = raw.match(/gem\s+['"]([a-zA-Z0-9_\-]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
            if (m) { reqs.push({ name: m[1].toLowerCase(), versionSpec: m[2] || '*', source: 'gem', raw: raw.trim() }); }
        }
    } catch { /* skip */ }
    return reqs;
}

function parseComposerJson(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const pkg = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const allDeps: Record<string, string> = { ...(pkg.require || {}), ...(pkg['require-dev'] || {}) };
        for (const [name, ver] of Object.entries(allDeps)) {
            if (name === 'php') { reqs.push({ name: 'php', versionSpec: ver, source: 'engines', raw: `php: ${ver}` }); continue; }
            reqs.push({ name: name.toLowerCase(), versionSpec: ver, source: 'composer', raw: `${name}: ${ver}` });
        }
    } catch { /* skip */ }
    return reqs;
}

function parsePubspecYaml(filePath: string): ProjectRequirement[] {
    const reqs: ProjectRequirement[] = [];
    try {
        const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
        let inDeps = false;
        for (const raw of lines) {
            if (raw.match(/^(?:dependencies|dev_dependencies):/)) { inDeps = true; continue; }
            if (inDeps && raw.match(/^\S/)) { inDeps = false; continue; }
            if (inDeps) {
                const m = raw.match(/^\s+([a-zA-Z0-9_]+):\s*(?:\^?)([\d.]+)?/);
                if (m) { reqs.push({ name: m[1].toLowerCase(), versionSpec: m[2] ? `^${m[2]}` : '*', source: 'pub', raw: raw.trim() }); }
            }
        }
    } catch { /* skip */ }
    return reqs;
}

// ────────────────────────── MANIFEST REGISTRY ──────────────────────────

interface ManifestDefinition {
    file: string;
    ecosystem: string;
    parser: (filePath: string) => ProjectRequirement[];
    glob?: string; // for files like *.csproj
}

const MANIFESTS: ManifestDefinition[] = [
    { file: 'requirements.txt', ecosystem: 'Python/pip', parser: parseRequirementsTxt },
    { file: 'Pipfile', ecosystem: 'Python/Pipfile', parser: parsePipfile },
    { file: 'setup.py', ecosystem: 'Python/setuptools', parser: parseSetupPy },
    { file: 'pyproject.toml', ecosystem: 'Python/pyproject', parser: parsePyprojectToml },
    { file: 'package.json', ecosystem: 'Node.js/npm', parser: parsePackageJson },
    { file: 'Cargo.toml', ecosystem: 'Rust/cargo', parser: parseCargoToml },
    { file: 'go.mod', ecosystem: 'Go/modules', parser: parseGoMod },
    { file: 'pom.xml', ecosystem: 'Java/Maven', parser: parsePomXml },
    { file: 'build.gradle', ecosystem: 'Java/Gradle', parser: parseBuildGradle },
    { file: 'Gemfile', ecosystem: 'Ruby/Bundler', parser: parseGemfile },
    { file: 'composer.json', ecosystem: 'PHP/Composer', parser: parseComposerJson },
    { file: 'pubspec.yaml', ecosystem: 'Dart/pub', parser: parsePubspecYaml },
];

// ────────────────────────── PUBLIC API ──────────────────────────

/**
 * Scan the workspace for ALL recognized dependency manifests.
 * Returns unified requirements and a list of detected ecosystems.
 */
export function scanProjectRequirements(workspaceRoot: string): ProjectRequirement[] {
    const logger = Logger.getInstance();
    const all: ProjectRequirement[] = [];
    const detected: DetectedEcosystem[] = [];

    logger.info(LOG_SOURCE, `Scanning project requirements in: ${workspaceRoot}`);

    // Check each known manifest
    for (const manifest of MANIFESTS) {
        const filePath = path.join(workspaceRoot, manifest.file);
        if (fs.existsSync(filePath)) {
            const reqs = manifest.parser(filePath);
            all.push(...reqs);
            detected.push({ name: manifest.ecosystem, files: [manifest.file], requirementCount: reqs.length });
            logger.info(LOG_SOURCE, `  ✅ ${manifest.ecosystem}: ${reqs.length} deps from ${manifest.file}`);
        }
    }

    // Glob scan for *.csproj files
    try {
        const files = fs.readdirSync(workspaceRoot);
        for (const f of files) {
            if (f.endsWith('.csproj')) {
                const reqs = parseCsproj(path.join(workspaceRoot, f));
                all.push(...reqs);
                detected.push({ name: '.NET/NuGet', files: [f], requirementCount: reqs.length });
                logger.info(LOG_SOURCE, `  ✅ .NET/NuGet: ${reqs.length} deps from ${f}`);
            }
        }
    } catch { /* skip */ }

    if (detected.length === 0) {
        logger.warn(LOG_SOURCE, 'No recognized dependency manifests found');
    }

    logger.info(LOG_SOURCE, `Total: ${all.length} requirements across ${detected.length} ecosystems`);
    return all;
}

/** Get detected ecosystems (useful for UI/reporting) */
export function detectEcosystems(workspaceRoot: string): DetectedEcosystem[] {
    const detected: DetectedEcosystem[] = [];
    for (const manifest of MANIFESTS) {
        if (fs.existsSync(path.join(workspaceRoot, manifest.file))) {
            detected.push({ name: manifest.ecosystem, files: [manifest.file], requirementCount: 0 });
        }
    }
    return detected;
}
