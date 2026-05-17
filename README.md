# VRE + Around — AI Code Environment

> **Make your AI code editor aware of your real hardware.** Catch logic bugs locally, manage dependencies intelligently, and monitor resources in real-time — before expensive remote compute is spent.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-007ACC.svg)](https://code.visualstudio.com/)

---

## 🎯 What This Extension Does

AI coding assistants are **hardware-blind** — they generate code for 8-GPU clusters, assume 128GB RAM, and reference libraries you don't have installed. VRE + Around solves this with three intelligent layers:

| Layer | What It Does |
|-------|-------------|
| 🔴 **.monitor** | Live hardware monitoring with memory leak detection |
| 🟢 **.VRE** | Translates high-spec code into local-safe proxies, catches logic bugs |
| 🔵 **.migrate** | Scans dependencies, detects gaps, generates LLM-friendly reports |

## ⚡ Features

### Proxy Translation Engine
- Detects hardware-scale parameters (`batch_size`, `num_workers`, `epochs`)
- Generates local-safe proxy code that preserves all logic
- Classifies errors as **Category 1** (hardware) or **Category 2** (logic bugs)
- Maps proxy crash lines back to original source code

### Live Hardware Dashboard
- Real-time CPU, RAM, GPU, VRAM gauges
- Historical trend charts with 60-sample rolling window
- Memory leak detection via linear regression analysis
- Process monitoring with CPU/memory breakdown

### Dependency Gap Analysis
- Parses `requirements.txt`, `package.json`, `setup.py`, `pyproject.toml`
- Scans installed packages, runtimes, and system binaries
- Generates `delta.X` — an LLM-friendly gap report
- Semver-aware version comparison (`>=`, `^`, `~`, `==`)

## 🚀 Getting Started

1. Install the extension
2. Open any project in VS Code
3. Press `Ctrl+Shift+P` → **VRE: Initialize Project Environment**
4. Run **VRE: Scan Dependencies** to generate your `delta.X` report
5. Open a `.py` or `.js` file → **VRE: Translate & Run Proxy** (`Ctrl+Shift+R`)

## ⌨️ Keyboard Shortcuts

| Shortcut | Command |
|----------|---------|
| `Ctrl+Shift+R` | Translate & Run current file |
| `Ctrl+Shift+D` | Open Dashboard |

## ⚙️ Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `vre.container.ramLimitGb` | 4 | Max RAM (GB) for proxy container |
| `vre.container.vramLimitGb` | 2 | Max VRAM (GB) for proxy container |
| `vre.container.maxRuntimeMinutes` | 30 | Timeout before auto-kill |
| `vre.monitor.intervalSeconds` | 5 | Hardware polling interval |
| `vre.monitor.leakThresholdMb` | 100 | RAM growth rate for leak alert |
| `vre.logging.level` | info | Log verbosity (debug/info/warn/error) |
| `vre.autoScanOnOpen` | false | Auto-scan dependencies on workspace open |

## 📁 Generated Files

```
your-project/
├── .monitor/
│   └── runtime.log          # Live hardware metrics
├── .VRE/
│   ├── vre.config.json       # Container resource limits
│   ├── vre.translation.json  # What parameters were scaled
│   ├── vre.error.report.json # Classified bug reports
│   └── proxy/                # Translated proxy scripts
└── .migrate/
    ├── delta.X               # LLM-friendly gap report
    ├── system.snapshot        # Full system inventory
    └── env.setup             # Human-readable install plan
```

## 🤖 For AI Assistants

Paste the contents of `.migrate/delta.X` into any AI chat to give it full hardware awareness. The file tells the AI exactly what's installed, what's missing, and your OS-specific context.

## 📄 License

MIT — see [LICENSE](LICENSE) for details.
