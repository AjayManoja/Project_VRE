/**
 * ═══════════════════════════════════════════════════════════════════
 *  Requirement Scanner — Parses project dependency declarations
 * ═══════════════════════════════════════════════════════════════════
 *
 *  PURPOSE:
 *    Reads the project's dependency declaration files and extracts
 *    a unified list of what the project needs to run. Supports:
 *      - requirements.txt  (Python / pip)
 *      - package.json      (Node.js / npm)
 *      - Cargo.toml        (Rust — planned)
 *      - go.mod            (Go — planned)
 *
 *  OUTPUT:
 *    An array of ProjectRequirement objects, each with:
 *      { name, versionSpec, source, raw }
 *
 *  USED BY:
 *    - src/migrate/index.ts  (orchestrates the full scan)
 *
 *  DESIGN DECISION:
 *    Version specs are kept as raw strings (e.g. ">=1.9.0", "^2.0.0")
 *    and parsed later in deltaEngine.ts for comparison. This keeps
 *    the scanner focused on extraction only.
 * ═══════════════════════════════════════════════════════════════════
 */

import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

const LOG_SOURCE = 'RequirementScanner';

export type DependencySource = 'pip' | 'npm' | 'system' | 'engines';

export interface ProjectRequirement {
    /** Package or binary name (lowercased) */
    name: string;
    /** Version specifier as written (e.g. ">=1.9.0", "^2.0.0", "==1.21.0") */
    versionSpec: string;
    /** Where this requirement was declared */
    source: DependencySource;
    /** Raw line from the source file */
    raw: string;
}

/**
 * Parse a Python requirements.txt file.
 *
 * Handles formats:
 *   numpy==1.21.0
 *   torch>=1.9.0
 *   flask
 *   # comments
 *   -r other_requirements.txt  (ignored in MVP)
 */
function parseRequirementsTxt(filePath: string): ProjectRequirement[] {
    const logger = Logger.getInstance();
    const requirements: ProjectRequirement[] = [];

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        for (const rawLine of lines) {
            const line = rawLine.trim();

            // Skip empty lines, comments, and -r includes
            if (!line || line.startsWith('#') || line.startsWith('-')) {
                continue;
            }

            // Parse: package_name[extras]<op>version
            // Examples: numpy==1.21.0, torch>=1.9.0, flask, requests[security]>=2.28
            const match = line.match(/^([a-zA-Z0-9_\-]+)(?:\[.*?\])?\s*((?:[><=!~]+)\s*[\d.a-zA-Z*]+(?:\s*,\s*[><=!~]+\s*[\d.a-zA-Z*]+)*)?/);
            if (match) {
                requirements.push({
                    name: match[1].toLowerCase(),
                    versionSpec: match[2]?.trim() || '*',
                    source: 'pip',
                    raw: line,
                });
            }
        }

        logger.info(LOG_SOURCE, `Parsed ${requirements.length} requirements from requirements.txt`);
    } catch (err) {
        logger.warn(LOG_SOURCE, `Could not read requirements.txt: ${err}`);
    }

    return requirements;
}

/**
 * Parse a Node.js package.json file.
 *
 * Extracts:
 *   - dependencies
 *   - devDependencies
 *   - engines (node, npm version requirements)
 */
function parsePackageJson(filePath: string): ProjectRequirement[] {
    const logger = Logger.getInstance();
    const requirements: ProjectRequirement[] = [];

    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const pkg = JSON.parse(content);

        // Regular dependencies
        const allDeps: Record<string, string> = {
            ...(pkg.dependencies || {}),
            ...(pkg.devDependencies || {}),
        };

        for (const [name, version] of Object.entries(allDeps)) {
            requirements.push({
                name: name.toLowerCase(),
                versionSpec: version,
                source: 'npm',
                raw: `${name}: ${version}`,
            });
        }

        // Engine requirements (node, npm versions)
        if (pkg.engines) {
            for (const [engine, version] of Object.entries(pkg.engines)) {
                requirements.push({
                    name: engine.toLowerCase(),
                    versionSpec: version as string,
                    source: 'engines',
                    raw: `engines.${engine}: ${version}`,
                });
            }
        }

        logger.info(LOG_SOURCE, `Parsed ${requirements.length} requirements from package.json`);
    } catch (err) {
        logger.warn(LOG_SOURCE, `Could not read package.json: ${err}`);
    }

    return requirements;
}

/**
 * Scan the workspace root for all known dependency declaration files
 * and return a unified list of project requirements.
 */
export function scanProjectRequirements(workspaceRoot: string): ProjectRequirement[] {
    const logger = Logger.getInstance();
    const allRequirements: ProjectRequirement[] = [];

    logger.info(LOG_SOURCE, `Scanning project requirements in: ${workspaceRoot}`);

    // Check for Python requirements.txt
    const reqTxtPath = path.join(workspaceRoot, 'requirements.txt');
    if (fs.existsSync(reqTxtPath)) {
        allRequirements.push(...parseRequirementsTxt(reqTxtPath));
    }

    // Check for Node.js package.json
    const pkgJsonPath = path.join(workspaceRoot, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
        allRequirements.push(...parsePackageJson(pkgJsonPath));
    }

    // Check for setup.py (extract install_requires — basic support)
    const setupPyPath = path.join(workspaceRoot, 'setup.py');
    if (fs.existsSync(setupPyPath)) {
        try {
            const content = fs.readFileSync(setupPyPath, 'utf-8');
            const match = content.match(/install_requires\s*=\s*\[([\s\S]*?)\]/);
            if (match) {
                const deps = match[1].match(/'([^']+)'/g) || match[1].match(/"([^"]+)"/g) || [];
                for (const dep of deps) {
                    const clean = dep.replace(/['"]/g, '');
                    const nameMatch = clean.match(/^([a-zA-Z0-9_\-]+)(.*)/);
                    if (nameMatch) {
                        allRequirements.push({
                            name: nameMatch[1].toLowerCase(),
                            versionSpec: nameMatch[2]?.trim() || '*',
                            source: 'pip',
                            raw: clean,
                        });
                    }
                }
            }
            logger.info(LOG_SOURCE, 'Parsed setup.py install_requires');
        } catch {
            // skip
        }
    }

    // Check for pyproject.toml (basic support)
    const pyprojectPath = path.join(workspaceRoot, 'pyproject.toml');
    if (fs.existsSync(pyprojectPath)) {
        try {
            const content = fs.readFileSync(pyprojectPath, 'utf-8');
            const depSection = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
            if (depSection) {
                const deps = depSection[1].match(/"([^"]+)"/g) || [];
                for (const dep of deps) {
                    const clean = dep.replace(/"/g, '');
                    const nameMatch = clean.match(/^([a-zA-Z0-9_\-]+)(.*)/);
                    if (nameMatch) {
                        allRequirements.push({
                            name: nameMatch[1].toLowerCase(),
                            versionSpec: nameMatch[2]?.trim() || '*',
                            source: 'pip',
                            raw: clean,
                        });
                    }
                }
            }
        } catch {
            // skip
        }
    }

    logger.info(LOG_SOURCE, `Total requirements found: ${allRequirements.length}`);
    return allRequirements;
}
