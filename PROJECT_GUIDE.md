# VRE + Around — Complete Project Guide v2.0 (Production)

> **For LLMs & Developers**: Single source of truth for understanding, modifying, and extending the VRE + Around VS Code extension.

---

## 1. What Changed: MVP → Production

| Area | MVP | Production |
|------|-----|------------|
| **Build** | Raw `tsc` output (many files) | **esbuild** single-file bundle (59KB minified) |
| **Security** | No CSP, raw innerHTML | **CSP + nonce**, XSS-safe `textContent` |
| **Performance** | `execSync` everywhere | **Async exec** with `promisify(exec)` |
| **Logging** | Unbounded file writes | **Log rotation** at configurable max size, buffered writes |
| **Package** | Bare minimum manifest | Full marketplace metadata, keybindings, context menus, welcome views |
| **Quality** | No linting | **ESLint + Prettier** configured |
| **CI/CD** | None | **GitHub Actions** cross-platform matrix (3 OS × 2 Node versions) |
| **Assets** | No icon, no README | Icon, README, CHANGELOG, LICENSE |
| **Error handling** | Empty `catch {}` blocks | Typed `catch (err: unknown)` with user-friendly messages |
| **UX** | Manual everything | Context keys for conditional menus, auto-save before translate, debounced tree refresh |

---

## 2. Architecture

```
Extension Host
  ├── extension.ts          ← Entry: lifecycle, context keys, auto-scan
  ├── commands.ts           ← 9 commands with error boundaries
  ├── utils/
  │   ├── logger.ts         ← Buffered writes, log rotation, configurable levels
  │   ├── platform.ts       ← Dual sync/async OS introspection
  │   └── fileGenerator.ts  ← Idempotent folder structure
  ├── migrate/
  │   ├── requirementScanner.ts  ← Multi-format dep parsing
  │   ├── systemScanner.ts       ← Host inventory
  │   ├── deltaEngine.ts         ← Semver comparison → delta.X
  │   └── index.ts               ← Orchestrator
  ├── monitor/
  │   ├── metricsCollector.ts    ← Stateless CPU/RAM/GPU sampler
  │   ├── leakDetector.ts        ← Linear regression anomaly detection
  │   └── hardwareMonitor.ts     ← Polling loop + EventEmitter
  ├── vre/
  │   ├── translationEngine.ts   ← Regex-based scale-down
  │   ├── proxyExecutor.ts       ← Child process + error parsing
  │   ├── errorReporter.ts       ← Line mapping + category classification
  │   └── index.ts               ← Full lifecycle orchestrator
  └── ui/
      ├── statusBar.ts           ← Live footer metrics
      ├── treeDataProvider.ts    ← Sidebar tree view
      └── dashboardPanel.ts      ← CSP-secured webview dashboard
```

---

## 3. Build System

```bash
npm run compile      # Type-check + esbuild (dev)
npm run watch        # Parallel: esbuild watch + tsc noEmit watch
npm run package      # Type-check + esbuild --production (minified)
npm run lint         # ESLint
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier
```

**Bundle output**: `out/extension.js` — single file, tree-shaken, minified in production.

**Key config files**:
- `esbuild.mjs` — Bundler config (CJS format, node platform, vscode external)
- `tsconfig.json` — Strict TypeScript
- `.eslintrc.json` — TypeScript rules
- `.prettierrc` — Formatting rules

---

## 4. Security Model

### Webview CSP (Content Security Policy)
- `default-src 'none'` — blocks all by default
- `script-src 'nonce-${randomHex}'` — only extension-generated scripts execute
- `style-src 'nonce-${randomHex}'` — only extension-generated styles apply
- No `unsafe-inline`, no `unsafe-eval`

### XSS Prevention
- Alert messages sanitized via `textContent` (not `innerHTML`)
- Process names escaped via `document.createElement('div').textContent`

---

## 5. Commands Reference

| Command | ID | Keybinding | Context |
|---------|-----|-----------|---------|
| Initialize | `vre.initialize` | — | Always |
| Scan Dependencies | `vre.scanDependencies` | `Ctrl+Shift+S` | When no editor focused |
| Start Monitor | `vre.startMonitor` | — | When `!vre:monitorRunning` |
| Stop Monitor | `vre.stopMonitor` | — | When `vre:monitorRunning` |
| Open Dashboard | `vre.showDashboard` | `Ctrl+Shift+D` | Always |
| Translate & Run | `vre.translateAndRun` | `Ctrl+Shift+R` | `.py` or `.js` files |
| View Delta.X | `vre.viewDelta` | — | Always |
| Refresh Explorer | `vre.refreshTree` | — | Tree view |
| Export Report | `vre.exportReport` | — | Always |

---

## 6. Configuration

| Setting | Type | Default | Min/Max |
|---------|------|---------|---------|
| `vre.container.cpuCores` | number | 1 | 1–64 |
| `vre.container.ramLimitGb` | number | 4 | 1–512 |
| `vre.container.vramLimitGb` | number | 2 | 0–128 |
| `vre.container.maxRuntimeMinutes` | number | 30 | 1–1440 |
| `vre.monitor.intervalSeconds` | number | 5 | 1–300 |
| `vre.monitor.leakThresholdMb` | number | 100 | 10–10000 |
| `vre.monitor.vramAlertPercent` | number | 90 | 50–100 |
| `vre.telemetry.enabled` | boolean | false | — |
| `vre.logging.level` | enum | info | debug/info/warn/error |
| `vre.logging.maxFileSizeMb` | number | 10 | 1–100 |
| `vre.autoScanOnOpen` | boolean | false | — |

---

## 7. How to Modify

### Add a translation rule
File: `src/vre/translationEngine.ts` — add to `PYTHON_RULES` or `JS_RULES` array.

### Add a dependency format
File: `src/migrate/requirementScanner.ts` — add parser function + file check in `scanProjectRequirements()`.

### Add a hardware metric
1. `src/monitor/metricsCollector.ts` — add to `MetricsSample` + `collectMetrics()`
2. `src/monitor/leakDetector.ts` — add anomaly check
3. `src/ui/dashboardPanel.ts` — add gauge card + chart line

### Add a VS Code command
1. `package.json` → `contributes.commands` + optional keybinding/menu
2. `src/commands.ts` → `registerCommand()` implementation

---

## 8. Publishing Checklist

```bash
# 1. Type check + lint
npm run check-types
npm run lint

# 2. Build production bundle
npm run package

# 3. Package VSIX
npx @vscode/vsce package --no-dependencies

# 4. Publish (requires PAT)
npx @vscode/vsce publish -p <YOUR_PAT>
```

---

*Document version: 2.0 (Production)*
*Last updated: 2026-05-18*
