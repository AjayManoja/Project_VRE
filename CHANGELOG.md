# Changelog

## 1.0.0 — 2026-05-18

First public release.

### What's in this release

**Core engine:**
- Three-layer architecture: `.monitor`, `.VRE`, `.migrate`
- Hardware monitor with CPU, RAM, GPU, VRAM tracking and memory leak detection
- Code translation engine that scales resource-heavy parameters for safe local testing
- Error classification system that separates hardware crashes from actual code bugs
- Dependency scanner supporting 12 ecosystems (Python, Node, Rust, Go, Java, C#, Ruby, PHP, Dart, and more)
- Universal system scanner detecting 35+ runtimes, toolchains, containers, databases, and dev tools
- Semver-aware dependency comparison with gap reporting

**Editor integration:**
- 9 commands accessible from the command palette
- Live dashboard with real-time gauges, trend charts, alerts, and process monitoring
- Status bar indicators showing CPU/RAM/GPU usage
- Sidebar tree view for browsing VRE data files
- Right-click context menu for translate & run on .py and .js files
- Keyboard shortcuts: Ctrl+Shift+R (translate & run), Ctrl+Shift+D (dashboard)

**Build and tooling:**
- esbuild bundler producing a single 60KB minified file
- ESLint and Prettier configured
- GitHub Actions CI pipeline with cross-platform testing
- Content Security Policy with nonce-protected webview

**Platform:**
- Editor adapter layer for future multi-editor support
- VS Code adapter (current) and CLI adapter (headless/CI) implemented
