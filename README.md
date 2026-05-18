# VRE + Around

An extension that gives your code editor actual awareness of the machine it's running on.

Most AI assistants write code assuming infinite hardware — 8 GPUs, 256GB RAM, every library pre-installed. That's fine until you try to run it on your laptop and watch it crash. VRE sits between the AI and your machine and says "this won't work here — and here's why."

## The Problem

You ask an AI to write a training script. It gives you `batch_size=256` and `num_workers=16`. You run it. Your machine freezes. You go back to the AI, it adjusts one number, you try again. This loop wastes hours.

Or you clone a project that needs `torch`, `tensorflow`, and `ffmpeg`. You don't know which ones you have, which versions conflict, and whether your GPU even supports the CUDA version it wants.

Or you work on your laptop, push to a powerful company machine, it crashes with a vague error, you copy the error manually, paste it into a chat, and hope the AI understands the context. Each cycle costs 30–45 minutes.

VRE fixes all three problems.

## How It Works

**Three layers, one AI-orchestrated pipeline:**

```
.migrate ──→ .VRE ──→ .monitor
 (scan)    (container)  (watch)
   │            │           │
   └────────────┴───────────┘
                ▼
      Gemini AI Orchestrator
```

**`.migrate`** runs silently when you open a project. It scans manifests (12 language ecosystems) and **dynamically parses your source code imports** (Dynamic Import Alignment) to detect undeclared dependencies. If manifests like `requirements.txt` or `package.json` are missing, VRE **automatically generates** them. It produces **delta.X** — a structured gap report. 

**`.VRE`** creates a **soft container** when you press `Ctrl+Shift+R`. It reads delta.X, installs missing libraries into an ephemeral sandbox, and uses **Gemini 2.5 Flash** to:
1. Scale down resource parameters (batch size, thread counts).
2. **Inject Dynamic Step-Capping (Early Exits)**: Parses heavy scripts (like LLM or ML training) to intercept loops (e.g. `for batch_idx in enumerate`) and break after 5-10 iterations. This guarantees massive models validate locally in **< 10 seconds** instead of running forever!
It executes the code with strict environment overrides and performs a guaranteed `try...finally` sandbox directory cleanup.

**`.monitor`** watches hardware metrics in real-time. If a crash or leak occurs, the Gemini AI Orchestrator ingests the traceback, stack, and hardware logs to output an **AI-ready, high-precision self-healing instruction report** (`vre.crash.report`) for your chat assistant.

**`Editor Workspace Pre-Alignment`** automatically updates your `.vscode/settings.json` to point directly to the exact verified active runtime interpreter on your machine. This eliminates all editor-level static analysis (Pylance) resolution errors automatically.

**`Unified 1-Click Execution`** allows you to trigger a full local execution directly once VRE confirms logic is clean. It maps the exact verified absolute interpreter path (e.g. `"C:\Program Files\Python311\python.exe"`) to launch the full, un-scaled script inside a fresh integrated terminal safely with zero version conflicts.

## Quick Start

1. Create a `.env` file in your project root with your Gemini API Key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
2. Open a project — `.migrate` scans automatically, auto-generates manifests if missing, and writes delta.X. It also aligns your editor's `settings.json` path.
3. Press `Ctrl+Shift+R` on a `.py` or `.js` file — VRE translates, caps training loops dynamically via Gemini, runs inside the sandbox, and opens the real-time log.
4. If the code is logic-clean, click **`Run Full Script Locally`** to run the full training run safely using the aligned environment without version conflicts!
5. If a crash occurs, copy the Gemini-enriched report in `.VRE/` and paste it into your AI assistant for a one-shot fix.

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
