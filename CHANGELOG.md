# Changelog

All notable changes to the VRE + Around extension will be documented here.

## [1.0.0] - 2026-05-18

### Added
- **Three-Layer Architecture**: `.monitor`, `.VRE`, `.migrate` folder structure
- **Translation Engine**: Regex-based proxy code generation for Python and JavaScript
- **Proxy Executor**: Child process execution with timeout enforcement and error classification
- **Error Reporter**: Category 1 (hardware) vs Category 2 (logic) classification with line mapping
- **Hardware Monitor**: Live CPU, RAM, GPU, VRAM polling with configurable intervals
- **Leak Detector**: Linear regression-based memory leak detection with R² threshold
- **Dependency Scanner**: Multi-format parsing (requirements.txt, package.json, setup.py, pyproject.toml)
- **System Scanner**: Installed package, runtime, and binary inventory
- **Delta Engine**: Semver-aware comparison producing `delta.X` LLM-friendly reports
- **Dashboard**: Rich webview with live gauges, trend charts, alerts, and process monitoring
- **Status Bar**: Live CPU/RAM/GPU metrics in VS Code footer
- **Tree View**: Activity Bar sidebar with three-layer file explorer
- **Keyboard Shortcuts**: `Ctrl+Shift+R` for translate & run, `Ctrl+Shift+D` for dashboard
- **Context Menus**: Right-click translate & run on `.py` and `.js` files
- **Export Report**: Consolidated environment report for sharing
- **Auto-Scan**: Optional automatic dependency scan on workspace open
- **Log Rotation**: Automatic rotation at configurable max file size
- **CSP Security**: Content Security Policy with nonce-protected webview scripts
