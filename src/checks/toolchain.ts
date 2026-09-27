import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { satisfiesSemver, cleanVersionString, parseSemver } from '../utils/semver.js';

export type CheckStatus = 'success' | 'warning' | 'error';

export interface ToolchainItemResult {
    tool: 'python' | 'ruby' | 'php' | 'node';
    name: string; // e.g. "Python", "Ruby", "PHP", "Node.js"
    status: CheckStatus;
    declaredRaw: string;
    sourceFile: string; // e.g. ".python-version", "composer.json", ".tool-versions"
    installedVersion?: string; // e.g. "3.12.1"
    formattedFound: string; // e.g. "Python 3.12.x" or "Python not installed"
    fixInstruction?: string;
}

export interface ToolchainCheckResult {
    id: 'toolchain';
    name: 'Project runtimes';
    status: CheckStatus;
    items: ToolchainItemResult[];
}

export interface DeclaredRuntime {
    tool: 'python' | 'ruby' | 'php' | 'node';
    name: string;
    declaredRaw: string;
    sourceFile: string;
}

/**
 * Safely query installed version of Python.
 */
export function getInstalledPythonVersion(): string | null {
    for (const cmd of ['python3', 'python']) {
        try {
            const output = execFileSync(cmd, ['--version'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                encoding: 'utf8',
                timeout: 2000,
            });
            const match = (output || '').match(/Python\s+(\d+\.\d+\.\d+)/i);
            if (match) {
                return match[1];
            }
        } catch {
            // Executable missing or failed
        }
    }
    return null;
}

/**
 * Safely query installed version of Ruby.
 */
export function getInstalledRubyVersion(): string | null {
    try {
        const output = execFileSync('ruby', ['--version'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8',
            timeout: 2000,
        });
        const match = (output || '').match(/ruby\s+(\d+\.\d+\.\d+)/i);
        if (match) {
            return match[1];
        }
    } catch {
        // Executable missing
    }
    return null;
}

/**
 * Safely query installed version of PHP.
 */
export function getInstalledPhpVersion(): string | null {
    try {
        const output = execFileSync('php', ['--version'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            encoding: 'utf8',
            timeout: 2000,
        });
        const match = (output || '').match(/PHP\s+(\d+\.\d+\.\d+)/i);
        if (match) {
            return match[1];
        }
    } catch {
        // Executable missing
    }
    return null;
}

/**
 * Get installed version of Node.js.
 */
export function getInstalledNodeVersion(): string | null {
    return cleanVersionString(process.version);
}

/**
 * Parse declared runtimes in a project directory.
 */
export function detectDeclaredRuntimes(projectDir: string): DeclaredRuntime[] {
    const declarations: DeclaredRuntime[] = [];

    // 1. .python-version
    const pyVerPath = path.join(projectDir, '.python-version');
    if (fs.existsSync(pyVerPath)) {
        try {
            const raw = fs.readFileSync(pyVerPath, 'utf8');
            const firstLine = raw.split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('#'));
            if (firstLine) {
                declarations.push({
                    tool: 'python',
                    name: 'Python',
                    declaredRaw: firstLine,
                    sourceFile: '.python-version',
                });
            }
        } catch { }
    }

    // 2. .ruby-version
    const rubyVerPath = path.join(projectDir, '.ruby-version');
    if (fs.existsSync(rubyVerPath)) {
        try {
            const raw = fs.readFileSync(rubyVerPath, 'utf8');
            const firstLine = raw.split(/\r?\n/).map(l => l.trim()).find(l => l && !l.startsWith('#'));
            if (firstLine) {
                declarations.push({
                    tool: 'ruby',
                    name: 'Ruby',
                    declaredRaw: firstLine,
                    sourceFile: '.ruby-version',
                });
            }
        } catch { }
    }

    // 3. composer.json (PHP requirement)
    const composerPath = path.join(projectDir, 'composer.json');
    if (fs.existsSync(composerPath)) {
        try {
            const raw = fs.readFileSync(composerPath, 'utf8');
            const json = JSON.parse(raw);
            if (json && typeof json.require === 'object' && json.require) {
                const phpReq = json.require.php || json.require.PHP;
                if (typeof phpReq === 'string' && phpReq.trim()) {
                    declarations.push({
                        tool: 'php',
                        name: 'PHP',
                        declaredRaw: phpReq.trim(),
                        sourceFile: 'composer.json',
                    });
                }
            }
        } catch { }
    }

    // 4. .tool-versions (asdf / mise)
    const toolVerPath = path.join(projectDir, '.tool-versions');
    if (fs.existsSync(toolVerPath)) {
        try {
            const raw = fs.readFileSync(toolVerPath, 'utf8');
            const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            for (const line of lines) {
                const parts = line.split(/\s+/);
                if (parts.length >= 2) {
                    const toolName = parts[0].toLowerCase();
                    const toolVer = parts[1];

                    if (toolName === 'python' && !declarations.some(d => d.tool === 'python')) {
                        declarations.push({
                            tool: 'python',
                            name: 'Python',
                            declaredRaw: toolVer,
                            sourceFile: '.tool-versions',
                        });
                    } else if (toolName === 'ruby' && !declarations.some(d => d.tool === 'ruby')) {
                        declarations.push({
                            tool: 'ruby',
                            name: 'Ruby',
                            declaredRaw: toolVer,
                            sourceFile: '.tool-versions',
                        });
                    } else if (toolName === 'php' && !declarations.some(d => d.tool === 'php')) {
                        declarations.push({
                            tool: 'php',
                            name: 'PHP',
                            declaredRaw: toolVer,
                            sourceFile: '.tool-versions',
                        });
                    } else if ((toolName === 'nodejs' || toolName === 'node') && !declarations.some(d => d.tool === 'node')) {
                        declarations.push({
                            tool: 'node',
                            name: 'Node.js',
                            declaredRaw: toolVer,
                            sourceFile: '.tool-versions',
                        });
                    }
                }
            }
        } catch { }
    }

    return declarations;
}

/**
 * Run Toolchain check for a given project directory.
 */
export function checkToolchain(
    projectDir: string = process.cwd(),
    customCheckers?: {
        python?: () => string | null;
        ruby?: () => string | null;
        php?: () => string | null;
        node?: () => string | null;
    }
): ToolchainCheckResult {
    const declarations = detectDeclaredRuntimes(projectDir);
    const items: ToolchainItemResult[] = [];

    const getPython = customCheckers?.python || getInstalledPythonVersion;
    const getRuby = customCheckers?.ruby || getInstalledRubyVersion;
    const getPhp = customCheckers?.php || getInstalledPhpVersion;
    const getNode = customCheckers?.node || getInstalledNodeVersion;

    for (const decl of declarations) {
        let installedVer: string | null = null;
        if (decl.tool === 'python') installedVer = getPython();
        else if (decl.tool === 'ruby') installedVer = getRuby();
        else if (decl.tool === 'php') installedVer = getPhp();
        else if (decl.tool === 'node') installedVer = getNode();

        if (!installedVer) {
            // Runtime executable not installed
            items.push({
                tool: decl.tool,
                name: decl.name,
                status: 'error',
                declaredRaw: decl.declaredRaw,
                sourceFile: decl.sourceFile,
                formattedFound: `${decl.name} not installed`,
                fixInstruction: `Install ${decl.name} ${decl.declaredRaw} or activate the project's configured runtime.`,
            });
            continue;
        }

        const parsedInstalled = parseSemver(cleanVersionString(installedVer));
        const formattedFound = parsedInstalled
            ? `${decl.name} ${parsedInstalled.major}.${parsedInstalled.minor}.x`
            : `${decl.name} ${installedVer}`;

        if (!satisfiesSemver(installedVer, decl.declaredRaw)) {
            // Version mismatch
            items.push({
                tool: decl.tool,
                name: decl.name,
                status: 'error',
                declaredRaw: decl.declaredRaw,
                sourceFile: decl.sourceFile,
                installedVersion: installedVer,
                formattedFound,
                fixInstruction: `Switch to a ${decl.name} version that satisfies the project requirement.`,
            });
        } else {
            // Success
            items.push({
                tool: decl.tool,
                name: decl.name,
                status: 'success',
                declaredRaw: decl.declaredRaw,
                sourceFile: decl.sourceFile,
                installedVersion: installedVer,
                formattedFound,
            });
        }
    }

    let status: CheckStatus = 'success';
    if (items.some(i => i.status === 'error')) {
        status = 'error';
    } else if (items.some(i => i.status === 'warning')) {
        status = 'warning';
    }

    return {
        id: 'toolchain',
        name: 'Project runtimes',
        status,
        items,
    };
}
