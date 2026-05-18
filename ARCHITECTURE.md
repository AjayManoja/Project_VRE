# Architecture

How VRE is built, why, and how the pieces connect.

## The Pipeline

VRE is not three independent tools. It's a pipeline:

```
Project opens → .migrate scans silently → delta.X produced
                                              │
User presses Ctrl+Shift+R                     │
       │                                      │
       ▼                                      ▼
   .VRE reads delta.X ───────────────────> soft container
       │                                      │
       ├── installs missing deps (temporary) ──┤
       ├── translates resource params ─────────┤
       │                                      │
       ▼                                      ▼
   proxy code runs inside container     .monitor watches
       │                                      │
       ├── exit 0 → "logic clean"              │
       │                                      │
       ├── Cat 2 → "real bug, line X"          │
       │                                      │
       └── Cat 1 → "hardware limit"     leak detection
                                              │
                                              ▼
                                    AI-ready crash report
       │
       ▼
   container cleans up — system unchanged
```

## Layer 1: .migrate

Reads dependency manifests. Scans the system. Compares. Writes delta.X.

**Files:**
- `src/migrate/scanner.ts` — 12 ecosystem parsers (pip, npm, cargo, go, maven, gradle, nuget, gem, composer, pub, Pipfile, pyproject)
- `src/migrate/system.ts` — queries 26+ binaries, pip/npm package lists, hardware
- `src/migrate/delta.ts` — semver comparison, delta.X report formatting
- `src/migrate/installer.ts` — installs missing pip/npm packages with user permission
- `src/migrate/index.ts` — orchestrator (scan project → scan system → compute delta → write files)

**Key behavior:** Runs automatically on project open. No user action needed. delta.X is produced before the user does anything.

## Layer 2: .VRE

The execution engine. Translates code, sets up a soft container, runs the proxy, classifies errors.

**Files:**
- `src/vre/translator.ts` — regex-based parameter scaling (concurrency, memory, iteration, network)
- `src/vre/classifier.ts` — Category 1 (hardware) vs Category 2 (logic) pattern matching + stack trace parsing
- `src/vre/container.ts` — **the soft container**: pip install --target / npm install --prefix into temp dir, sets PYTHONPATH/NODE_PATH, runs child process, cleans up on exit
- `src/vre/index.ts` — orchestrator (read source → translate → setup container → execute → classify → report → cleanup)

**Soft container explained:**
- Python: `pip install --target .VRE/.container_tmp torch` puts packages in a temp dir. `PYTHONPATH` is set so the process sees them. After execution, the temp dir is deleted.
- Node: `npm install --prefix .VRE/.container_tmp express` same idea. `NODE_PATH` set. Cleaned up after.
- No Docker. No VM. Just PATH manipulation and temp directories.

**What gets translated:**

| Category | Examples | Max Proxy |
|----------|---------|-----------|
| Concurrency | workers, threads, pool_size, processes | 2-5 |
| Memory | batch_size, buffer_size, cache_size | 4-4096 |
| Iteration | epochs, max_steps, max_retries | 2-10 |
| Network | max_connections, backlog | 10-16 |

**What's never touched:** control flow, variables, types, math, function signatures, error handling, business logic, validation.

## Layer 3: .monitor

Watches hardware while code runs. Detects leaks. Can inform crash reports.

**Files:**
- `src/monitor/watcher.ts` — timer-based sampler (CPU, RAM, GPU, VRAM), linear regression leak detector, event emitter

**Leak detection:** Runs linear regression on the last 30 RAM/VRAM samples. If the slope exceeds 50MB/sample, fires a warning.

## UI

- `src/ui/statusbar.ts` — live CPU/RAM/GPU in the editor footer

## Commands

Five commands total. That's it.

| Command | What It Does |
|---------|-------------|
| `vre.scanDependencies` | Run .migrate manually (also runs on project open) |
| `vre.translateAndRun` | Full pipeline: translate → container → run → report |
| `vre.startMonitor` | Start hardware polling |
| `vre.stopMonitor` | Stop hardware polling |
| `vre.viewDelta` | Open delta.X in the editor |

## Security

The soft container runs child processes with modified environment variables (PYTHONPATH/NODE_PATH), not system-wide installs. Temp directories are cleaned up on every run. Nothing persists.

## Build

esbuild bundles everything into a single `out/extension.js`. TypeScript compiler is only for type checking.

```
src/
├── extension.ts        Entry point — auto-scan, command registration
├── commands.ts         5 command implementations
├── utils/
│   ├── logger.ts       Output channel logger
│   └── platform.ts     OS detection, shell commands, hardware info
├── migrate/
│   ├── scanner.ts      12 ecosystem parsers
│   ├── system.ts       System inventory
│   ├── delta.ts        Gap comparison + report
│   ├── installer.ts    Missing dep installer
│   └── index.ts        Orchestrator
├── vre/
│   ├── translator.ts   Parameter scaling
│   ├── classifier.ts   Error classification
│   ├── container.ts    Soft container
│   └── index.ts        Pipeline orchestrator
├── monitor/
│   └── watcher.ts      Hardware sampler + leak detector
└── ui/
    └── statusbar.ts    Live metrics display
```

13 files. Each one does one thing.
