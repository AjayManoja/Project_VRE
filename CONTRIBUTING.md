# Contributing

## Setup

```bash
git clone https://github.com/AjayManoja/Project_VRE.git
cd Project_VRE
npm install
```

## Building

```bash
npx tsc --noEmit          # type check
node esbuild.mjs          # dev build
node esbuild.mjs --production  # production build
```

## Running

1. Open the project in VS Code
2. Press F5 — opens Extension Development Host
3. Test commands from the palette

## Watch Mode

```bash
npm run watch
```

## Project Structure

```
src/
├── extension.ts        Entry point — auto-scan + command registration
├── commands.ts         5 commands: scan, translate&run, monitor start/stop, view delta
├── utils/
│   ├── logger.ts       Output channel logger
│   └── platform.ts     OS, hardware, shell commands
├── migrate/
│   ├── scanner.ts      12 ecosystem dependency parsers
│   ├── system.ts       Runtime + package inventory
│   ├── delta.ts        Semver comparison + delta.X report
│   ├── installer.ts    pip/npm install with user permission
│   └── index.ts        Migrate orchestrator
├── vre/
│   ├── translator.ts   Parameter scaling rules
│   ├── classifier.ts   Cat 1/Cat 2 error classification
│   ├── container.ts    Soft container (temp install → run → cleanup)
│   └── index.ts        VRE pipeline orchestrator
├── monitor/
│   └── watcher.ts      Hardware sampler + leak detector
└── ui/
    └── statusbar.ts    Live status bar metrics
```

13 files. Each file does one thing.

## Adding a New Ecosystem Parser

1. Open `src/migrate/scanner.ts`
2. Write a parser function: `function parseYourFormat(fp: string): Dependency[]`
3. Add it to the `MANIFESTS` array
4. Done — the scanner picks it up automatically

## Adding Translation Rules

1. Open `src/vre/translator.ts`
2. Add an entry to `PY_RULES` or `JS_RULES`
3. Set the pattern, max proxy value, and reason

## Linting

```bash
npx eslint src --ext ts
```
