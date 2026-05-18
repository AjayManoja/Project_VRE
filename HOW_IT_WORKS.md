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

2. **Auto-scans** if no delta exists yet (you don't need to run scan first).

3. **Translates** — scans the code for resource-heavy parameters:
   ```python
   # Your code              # Proxy version
   batch_size = 256         batch_size = 4
   num_workers = 16         num_workers = 2
   pool_size = 100          pool_size = 5
   max_retries = 50         max_retries = 3
   ```
   Logic is identical. Only resource numbers change.

4. **Builds soft container** — reads delta.X, sees what's missing:
   - If torch is missing: `pip install --target .VRE/.container_tmp torch`
   - Sets `PYTHONPATH` to include the temp directory
   - Your system Python doesn't change. No global installs.

5. **Runs the proxy** inside the container as a child process with a 30-minute timeout.

6. **Classifies the result:**

   **If it succeeds:** "✅ Code is logic-clean." The algorithms work correctly at any scale.

   **If Category 2 (logic bug):** "🚨 Logic bug: ZeroDivisionError at line 47." Opens the error report showing the exact line in your original file and the full stack trace. This error would crash on any machine — fix it before deploying.

   **If Category 1 (hardware limit):** "⚠️ Hardware limit: CUDA out of memory." Writes an AI-ready crash report to `.VRE/vre.crash.report` with system specs, crash location, and suggested fix direction.

7. **Cleans up** — deletes the temp directory. System returns to its original state. No leftover packages, no pollution.

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

**Start:** Run "VRE: Start Monitor" from the command palette.

**What it does:** Polls CPU, RAM, GPU, VRAM every 5 seconds. Shows live numbers in the status bar. Runs linear regression on memory samples — if RAM or VRAM keeps climbing, fires a leak warning.

**Stop:** Run "VRE: Stop Monitor."

The monitor runs independently. You can have it on while you code, scan, or run proxies.

---

## Installing Missing Dependencies

When you run "Scan Dependencies" and things are missing, VRE asks:

```
Missing: torch, redis. Install now?
[Yes — install]  [No — I'll handle it]
```

If you say yes, VRE installs them globally (pip/npm). If they're from other ecosystems (cargo, go, gem), VRE tells you to install manually.

The soft container handles temporary installs during execution. This prompt is for permanent installs if you want them.
