# VRE + Around — Project Overview

The **Virtual Runtime Environment (VRE)** is a resource-aware execution, validation, and diagnostic system that sits between AI code generation and finite developer hardware. 

Most AI assistants generate code assuming infinite system resources (e.g., massive batch sizes, huge model sizes, high worker counts, and pre-installed CUDA packages). When run locally, these scripts often trigger system OOM (Out Of Memory) freezes, runtime library crashes, or complex semver dependency conflicts. 

VRE bridges this gap by scanning active workspaces, prepending verified dependencies, intercepting resource parameters via Gemini Flash 2.5, validating logic in isolated soft sandboxes, and logging hardware telemetry in real-time.

---

```
                               ┌────────────────────────┐
                               │   Developer Machine    │
                               │ (Finite RAM/GPU/VRAM)  │
                               └───────────┬────────────┘
                                           │
                                           ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 1. .migrate Layer                                                                     │
│    Scans AST imports ──→ Maps global interpreter ──→ Aligns VS Code & Terminal PATH   │
└──────────────────────────────────────────────────┬────────────────────────────────────┘
                                                   │
                                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 2. .VRE Layer (Soft Container & Gemini Flash Orchestration)                           │
│    Scales parameters (Batch, workers) ──→ Injects loop caps ──→ Sandboxed logic test │
└──────────────────────────────────────────────────┬────────────────────────────────────┘
                                                   │
                                                   ▼
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ 3. .monitor Layer                                                                     │
│    (Default: Off | Auto-Active on Run) Samples RAM/VRAM ──→ Detects leaks via slope   │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## The Three-Layer Lifecycle Model

### Layer 1: `.migrate` (Ecosystem Alignment & Path Injection)
The `.migrate` layer runs silently the moment you open a workspace. It manages system libraries and path alignments:

* **AST-Based Import Scanner:** It parses active workspace scripts (Python/JS/TS) to scrape required libraries (e.g., matching `import torch` or `const express = require('express')`). 
* **Global Library Mapping:** It cross-references scraped imports with system package inventories. If an ecosystem manifest (like `requirements.txt` or `package.json`) is missing, VRE automatically writes one.
* **Environment Pre-Alignment:** It identifies the exact absolute path to your verified machine runtime binary (e.g., `C:\Program Files\Python311\python.exe`). It then performs two actions:
  1. Auto-writes `.vscode/settings.json` so VS Code's editor static analysis (Pylance) aligns with your global environment, clearing all missing import warnings.
  2. Dynamically prepends the binary's folder path to your active terminal `PATH` session using VS Code's environment variables API.
* **The Gap Report (`delta.X`):** Writes a structured gap document summarizing OS details, runtime versions, satisfied packages, and missing dependencies. 

---

### Layer 2: `.VRE` (Soft Container & Dynamic AI Translation)
The `.VRE` layer is the logic execution engine. When you trigger a run (`Ctrl+Shift+R` or `vre run`), it performs a highly transparent, sandboxed validation:

* **Ecosystem Soft Container:** Rather than spinning up a heavy VM or Docker container, VRE uses a lightweight path override mechanism. It downloads missing libraries to a temporary directory (`.VRE/.container_tmp/`) and points your terminal environment variable overrides (`PYTHONPATH` / `NODE_PATH`) to this sandbox. Everything runs in complete isolation.
* **Gemini Flash 2.5 Orchestrator:** Before execution, the code in memory is evaluated by VRE's REST-based Gemini engine to make two modifications:
  1. **Resource Parameter Scaling:** It automatically scales down resource-heavy values to fit your local hardware limits (e.g., scaling `batch_size = 256` down to `4` and `num_workers = 16` to `2`).
  2. **Dynamic Step-Capping (Early Loop Exits):** If VRE detects heavy training epochs or infinite batch iterations, it dynamically injects AST break statements into memory (e.g., inserting `if batch_idx >= 5: break`). This guarantees massive models validate their logic and gradients in **under 3 seconds** instead of running for hours.
* **Storage Safety:** The temporary `.VRE/.container_tmp/` directories are protected by strict `try...finally` bindings, guaranteeing 100% cleanup and storage reclamation even if the script crashes or is manually terminated.

---

### Layer 3: `.monitor` (Continuous Telemetry & Leak Warning)
The `.monitor` layer tracks hardware behavior during execution:

* **Automatic Background Telemetry:** By default, hardware monitoring is completely disabled (`"monitor": false`) to save resources. If a developer explicitly opts in by setting `"monitor": true` in their `.VRE/config.json` configuration, VRE automatically boots up the telemetry monitor in the background the moment a script run starts.
* **Linear Regression Modeling:** While your code executes, the monitor samples CPU usage, RAM, GPU, and VRAM every 5 seconds. It runs active linear regression on the memory points. If the slope exceeds `50MB per sample`, it actively flags a memory leak before your computer freezes.
* **Self-Healing Diagnostics:** If the code crashes due to hardware limits (Category 1: OOM) or code errors (Category 2: Logic), VRE aggregates active telemetry and stack traces, writing a clean, AI-ready report (`vre.crash.report`) for your chat assistant to solve in a single prompt.

---

## The Command Line Interface (CLI) Model

VRE provides a lightweight CLI mapped directly to active VS Code terminal sessions. By prepending wrapper scripts in `.VRE/bin/` to the session's path, developers gain complete terminal-based control:

* **`vre activate`:** Explicitly initializes the aligned environment, creates the starting folder structure (`.VRE/`), and sets up a default `.VRE/config.json`.
* **`vre run <file_path>`:** Boots the soft container and executes your code. It rejects "black box" models. Instead, it prints every step explicitly:
  ```bash
  [VRE CLI] Scraping source file imports...
  [VRE CLI] Gemini Flash optimized resource bounds: batch_size scaled (256 ➔ 4).
  [VRE CLI] Gemini Flash injected early loop exit at line 42 (step-capping active).
  [VRE CLI] Allocating isolated sandbox at .VRE/.container_tmp/ ...
  [VRE CLI] Running script proxy...
  ... (real-time script output) ...
  [VRE CLI] Reclaiming sandbox space and cleaning environment variables.
  [VRE CLI] Execution complete: Logic is clean.
  ```
* **`vre scan`:** Manually sweeps your workspace for manifests and code imports, re-writing your active environment's `delta.X` instantly.
* **`vre monitor`:** Launches terminal-based active telemetry:
  ```bash
  [VRE Monitoring] Active on: C:\Users\User\Project_VRE_Env
  > Run your heavy model script now! Sampling CPU, RAM, GPU, VRAM...
  [Monitor] 13:21:05 - CPU: 12% | RAM: 8.4GB/24GB | GPU: 5% | VRAM: 1.2GB/6GB
  [Monitor] 13:21:10 - CPU: 45% | RAM: 8.8GB/24GB | GPU: 88% | VRAM: 4.8GB/6GB
  ```

---

## Dynamic Neural Network Interception Model (e.g., MNIST Training)

To visualize how VRE handles a heavy machine learning training pipeline:

```
Developer Script (train_mnist.py)
  ├── batch_size = 64
  ├── epochs = 3
  └── for epoch in range(epochs):
          for batch_idx, (data, target) in enumerate(train_loader):
              ... (heavy network passes) ...

                  │
                  ▼ [Ctrl+Shift+R or 'vre run']
VRE AST Interception & Translation in Memory
  ├── Proxy batch_size = 4
  ├── Proxy epochs = 2
  └── Injected: if batch_idx >= 5: break (dynamic step-capping)

                  │
                  ▼
Sandboxed Validation Loop (Under 3 seconds)
  ├── Ephemeral packages loaded (.VRE/.container_tmp/)
  ├── Forward pass logic verified
  ├── Backward pass & gradient calculations verified
  └── Zero-Leak verified by active .monitor

                  │
                  ▼
Workspace Cleaned & Restored
  ├── Sandbox deleted, RAM reclaimed
  └── Confirmed logic-clean status message shown to developer
```

VRE turns resource-blind development into a highly predictable, isolated, and completely transparent local engineering workflow.
