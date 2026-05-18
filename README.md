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

**`.monitor`** runs automatically in the background on startup, tracking CPU, RAM, GPU, and VRAM every 5 seconds. If a memory leak or crash occurs, the Gemini AI Orchestrator compiles your hardware stats, stack trace, and active settings to write a self-healing diagnostic report (`vre.crash.report`).

**`Dynamic Terminal Alignment & Automatic Cleanup`** ensures that your VS Code terminal automatically uses the correct pre-verified environment (Python, Node, etc.) while editing the corresponding file. The moment you close the file, VRE immediately clears the env overrides and **automatically closes/disposes of the active VRE terminal session** to keep your workspace perfectly clean.

**`Decoupled Local Configuration`** gives you simple control over the system. If you want to disable the automatic hardware monitor, you do not need to run commands. Simply create or edit the local `.VRE/config.json` configuration file in your project root and set `"monitor": false`.

## Quick Start

1. Create a `.env` file in your project root with your Gemini API Key:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```
2. Open a project — `.migrate` scans automatically, auto-generates manifests if missing, writes delta.X, and starts the background performance monitor automatically.
3. Open any `.py` or `.js` file — VRE dynamically aligns your terminal's environment. The status bar will show `VRE [Aligned: Python]`.
4. Press `Ctrl+Shift+R` to run VRE validation (which finishes inside 3 seconds using the Gemini dynamic step-capper).
5. Open a terminal and run your full script safely using the aligned terminal environment with zero conflicts!
6. Close the file tab when done — VRE immediately clears environment changes and terminates the aligned terminal session automatically!

## Command Line Interface (CLI)

In addition to editor shortcuts, VRE dynamically injects a lightweight, local Command Line Interface directly into your active VS Code terminal sessions. You can run commands natively from your terminal prompt:

* **`vre activate`** — Explicitly initializes and activates the aligned environment, setting up the `.VRE/` workspace starting directory.
* **`vre run <file_path>`** — Translates and executes the specified script inside the isolated soft container. Rather than a black-box execution, VRE prints **every action step-by-step in real-time** (dependency analysis, Gemini parameter capping adjustments, sandbox allocation, and sandbox reclamation).
* **`vre scan`** — Triggers the `.migrate` scanner to check dependencies, map imports, and refresh `delta.X` instantly.
* **`vre monitor`** — Activates VRE's hardware telemetry directly in the terminal. It prints a continuous performance log:
  ```bash
  [VRE Monitoring] Active on: C:\Users\User\Project_VRE_Env
  > Run your heavy model script now! Sampling CPU, RAM, GPU, VRAM...
  ```

### Lifecycle Telemetry Controls
* **Default Off:** By default, hardware monitoring is completely disabled to save local system resources (`"monitor": false`).
* **Auto-Trigger on Run:** If `"monitor": true` is explicitly configured in your local `.VRE/config.json`, then **whenever you execute a script via VRE, the telemetry monitor automatically boots up first in the background**, logging system resources in real-time alongside your code run!

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
