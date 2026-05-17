# VRE + Around — Complete Project Guide

> **For LLMs & Developers**: This document is the single source of truth for understanding,
> modifying, and extending the VRE + Around VS Code extension. Every file, every function,
> every data flow is documented here. Read this before touching any code.

---

## Table of Contents

1. [What This Project Is](#1-what-this-project-is)
2. [Architecture Overview](#2-architecture-overview)
3. [File Map — Every File Explained](#3-file-map--every-file-explained)
4. [Data Flow — How Information Moves](#4-data-flow--how-information-moves)
5. [The Three Layers In Detail](#5-the-three-layers-in-detail)
6. [Commands Reference](#6-commands-reference)
7. [Configuration Reference](#7-configuration-reference)
8. [Key Algorithms](#8-key-algorithms)
9. [How to Modify — Common Tasks](#9-how-to-modify--common-tasks)
10. [Building & Running](#10-building--running)
11. [Generated Files Reference](#11-generated-files-reference)
12. [Error Classification System](#12-error-classification-system)
13. [Design Decisions & Tradeoffs](#13-design-decisions--tradeoffs)

---

## 1. What This Project Is

A **VS Code extension** that makes AI code editors aware of the developer's real hardware and target hardware. It has three jobs:

| Job | Layer | When | What It Prevents |
|-----|-------|------|------------------|
| Catch logic bugs before expensive remote compute | `.VRE` | Before code runs | Division by zero, index errors, shape mismatches reaching production |
| Smart dependency management | `.migrate` | On project open | Unnecessary installs, version conflicts, blind overwrites |
| Live hardware monitoring | `.monitor` | While code runs | Memory leaks, VRAM crashes, CPU saturation |

**The core insight**: Code written for a 24-core server with an RTX 4500 can be *translated* into a logically-equivalent proxy that runs on a 2-core laptop — catching all logic bugs without needing the real hardware.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VS Code Extension Host                        │
│                                                                      │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────────┐ │
│  │ extension│──▶│ commands │──▶│  layers  │──▶│   UI components  │ │
│  │   .ts    │   │   .ts    │   │          │   │                  │ │
│  └──────────┘   └──────────┘   │ migrate/ │   │ statusBar.ts     │ │
│       │                        │ monitor/ │   │ dashboardPanel.ts│ │
│       │                        │ vre/     │   │ treeDataProvider │ │
│       ▼                        └──────────┘   └──────────────────┘ │
│  ┌──────────┐                       │                              │
│  │  utils/  │◀──────────────────────┘                              │
│  │ logger   │                                                      │
│  │ platform │                                                      │
│  │ fileGen  │                                                      │
│  └──────────┘                                                      │
└─────────────────────────────────────────────────────────────────────┘
        │                              │                    │
        ▼                              ▼                    ▼
   .monitor/                        .VRE/               .migrate/
   runtime.log                  vre.config.json       delta.X
                                vre.translation.json  system.snapshot
                                vre.error.report.json requirements.scan
```

---

## 3. File Map — Every File Explained

### Root Files

| File | Purpose |
|------|---------|
| `package.json` | Extension manifest: commands, views, configuration, activation events |
| `tsconfig.json` | TypeScript config: ES2021 target, strict mode, commonjs output |
| `.vscodeignore` | Files excluded from extension packaging |
| `VRE_Around_AI_Code_Editor_Extension.md` | Original spec document (the "what") |
| `PROJECT_GUIDE.md` | This file — implementation guide (the "how") |

### Source Files (`src/`)

#### Entry Point & Commands

| File | Lines | Purpose | Key Exports |
|------|-------|---------|-------------|
| `src/extension.ts` | ~100 | Main entry point. Activation creates folder structure, UI, and registers commands. Deactivation cleans up. | `activate()`, `deactivate()` |
| `src/commands.ts` | ~170 | All 8 VS Code command implementations. Each command maps to a user action. | `registerCommands()` |

#### Utils (`src/utils/`)

| File | Lines | Purpose | Key Exports |
|------|-------|---------|-------------|
| `src/utils/logger.ts` | ~115 | Singleton logger → VS Code OutputChannel + disk (`runtime.log`). Supports DEBUG/INFO/WARN/ERROR/ALERT levels. | `Logger` class |
| `src/utils/platform.ts` | ~200 | OS-specific system introspection: hardware detection, pip/npm package listing, GPU metrics, process scanning. | `getSystemHardware()`, `getPipPackages()`, `getNpmPackages()`, `getGpuMetrics()`, `getTopProcesses()` |
| `src/utils/fileGenerator.ts` | ~130 | Creates `.monitor/`, `.VRE/`, `.migrate/` folders with default configs. Idempotent — never overwrites. | `initializeFolderStructure()`, `readVreConfig()` |

#### Migrate Layer (`src/migrate/`)

| File | Lines | Purpose | Key Exports |
|------|-------|---------|-------------|
| `src/migrate/requirementScanner.ts` | ~170 | Parses `requirements.txt`, `package.json`, `setup.py`, `pyproject.toml` into unified `ProjectRequirement[]`. | `scanProjectRequirements()` |
| `src/migrate/systemScanner.ts` | ~150 | Queries the host for runtimes, pip/npm packages, system binaries. Produces `SystemSnapshot`. | `scanSystem()`, `formatSnapshotText()` |
| `src/migrate/deltaEngine.ts` | ~280 | Compares requirements vs snapshot. Implements semver comparison. Produces `delta.X` and `env.setup`. | `computeDelta()`, `formatDeltaX()`, `formatEnvSetup()` |
| `src/migrate/index.ts` | ~80 | Orchestrator: scan project → scan system → compute delta → write files. | `runMigrateScan()` |

#### Monitor Layer (`src/monitor/`)

| File | Lines | Purpose | Key Exports |
|------|-------|---------|-------------|
| `src/monitor/metricsCollector.ts` | ~110 | Stateless single-sample collector. CPU (delta-based), RAM (`os` module), GPU (`nvidia-smi`), top processes. | `collectMetrics()`, `formatMetricsLine()` |
| `src/monitor/leakDetector.ts` | ~150 | Sliding-window anomaly detector. Linear regression for RAM/VRAM leak detection (R² > 0.7 threshold). | `detectAnomalies()` |
| `src/monitor/hardwareMonitor.ts` | ~170 | Main polling loop. Start/stop lifecycle. Emits `MonitorEvent`s for UI. Writes `runtime.log`. | `HardwareMonitor` class |

#### VRE Layer (`src/vre/`)

| File | Lines | Purpose | Key Exports |
|------|-------|---------|-------------|
| `src/vre/translationEngine.ts` | ~200 | Regex-based parameter detection. Scales batch_size, num_workers, num_threads, epochs to proxy values. Writes `vre.translation.json`. | `translateFile()` |
| `src/vre/proxyExecutor.ts` | ~230 | Spawns proxy as child process. Parses Python tracebacks and Node.js errors. Classifies as Category 1 (hardware) or Category 2 (logic). | `executeProxy()` |
| `src/vre/errorReporter.ts` | ~160 | Maps proxy crash lines back to original code. Generates `vre.error.report.json`. | `generateErrorReport()`, `formatErrorReportText()` |
| `src/vre/index.ts` | ~140 | Full lifecycle orchestrator: translate → execute → report → teardown. Human-in-the-loop confirmation. | `runVreLifecycle()` |

#### UI (`src/ui/`)

| File | Lines | Purpose | Key Exports |
|------|-------|---------|-------------|
| `src/ui/statusBar.ts` | ~100 | Live CPU/RAM/GPU in VS Code footer. Color-coded warnings (yellow > 70%, red > 90%). | `VreStatusBar` class |
| `src/ui/treeDataProvider.ts` | ~140 | Activity Bar sidebar tree. Shows .monitor, .VRE, .migrate folders and their files. Click to open. | `VreTreeDataProvider` class |
| `src/ui/dashboardPanel.ts` | ~400 | Webview dashboard: gauges, history chart (canvas), alerts feed, delta summary, process list. Dark theme. | `DashboardPanel` class |

---

## 4. Data Flow — How Information Moves

### Flow A: Dependency Scan (`.migrate`)

```
User runs "VRE: Scan Dependencies"
    │
    ▼
requirementScanner.ts
    │ Reads: requirements.txt, package.json, setup.py, pyproject.toml
    │ Outputs: ProjectRequirement[]
    ▼
systemScanner.ts
    │ Runs: pip list, npm list, nvidia-smi, python --version, node --version
    │ Outputs: SystemSnapshot
    ▼
deltaEngine.ts
    │ Compares: requirements vs snapshot
    │ Uses: semver comparison (>=, ==, ^, ~, etc.)
    │ Outputs: DeltaReport
    ▼
index.ts (migrate orchestrator)
    │ Writes:  .migrate/requirements.scan
    │          .migrate/system.snapshot
    │          .migrate/delta.X          ← LLM-friendly gap report
    │          .migrate/env.setup        ← Human-readable install plan
    │          .migrate/delta.json       ← Machine-readable JSON
    ▼
Dashboard receives DeltaReport via postMessage
Tree view refreshes
```

### Flow B: Translate & Run (`.VRE`)

```
User runs "VRE: Translate & Run" on active .py/.js file
    │
    ▼
translationEngine.ts
    │ Reads source code
    │ Applies regex rules to detect: batch_size, num_workers, etc.
    │ Substitutes with proxy-safe values (batch_size: 512 → 4)
    │ Writes: .VRE/proxy/proxy_<filename>
    │         .VRE/vre.translation.json
    ▼
proxyExecutor.ts
    │ Spawns: python proxy_file.py (or node proxy_file.js)
    │ Captures: stdout, stderr, exit code
    │ Timeout: max_runtime_minutes from vre.config.json
    │ Parses: Python tracebacks or Node.js error stacks
    │ Classifies: Category 1 (hardware) or Category 2 (logic)
    ▼
errorReporter.ts  (only if error occurred)
    │ Maps proxy line → original line (offset by header)
    │ Writes: .VRE/vre.error.report.json
    │ Opens error report in editor tab
    │ Shows notification: "Logic bug found — confirm to fix"
    ▼
index.ts (VRE orchestrator)
    │ If clean: writes vre.lock.json (marked logic-clean)
    │ Always: writes vre.release.log, resets vre.container.json
    ▼
Developer reviews error report → confirms → AI fixes ORIGINAL code
```

### Flow C: Live Monitoring (`.monitor`)

```
User runs "VRE: Start Monitor"
    │
    ▼
HardwareMonitor.start()
    │ Starts setInterval (default: every 5 seconds)
    │
    ├──── Every tick: ────────────────────────────┐
    │                                              │
    │  metricsCollector.collectMetrics()            │
    │    │ Reads: os.cpus(), os.freemem()           │
    │    │ Runs: nvidia-smi, Get-Process            │
    │    │ Returns: MetricsSample                   │
    │    ▼                                          │
    │  leakDetector.detectAnomalies()               │
    │    │ Linear regression on last 12 samples     │
    │    │ Checks: RAM slope, VRAM slope, CPU avg   │
    │    │ Returns: LeakAlert[]                     │
    │    ▼                                          │
    │  Emit MonitorEvent                            │
    │    ├─▶ statusBar.update() → footer metrics    │
    │    ├─▶ dashboardPanel.updateMetrics() → gauges│
    │    └─▶ runtime.log → disk persistence         │
    │                                              │
    └──── Loop ────────────────────────────────────┘
```

---

## 5. The Three Layers In Detail

### Layer 1: `.monitor` — Live Hardware Watcher

**When it runs**: During code execution (user starts/stops manually)

**What it tracks**:
- CPU usage (delta-based calculation between samples)
- RAM usage (used/total from `os` module)
- GPU utilization (via `nvidia-smi`)
- VRAM usage (via `nvidia-smi`)
- Top 5 CPU-consuming processes

**Leak detection algorithm**:
1. Collect last 12 samples (sliding window)
2. Run linear regression on RAM values
3. If slope > `leakThresholdMb` (default 100MB) AND R² > 0.7:
   → Trigger RAM leak warning
4. Same analysis for VRAM (threshold = 50MB)

**Files produced**:
- `.monitor/runtime.log` — Timestamped metrics + alerts

### Layer 2: `.VRE` — Virtual Runtime Environment

**When it runs**: Before code goes to target machine (user triggers manually)

**Translation rules** (defined in `translationEngine.ts`):

| Parameter | Max Proxy Value | Reason |
|-----------|----------------|--------|
| `batch_size` | 4 | Fit local RAM/VRAM |
| `num_workers` | 2 | Fit local CPU cores |
| `num_threads` | 2 | Fit local CPU cores |
| `num_epochs` | 2 | Test logic, not convergence |
| `gradient_accumulation_steps` | 1 | Simplify for proxy |
| `max_steps` | 10 | Test logic, not full training |

**What is NEVER modified**: Control flow, variable names, math operations, function signatures, error handling, loss functions, optimizers.

**Error classification**:
- **Category 1** (hardware): `CUDA out of memory`, `MemoryError`, `Resource exhausted`
- **Category 2** (logic): `ZeroDivisionError`, `IndexError`, `TypeError`, `NameError`, `ImportError`, shape mismatches

### Layer 3: `.migrate` — Dependency Manager

**When it runs**: On command (or can be automated on activation)

**Version comparison logic** (in `deltaEngine.ts`):

| Spec | Meaning | Example |
|------|---------|---------|
| `*` | Any version | Always satisfied |
| `>=1.9.0` | Greater or equal | 2.0.1 satisfies |
| `==1.21.0` | Exact match | 1.24.3 does NOT satisfy |
| `^2.0.0` | Same major + >= | 2.3.0 satisfies, 3.0.0 doesn't |
| `~1.5.0` | Same major.minor + >= | 1.5.9 satisfies, 1.6.0 doesn't |
| `>1.0.0` | Strictly greater | 1.0.1 satisfies |
| `>=1.0.0,<2.0.0` | Compound range | 1.5.0 satisfies |

---

## 6. Commands Reference

| Command | ID | What it does |
|---------|-----|-------------|
| VRE: Initialize | `vre.initialize` | Creates `.monitor/`, `.VRE/`, `.migrate/` folders with defaults |
| VRE: Scan Dependencies | `vre.scanDependencies` | Full migrate scan → delta.X |
| VRE: Start Monitor | `vre.startMonitor` | Starts live hardware polling |
| VRE: Stop Monitor | `vre.stopMonitor` | Stops hardware polling |
| VRE: Open Dashboard | `vre.showDashboard` | Opens webview dashboard |
| VRE: Translate & Run | `vre.translateAndRun` | Translates active file + runs proxy |
| VRE: View Delta.X | `vre.viewDelta` | Opens delta.X in editor |
| VRE: Refresh Explorer | `vre.refreshTree` | Refreshes sidebar tree |

---

## 7. Configuration Reference

Settings in VS Code (`Preferences > Settings > VRE + Around`):

| Setting | Type | Default | Purpose |
|---------|------|---------|---------|
| `vre.container.cpuCores` | number | 1 | Max CPU cores for VRE container |
| `vre.container.ramLimitGb` | number | 4 | Max RAM (GB) for VRE container |
| `vre.container.vramLimitGb` | number | 2 | Max VRAM (GB) for VRE container |
| `vre.container.maxRuntimeMinutes` | number | 30 | Timeout before proxy auto-kill |
| `vre.monitor.intervalSeconds` | number | 5 | Polling interval for hardware monitor |
| `vre.monitor.leakThresholdMb` | number | 100 | RAM growth rate to trigger leak alert |
| `vre.monitor.vramAlertPercent` | number | 90 | VRAM usage % to trigger ceiling alert |

---

## 8. Key Algorithms

### Semver Comparison (`deltaEngine.ts`)

```
parseVersion("2.0.1") → [2, 0, 1]
compareVersions([2,0,1], [1,9,0]) → 1 (greater)
satisfiesVersion("2.0.1", ">=1.9.0") → true
satisfiesVersion("1.24.3", "==1.21.0") → false
satisfiesVersion("2.3.0", "^2.0.0") → true (same major)
```

### CPU Delta Calculation (`metricsCollector.ts`)

```
Sample N:   total_ticks = 1000000, idle_ticks = 400000
Sample N+1: total_ticks = 1005000, idle_ticks = 401000

cpu_percent = (1 - (401000-400000)/(1005000-1000000)) * 100
            = (1 - 1000/5000) * 100
            = 80%
```

### Leak Detection via Linear Regression (`leakDetector.ts`)

```
Last 12 RAM samples: [8.1, 8.3, 8.5, 8.7, 8.9, 9.1, 9.3, 9.5, 9.7, 9.9, 10.1, 10.3]
Linear regression → slope = 0.2 GB/sample
Convert: 0.2 * 1024 = 204.8 MB/sample
R² = 0.99 (strong linear trend)

204.8 > 100 (threshold) AND 0.99 > 0.7 → LEAK WARNING
Growth rate: 204.8 * (60/5) = 2457 MB/min
```

### Proxy Line Mapping (`errorReporter.ts`)

```
Proxy file has 5 header comment lines added by translation.
Proxy crashes at line 89.
Original line = 89 - 5 = 84.
Check if line 84 was modified by translation → yes/no → annotate.
```

---

## 9. How to Modify — Common Tasks

### Add a New Translation Rule

**File**: `src/vre/translationEngine.ts`

Add to `PYTHON_RULES` or `JS_RULES` array:

```typescript
{
    name: 'learning_rate',
    pattern: /^(\s*(?:learning_rate|lr|LR)\s*=\s*)([\d.e-]+)/gm,
    maxProxy: 0.001,  // Clamp to safe default
    reason: 'Learning rate standardized for proxy testing',
}
```

### Add a New Dependency Source (e.g., Cargo.toml)

**File**: `src/migrate/requirementScanner.ts`

1. Add a new parser function: `parseCargoToml(filePath: string): ProjectRequirement[]`
2. Add the file check in `scanProjectRequirements()`:
```typescript
const cargoPath = path.join(workspaceRoot, 'Cargo.toml');
if (fs.existsSync(cargoPath)) {
    allRequirements.push(...parseCargoToml(cargoPath));
}
```

### Add a New Hardware Metric

**File**: `src/monitor/metricsCollector.ts`

1. Add the field to `MetricsSample` interface
2. Collect it in `collectMetrics()`
3. Add it to `formatMetricsLine()`

**File**: `src/monitor/leakDetector.ts`

4. Add anomaly detection logic in `detectAnomalies()`

**File**: `src/ui/dashboardPanel.ts`

5. Add a gauge card in the HTML
6. Update the `updateGauges()` JS function

### Add a New VS Code Command

1. **File**: `package.json` → add to `contributes.commands`
2. **File**: `src/commands.ts` → add `registerCommand()` implementation
3. No other files need changes.

### Change the Monitor Polling Interval

**File**: VS Code settings → `vre.monitor.intervalSeconds`

Or modify the default in `package.json` → `contributes.configuration`.

---

## 10. Building & Running

### Prerequisites

- Node.js ≥ 18
- VS Code ≥ 1.85.0

### Install Dependencies

```bash
npm install
```

### Compile TypeScript

```bash
npm run compile
```

### Watch Mode (auto-recompile on save)

```bash
npm run watch
```

### Run in Extension Development Host

Press `F5` in VS Code (uses `.vscode/launch.json`).

This opens a new VS Code window with the extension loaded.

### Package for Distribution

```bash
npx vsce package
```

Produces a `.vsix` file you can install anywhere.

---

## 11. Generated Files Reference

### `.migrate/delta.X` — The LLM Interface

This is the **most important file for AI consumption**. Paste it into any LLM chat for system-aware advice.

```
=== VRE delta.X — Environment Gap Report ===
Generated: 2025-09-14T10:32:00Z
Project: /home/dev/projects/ml-pipeline

SYSTEM SNAPSHOT:
  OS: Windows 11
  Python: 3.11.2
  Node: 20.11.0
  torch: 2.0.1
  numpy: 1.24.3
  Free RAM: 11.2 GB
  Free VRAM: 5.8 GB (GPU: NVIDIA RTX 3060)

GAP ANALYSIS:
  SATISFIED (no action needed):
    python 3.11.2 ✅ satisfies >= 3.9
    torch 2.0.1 ✅ satisfies >= 1.9.0
  MISSING (action required):
    ffmpeg ❌ not found on system PATH

INSTRUCTION TO LLM:
  Do not suggest installing anything in the SATISFIED list.
  Only address items in the MISSING list.
```

### `.VRE/vre.error.report.json` — Bug Report

```json
{
  "error": {
    "error_type": "ZeroDivisionError",
    "message": "division by zero",
    "category": 2,
    "category_note": "Logic error — will occur on any machine"
  },
  "original_line_mapping": {
    "proxy_line": 89,
    "original_line": 84,
    "translation_note": "Line unchanged by translation layer"
  }
}
```

### `.VRE/vre.translation.json` — What Changed

```json
{
  "translationsApplied": [
    { "parameter": "batch_size", "original": 512, "proxy": 4, "line": 45 },
    { "parameter": "num_workers", "original": 24, "proxy": 2, "line": 8 }
  ],
  "unchanged": [
    "All control flow",
    "All variable names",
    "All mathematical operations"
  ]
}
```

---

## 12. Error Classification System

| Category | Name | Examples | Action |
|----------|------|----------|--------|
| 1 | Hardware-dependent | `CUDA out of memory`, `MemoryError` | **Ignore** — not a code bug |
| 2 | Logic (hardware-blind) | `ZeroDivisionError`, `IndexError`, `TypeError`, `NameError` | **Fix** — will crash on any machine |

**Classification patterns** are defined in `src/vre/proxyExecutor.ts`:
- `CATEGORY_1_PATTERNS`: Regexes for hardware errors
- `CATEGORY_2_PATTERNS`: Regexes for logic errors
- Default: if no pattern matches, classified as Category 2 (safe-by-default)

---

## 13. Design Decisions & Tradeoffs

| Decision | Rationale |
|----------|-----------|
| **Regex-based translation** (not AST) | Simpler, works across Python and JS, sufficient for scale parameters. AST would be more robust but adds significant complexity. |
| **Synchronous system commands** (`execSync`) | Acceptable for MVP — scans run on-demand, not continuously. Future: migrate to async. |
| **No real container isolation** | True cgroups/Job Objects require elevated privileges. MVP enforces limits via timeout and monitoring. Future: integrate with Docker or process sandboxing. |
| **Human-in-the-loop** | The AI never auto-fixes code. This prevents cascading fix loops and keeps the developer in control. |
| **Singleton logger** | Every module needs logging. Passing a logger instance through every function call is verbose. Singleton is pragmatic. |
| **Canvas chart** (not Chart.js) | Zero dependencies for the webview. Chart.js would need bundling or CDN loading. Canvas is sufficient for simple line charts. |
| **5-line proxy header** | The translation adds 5 comment lines at the top of the proxy file. `errorReporter.ts` subtracts this offset when mapping lines back to the original. If you change the header, update `PROXY_HEADER_LINES`. |

---

*Document version: 1.0*
*Last updated: 2026-05-18*
*For: Human developers & AI coding assistants*
