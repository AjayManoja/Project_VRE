# VRE + Around

An extension that gives your code editor actual awareness of the machine it's running on.

Most AI assistants write code assuming infinite hardware — 8 GPUs, 256GB RAM, every library pre-installed. That's fine until you try to run it on your laptop and watch it crash. VRE sits between the AI and your machine and says "this won't work here — and here's why."

## The Problem

You ask an AI to write a training script. It gives you `batch_size=256` and `num_workers=16`. You run it. Your machine freezes. You go back to the AI, it adjusts one number, you try again. This loop wastes hours.

Or you clone a project that needs `torch`, `tensorflow`, and `ffmpeg`. You don't know which ones you have, which versions conflict, and whether your GPU even supports the CUDA version it wants.

Or you work on your laptop, push to a powerful company machine, it crashes with a vague error, you copy the error manually, paste it into a chat, and hope the AI understands the context. Each cycle costs 30–45 minutes.

VRE fixes all three problems.

## How It Works

**Three layers, one pipeline:**

```
.migrate ──→ .VRE ──→ .monitor
 (scan)    (container)  (watch)
```

**`.migrate`** runs silently when you open a project. It reads whatever dependency file your project uses (requirements.txt, package.json, Cargo.toml, go.mod, and 8 more), checks what's actually installed on your system, and produces **delta.X** — a structured gap report. Paste this into any AI chat and the AI instantly knows your exact environment. No more 2-hour explanation sessions.

**`.VRE`** creates a **soft container** when you press `Ctrl+Shift+R`. It reads delta.X, installs only what's missing into a temporary isolated scope, scales down resource-heavy parameters (thread counts, batch sizes, connection pools — not just ML stuff), runs the code, and cleans up after. Your system is exactly as it was before. If the code crashes, VRE tells you whether it's a real bug (Category 2 — will crash on any machine) or just a hardware limit (Category 1 — would work on a bigger machine).

**`.monitor`** watches hardware while code runs. If RAM or VRAM spikes past safe limits, it catches it, stops the process, and writes an AI-ready crash report with exact specs, memory trends, and suggested fix directions. You paste this report and the AI can fix it on the first try.

## Quick Start

1. Open a project — `.migrate` scans automatically, delta.X appears in `.migrate/`
2. Open a `.py` or `.js` file, press `Ctrl+Shift+R` — VRE translates, containers, runs, reports
3. If something's missing, VRE asks: "Install now? [Yes] [No]"
4. Check the report in `.VRE/` — logic bugs or hardware limits, clearly separated

## Keyboard Shortcuts

- `Ctrl+Shift+R` — Translate & Run (on any .py or .js file)

## Supported Ecosystems

| Language | Files Parsed |
|----------|-------------|
| Python | requirements.txt, Pipfile, setup.py, pyproject.toml |
| JavaScript/Node | package.json |
| Rust | Cargo.toml |
| Go | go.mod |
| Java | pom.xml, build.gradle |
| C# / .NET | *.csproj |
| Ruby | Gemfile |
| PHP | composer.json |
| Dart | pubspec.yaml |

## Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — How the system is designed, what connects to what
- [HOW_IT_WORKS.md](HOW_IT_WORKS.md) — Step-by-step explanation of every user interaction
- [CONTRIBUTING.md](CONTRIBUTING.md) — How to build, test, and extend this project
- [CHANGELOG.md](CHANGELOG.md) — Release history
