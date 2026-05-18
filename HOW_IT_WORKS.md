# How It Works

Every interaction between you and VRE, explained step by step.

---

## Opening a Project

**You do:** Open any folder in your editor.

**System does:**
1. `.migrate` runs silently in the background — no command, no prompt
2. Scans your project for dependency files (requirements.txt, package.json, Cargo.toml, etc.)
3. Scans your system — what's installed, what version, what hardware
4. Compares the two and writes delta.X to `.migrate/delta.X`
5. If anything is missing, shows a notification: "VRE: Missing deps detected: torch, redis"

**You see:** A small notification. You can click "View delta.X" or ignore it. Either way, delta.X is ready.

6. **Workspace Pre-Alignment:** VRE auto-generates `.vscode/settings.json` in your workspace pointing `python.defaultInterpreterPath` to the exact pre-verified absolute binary path. This resolves any editor static analysis conflicts (Pylance missing imports) instantly.

**What delta.X looks like:**
```
=== VRE delta.X — Environment Gap Report ===

SYSTEM:
  OS: Windows 11 22631
  CPU: 12th Gen Intel i7-12700H (20 cores)
  RAM: 12.3GB free / 15.8GB total
  GPU: None

RUNTIMES:
  python: 3.11.5
  node: 20.10.0
  pip: 24.0
  git: 2.43.0

SATISFIED:
  numpy 1.24.3 ✓ (needs >=1.20.0)
  flask 3.0.0 ✓ (needs >=2.0)

MISSING:
  torch ✗ not installed (needs >=1.9.0)
  redis ✗ not installed (needs *)

INSTRUCTION TO AI:
  This is the exact state of the developer machine.
  Do not assume any package is installed unless listed above.
  Target OS-specific commands for: Windows 11 22631
=== END ===
```

Paste this into any AI chat. One paste. The AI knows everything.

---

## Translating and Running Code

**You do:** Open a `.py` or `.js` file, press `Ctrl+Shift+R`.

**System does:**

1. **Saves** the file if you have unsaved changes.

2. **Auto-scans** if no delta exists yet (dynamic scanner maps imports and builds your `requirements.txt`/`package.json` dynamically).

3. **Translates & Optimizes (Gemini AI Layer):** 
   - Scales resource parameters inside memory:
     ```python
     # Your code              # Proxy version
     batch_size = 256         batch_size = 4
     num_workers = 16         num_workers = 2
     ```
   - **Dynamic Step-Capping (Loop Interceptor):** Gemini Flash reads your script. If it detects heavy loops (like dataset generators, model epochs, or massive network request arrays), it dynamically injects early loop exits into the copy in memory (e.g. `if batch_idx >= 5: break`). This guarantees your massive model successfully executes its forward/backward/optimize steps inside a few seconds instead of running for hours locally!

4. **Builds soft container** — reads delta.X, sees what's missing, downloads them to an isolated `.VRE/.container_tmp/` directory, and maps env variables.

5. **Runs the proxy** with real-time logs. The `VRE + Around` Output channel instantly reveals itself, showing your print statements, downloads, and progress bar in real-time.

6. **Classifies the result:**
   - **Success:** ✅ Code is logic-clean. Shows a success dialog: `"VRE: Code is logic-clean! VRE has mapped the exact aligned environment where dependencies are verified. You can run the full script safely now with zero version conflicts!"`
   - **Category 2 (logic bug):** 🚨 Logic bug detected. Gemini outputs high-precision line mappings to the original file.
   - **Category 1 (hardware limit):** ⚠️ Hardware limit. Gemini outputs a self-healing crash report instructing your chat assistant how to optimize.

7. **Dynamic File-Scoped Environment Pre-Alignment:** When you open or focus a `.py` or `.js` file, VRE dynamically prepends the pre-verified absolute binary interpreter directory to VS Code's active terminal `PATH` environment variable. The status bar immediately updates to show `VRE [Aligned: Python]` or `VRE [Aligned: Node]`. Typing standard commands (like `python` or `node`) in any newly opened terminal resolves instantly to the pre-verified version.

8. **Automatic Workspace Cleanup:** When you close the active file tab, VRE catches the closure event, immediately clears the environment variable collection (reverting paths to default), and **automatically terminates/removes any active VRE terminals** opened during that editing session to ensure a clean, process-free workspace!

9. **Cleans up (try...finally guarantee):** Deletes the temporary directories completely, reclaiming all local storage even if the script crashed or was cancelled mid-run.

---

## The Soft Container

This is the key feature. Not Docker. Not a VM. A temporary scope.

**How it works for Python:**
```
1. pip install --target .VRE/.container_tmp torch redis
   (packages go into a temp folder, not system Python)

2. PYTHONPATH=.VRE/.container_tmp python .VRE/proxy/proxy_train.py
   (process sees the temp packages)

3. rm -rf .VRE/.container_tmp
   (everything cleaned up)
```

**For Node.js:**
```
1. npm install --prefix .VRE/.container_tmp express redis
2. NODE_PATH=.VRE/.container_tmp/node_modules node .VRE/proxy/proxy_server.js
3. rm -rf .VRE/.container_tmp
```

**What you get:** If the code crashes with a logic bug inside the container, you know for certain it's a real bug — the environment was correct, the dependencies were present, the only thing that failed was the code itself.

---

## Error Reports

**Category 2 (logic bug):**
```json
{
  "category": 2,
  "categoryNote": "Logic error — will crash on any machine. This is a real bug.",
  "errorType": "ZeroDivisionError",
  "message": "division by zero",
  "sourceFile": "train.py",
  "originalLine": 47,
  "function": "calculate_loss",
  "stack": [
    "train.py line 47 in calculate_loss",
    "train.py line 112 in train_epoch"
  ]
}
```

**Category 1 (hardware limit):**
```
=== VRE RUNTIME REPORT — Category 1 (Hardware Limit) ===

SYSTEM AT CRASH:
  OS: Windows 11 22631
  CPU: 12th Gen Intel i7-12700H (20 cores)
  RAM: 15.8GB total
  GPU: None

ERROR:
  Type: MemoryError
  Message: Unable to allocate 4.00 GiB
  File: train.py, line 112, function train_epoch

TRANSLATION CONTEXT:
  batch_size: 256 → 4 (Batch size scaled to local RAM)
  num_workers: 16 → 2 (Worker count scaled to local CPU)

THIS IS NOT A CODE BUG. Logic is intact. Optimize resource usage.
=== END ===
```

---

## Monitor

**Default Behavior:** Completely disabled by default (`"monitor": false` or config file absent) to preserve local system resources. VRE runs completely silently without tracking host hardware.

**Opt-In via Configuration:** 
If you want automatic hardware tracking during code runs, create or edit the `.VRE/config.json` configuration file inside your project root and set `"monitor": true`:
```json
{
  "monitor": true
}
```
* **Auto-Launch Lifecycle:** When `"monitor": true` is enabled, VRE **automatically starts the background telemetry monitor first** the moment you run a script, and then immediately launches your model execution. This ensures seamless memory leak detection during hot training runs without wasting resources when idle.

---

## Installing Missing Dependencies

When you run "Scan Dependencies" and things are missing, VRE asks:

```
Missing: torch, redis. Install now?
[Yes — install]  [No — I'll handle it]
```

If you say yes, VRE installs them globally (pip/npm). If they're from other ecosystems (cargo, go, gem), VRE tells you to install manually.

The soft container handles temporary installs during execution. This prompt is for permanent installs if you want them.

---

## Command Line Interface (CLI)

For developers who prefer terminal-centric workflows, VRE dynamically binds a lightweight CLI inside active workspace terminals:

1. **How it works:** When a terminal is spawned, VRE dynamically maps its internal script directory to the terminal session `PATH`.
2. **`vre activate`:** Explicitly initializes the aligned environment, creates the starting folder structure (`.VRE/`), and sets up a default `.VRE/config.json`.
3. **`vre run <file_path>`:** Executes the script inside the soft container. Rather than acting as a silent "black box," the CLI prints **every action step-by-step in real-time** (dependency scraping, Gemini loop-capping scaling, container sandbox preparation, execution outputs, and temporary sandbox reclamation).
4. **`vre scan`:** Instructs `.migrate` to scan for packages, match code imports dynamically, and rewrite `delta.X` instantly.
5. **`vre monitor`:** Launches VRE's telemetry monitor directly in your active terminal session. It prints:
   ```bash
   [VRE Monitoring] Active on: C:\Users\User\Project_VRE_Env
   > Run your heavy model script now! Sampling CPU, RAM, GPU, VRAM...
   ```
   This allows you to leave this terminal active to track hardware leaks while you compile or run your script in another terminal.

This provides complete command-line control over all VRE capabilities with zero local setup!
