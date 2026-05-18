/**
 * Project Scanner — reads dependency manifests from any ecosystem.
 * Supports: Python, Node, Rust, Go, Java, C#, Ruby, PHP, Dart.
 */

import * as fs from 'fs';
import * as path from 'path';

export type DepSource = 'pip' | 'npm' | 'cargo' | 'go' | 'maven' | 'gradle' | 'nuget' | 'gem' | 'composer' | 'pub' | 'engines';

export interface Dependency {
    name: string;
    spec: string;       // version specifier as-is (e.g. ">=1.9.0", "^2.0", "*")
    source: DepSource;
}

// ── parsers ──

function lines(fp: string): string[] {
    try { return fs.readFileSync(fp, 'utf-8').split('\n'); }
    catch { return []; }
}

function json(fp: string): Record<string, unknown> {
    try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); }
    catch { return {}; }
}

function parseRequirementsTxt(fp: string): Dependency[] {
    return lines(fp).reduce<Dependency[]>((acc, raw) => {
        const l = raw.trim();
        if (!l || l.startsWith('#') || l.startsWith('-')) return acc;
        const m = l.match(/^([a-zA-Z0-9_\-.]+)(?:\[.*?\])?\s*((?:[><=!~]+)\s*[\d.a-zA-Z*]+(?:\s*,\s*[><=!~]+\s*[\d.a-zA-Z*]+)*)?/);
        if (m) acc.push({ name: m[1].toLowerCase(), spec: m[2]?.trim() || '*', source: 'pip' });
        return acc;
    }, []);
}

function parsePipfile(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    const sections = fs.readFileSync(fp, 'utf-8').split(/\[(?:packages|dev-packages)\]/);
    for (let i = 1; i < sections.length; i++) {
        for (const raw of sections[i].split('\n')) {
            const m = raw.match(/^([a-zA-Z0-9_-]+)\s*=\s*"(.+?)"/);
            if (m) deps.push({ name: m[1].toLowerCase(), spec: m[2] === '*' ? '*' : m[2], source: 'pip' });
        }
    }
    return deps;
}

function parseSetupPy(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const c = fs.readFileSync(fp, 'utf-8');
        const m = c.match(/install_requires\s*=\s*\[([\s\S]*?)\]/);
        if (m) {
            for (const d of (m[1].match(/['"]([^'"]+)['"]/g) || [])) {
                const clean = d.replace(/['"]/g, '');
                const nm = clean.match(/^([a-zA-Z0-9_-]+)(.*)/);
                if (nm) deps.push({ name: nm[1].toLowerCase(), spec: nm[2]?.trim() || '*', source: 'pip' });
            }
        }
    } catch { /* skip */ }
    return deps;
}

function parsePyprojectToml(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const c = fs.readFileSync(fp, 'utf-8');
        const sec = c.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
        if (sec) {
            for (const d of (sec[1].match(/"([^"]+)"/g) || [])) {
                const clean = d.replace(/"/g, '');
                const nm = clean.match(/^([a-zA-Z0-9_-]+)(.*)/);
                if (nm) deps.push({ name: nm[1].toLowerCase(), spec: nm[2]?.trim() || '*', source: 'pip' });
            }
        }
    } catch { /* skip */ }
    return deps;
}

function parsePackageJson(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    const pkg = json(fp);
    const all: Record<string, string> = { ...((pkg.dependencies || {}) as Record<string, string>), ...((pkg.devDependencies || {}) as Record<string, string>) };
    for (const [n, v] of Object.entries(all)) deps.push({ name: n.toLowerCase(), spec: v, source: 'npm' });
    if (pkg.engines) {
        for (const [n, v] of Object.entries(pkg.engines as Record<string, string>)) deps.push({ name: n.toLowerCase(), spec: v, source: 'engines' });
    }
    return deps;
}

function parseCargoToml(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    const secs = fs.readFileSync(fp, 'utf-8').match(/\[(?:dependencies|dev-dependencies|build-dependencies)\]([\s\S]*?)(?=\[|$)/g) || [];
    for (const sec of secs) {
        for (const line of sec.split('\n')) {
            let m = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
            if (!m) m = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*\{.*?version\s*=\s*"([^"]+)"/);
            if (m) deps.push({ name: m[1].toLowerCase(), spec: m[2], source: 'cargo' });
        }
    }
    return deps;
}

function parseGoMod(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    for (const line of lines(fp)) {
        const l = line.trim();
        if (l.startsWith('//') || l.startsWith('module') || l.startsWith('go ')) continue;
        const m = l.match(/^\s*(?:require\s+)?([a-zA-Z0-9_\-./]+)\s+(v[\d.]+)/);
        if (m) deps.push({ name: (m[1].split('/').pop() || m[1]).toLowerCase(), spec: m[2], source: 'go' });
    }
    return deps;
}

function parsePomXml(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const c = fs.readFileSync(fp, 'utf-8');
        for (const d of (c.match(/<dependency>([\s\S]*?)<\/dependency>/g) || [])) {
            const aid = d.match(/<artifactId>(.*?)<\/artifactId>/);
            const ver = d.match(/<version>(.*?)<\/version>/);
            if (aid) deps.push({ name: aid[1].toLowerCase(), spec: ver?.[1] || '*', source: 'maven' });
        }
    } catch { /* skip */ }
    return deps;
}

function parseBuildGradle(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    for (const raw of lines(fp)) {
        const m = raw.match(/(?:implementation|api|compileOnly|testImplementation)\s+['"]([^:]+):([^:]+):([^'"]+)['"]/);
        if (m) deps.push({ name: m[2].toLowerCase(), spec: m[3], source: 'gradle' });
    }
    return deps;
}

function parseCsproj(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    try {
        const c = fs.readFileSync(fp, 'utf-8');
        for (const ref of (c.match(/<PackageReference\s+Include="([^"]+)"\s+Version="([^"]+)"/g) || [])) {
            const m = ref.match(/Include="([^"]+)"\s+Version="([^"]+)"/);
            if (m) deps.push({ name: m[1].toLowerCase(), spec: m[2], source: 'nuget' });
        }
    } catch { /* skip */ }
    return deps;
}

function parseGemfile(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    for (const raw of lines(fp)) {
        const m = raw.match(/gem\s+['"]([a-zA-Z0-9_-]+)['"]\s*(?:,\s*['"]([^'"]+)['"])?/);
        if (m) deps.push({ name: m[1].toLowerCase(), spec: m[2] || '*', source: 'gem' });
    }
    return deps;
}

function parseComposerJson(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    const pkg = json(fp);
    const all: Record<string, string> = { ...((pkg.require || {}) as Record<string, string>), ...((pkg['require-dev'] || {}) as Record<string, string>) };
    for (const [n, v] of Object.entries(all)) {
        deps.push({ name: n.toLowerCase(), spec: v, source: n === 'php' ? 'engines' : 'composer' });
    }
    return deps;
}

function parsePubspecYaml(fp: string): Dependency[] {
    const deps: Dependency[] = [];
    let inDeps = false;
    for (const raw of lines(fp)) {
        if (raw.match(/^(?:dependencies|dev_dependencies):/)) { inDeps = true; continue; }
        if (inDeps && raw.match(/^\S/)) { inDeps = false; continue; }
        if (inDeps) {
            const m = raw.match(/^\s+([a-zA-Z0-9_]+):\s*(?:\^?)([\d.]+)?/);
            if (m) deps.push({ name: m[1].toLowerCase(), spec: m[2] ? `^${m[2]}` : '*', source: 'pub' });
        }
    }
    return deps;
}

// ── registry ──

const MANIFESTS: Array<{ file: string; ecosystem: string; parse: (fp: string) => Dependency[] }> = [
    { file: 'requirements.txt', ecosystem: 'Python/pip', parse: parseRequirementsTxt },
    { file: 'Pipfile', ecosystem: 'Python/Pipfile', parse: parsePipfile },
    { file: 'setup.py', ecosystem: 'Python/setuptools', parse: parseSetupPy },
    { file: 'pyproject.toml', ecosystem: 'Python/pyproject', parse: parsePyprojectToml },
    { file: 'package.json', ecosystem: 'Node.js/npm', parse: parsePackageJson },
    { file: 'Cargo.toml', ecosystem: 'Rust/cargo', parse: parseCargoToml },
    { file: 'go.mod', ecosystem: 'Go/modules', parse: parseGoMod },
    { file: 'pom.xml', ecosystem: 'Java/Maven', parse: parsePomXml },
    { file: 'build.gradle', ecosystem: 'Java/Gradle', parse: parseBuildGradle },
    { file: 'Gemfile', ecosystem: 'Ruby/Bundler', parse: parseGemfile },
    { file: 'composer.json', ecosystem: 'PHP/Composer', parse: parseComposerJson },
    { file: 'pubspec.yaml', ecosystem: 'Dart/pub', parse: parsePubspecYaml },
];

// ── dynamic import scanner ──

const PY_BUILTINS = new Set([
    'os', 'sys', 'time', 'math', 'json', 're', 'urllib', 'hashlib', 'hmac', 'uuid',
    'datetime', 'collections', 'itertools', 'functools', 'operator', 'pathlib',
    'shutil', 'tempfile', 'glob', 'fnmatch', 'io', 'argparse', 'logging', 'threading',
    'multiprocessing', 'queue', 'subprocess', 'select', 'socket', 'ssl', 'asyncio',
    'email', 'xml', 'csv', 'configparser', 'sqlite3', 'zlib', 'gzip', 'tarfile',
    'zipfile', 'codecs', 'copy', 'pprint', 'enum', 'typing', 'contextlib', 'unittest',
    'mock', 'pdb', 'profile', 'pstats', 'timeit', 'trace', 'warnings', 'weakref',
    'inspect', 'ast', 'dis', 'gc', 'sysconfig', 'platform', 'random', 'abc', 'statistics',
    'fractions', 'decimal', 'numbers', 'bisect', 'heapq', 'array', 'sched'
]);

const JS_BUILTINS = new Set([
    'fs', 'path', 'child_process', 'os', 'crypto', 'http', 'https', 'url', 'querystring',
    'util', 'events', 'stream', 'buffer', 'assert', 'dns', 'net', 'tls', 'zlib', 'readline',
    'vm', 'perf_hooks', 'worker_threads', 'process', 'constants', 'timers', 'module'
]);

const PY_PACKAGE_MAPPING: Record<string, string> = {
    sklearn: 'scikit-learn',
    PIL: 'Pillow',
    yaml: 'pyyaml',
    cv2: 'opencv-python',
    mpl_toolkits: 'matplotlib',
    matplotlib: 'matplotlib',
    numpy: 'numpy',
    pandas: 'pandas',
    torch: 'torch',
    torchvision: 'torchvision',
    torchaudio: 'torchaudio',
    transformers: 'transformers',
    scipy: 'scipy',
    seaborn: 'seaborn',
    flask: 'flask',
    django: 'django',
    fastapi: 'fastapi',
    uvicorn: 'uvicorn',
    redis: 'redis',
    psycopg2: 'psycopg2-binary',
    requests: 'requests'
};

function getImports(fp: string, ext: string): string[] {
    const imports: string[] = [];
    try {
        const c = fs.readFileSync(fp, 'utf-8');
        const lines = c.split('\n');
        if (ext === '.py') {
            for (const line of lines) {
                const l = line.trim();
                if (l.startsWith('#')) continue;
                
                // import x, y
                const m1 = l.match(/^\s*import\s+([a-zA-Z0-9_, ]+)/);
                if (m1) {
                    const parts = m1[1].split(',').map(p => p.trim().split(' ')[0].split('.')[0]);
                    for (const p of parts) {
                        if (p && !PY_BUILTINS.has(p)) {
                            imports.push(PY_PACKAGE_MAPPING[p] || p);
                        }
                    }
                }
                
                // from x import y
                const m2 = l.match(/^\s*from\s+([a-zA-Z0-9_.]+)\s+import/);
                if (m2) {
                    const p = m2[1].split('.')[0];
                    if (p && !PY_BUILTINS.has(p)) {
                        imports.push(PY_PACKAGE_MAPPING[p] || p);
                    }
                }
            }
        } else if (ext === '.js' || ext === '.ts') {
            for (const line of lines) {
                const l = line.trim();
                if (l.startsWith('//') || l.startsWith('/*')) continue;

                // import x from 'y'
                const m1 = l.match(/^\s*import\s+.*?\s+from\s+['"]([^'"]+)['"]/);
                if (m1) {
                    const p = m1[1].startsWith('@') ? m1[1].split('/').slice(0, 2).join('/') : m1[1].split('/')[0];
                    if (p && !p.startsWith('.') && !JS_BUILTINS.has(p)) imports.push(p);
                }

                // require('y')
                const m2 = l.match(/require\(['"]([^'"]+)['"]\)/);
                if (m2) {
                    const p = m2[1].startsWith('@') ? m2[1].split('/').slice(0, 2).join('/') : m2[1].split('/')[0];
                    if (p && !p.startsWith('.') && !JS_BUILTINS.has(p)) imports.push(p);
                }
            }
        }
    } catch { /* skip */ }
    return Array.from(new Set(imports));
}

function findCodeFiles(dir: string, depth = 0): string[] {
    if (depth > 3) return [];
    const files: string[] = [];
    const skip = new Set(['.git', '.VRE', '.migrate', 'node_modules', 'venv', '.venv', 'env', '.env', 'dist', 'build', '__pycache__', 'out']);
    try {
        for (const f of fs.readdirSync(dir)) {
            if (skip.has(f)) continue;
            const fp = path.join(dir, f);
            const stat = fs.statSync(fp);
            if (stat.isDirectory()) {
                files.push(...findCodeFiles(fp, depth + 1));
            } else if (stat.isFile()) {
                const ext = path.extname(f).toLowerCase();
                if (ext === '.py' || ext === '.js' || ext === '.ts') {
                    files.push(fp);
                }
            }
        }
    } catch { /* skip */ }
    return files.slice(0, 50);
}

// ── public ──

export function scanProject(root: string): { deps: Dependency[]; ecosystems: string[] } {
    const deps: Dependency[] = [];
    const ecosystems: string[] = [];

    // 1. Scan manifests
    for (const m of MANIFESTS) {
        const fp = path.join(root, m.file);
        if (fs.existsSync(fp)) {
            deps.push(...m.parse(fp));
            ecosystems.push(m.ecosystem);
        }
    }

    // glob for *.csproj
    try {
        for (const f of fs.readdirSync(root)) {
            if (f.endsWith('.csproj')) {
                deps.push(...parseCsproj(path.join(root, f)));
                ecosystems.push('.NET/NuGet');
            }
        }
    } catch { /* skip */ }

    // 2. Dynamic Import Scan to find undeclared imports
    const files = findCodeFiles(root);
    const imports: { name: string; ext: string }[] = [];
    for (const f of files) {
        const ext = path.extname(f).toLowerCase();
        const fileImports = getImports(f, ext);
        for (const imp of fileImports) {
            imports.push({ name: imp, ext });
        }
    }

    // Deduplicate imports
    const uniqueImports = Array.from(new Set(imports.map(i => `${i.name}:${i.ext}`))).map(s => {
        const [name, ext] = s.split(':');
        return { name, ext };
    });

    const hasManifest = deps.length > 0;
    const missingPythonImports: string[] = [];
    const missingNodeImports: string[] = [];

    for (const imp of uniqueImports) {
        const exists = deps.some(d => d.name.toLowerCase() === imp.name.toLowerCase());
        if (!exists) {
            const source = imp.ext === '.py' ? 'pip' : 'npm';
            deps.push({
                name: imp.name.toLowerCase(),
                spec: 'Undeclared (Missing from manifest!)',
                source
            });
            if (imp.ext === '.py') missingPythonImports.push(imp.name);
            else missingNodeImports.push(imp.name);
        }
    }

    // 3. Auto-generation of missing manifests
    if (!hasManifest) {
        if (missingPythonImports.length > 0) {
            try {
                fs.writeFileSync(path.join(root, 'requirements.txt'), missingPythonImports.join('\n') + '\n', 'utf-8');
                ecosystems.push('Python/pip (Auto-Generated)');
            } catch { /* skip */ }
        } else if (missingNodeImports.length > 0) {
            try {
                const pkg = {
                    name: path.basename(root).toLowerCase().replace(/[^a-z0-9_-]/g, ''),
                    version: '1.0.0',
                    dependencies: missingNodeImports.reduce<Record<string, string>>((acc, name) => {
                        acc[name] = '*';
                        return acc;
                    }, {})
                };
                fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
                ecosystems.push('Node.js/npm (Auto-Generated)');
            } catch { /* skip */ }
        }
    } else {
        // Append missing imports to existing manifest if it is requirements.txt
        const reqFp = path.join(root, 'requirements.txt');
        if (fs.existsSync(reqFp) && missingPythonImports.length > 0) {
            try {
                const content = fs.readFileSync(reqFp, 'utf-8');
                const ending = content.endsWith('\n') ? '' : '\n';
                fs.appendFileSync(reqFp, ending + missingPythonImports.join('\n') + '\n', 'utf-8');
            } catch { /* skip */ }
        }
    }

    return { deps, ecosystems };
}
