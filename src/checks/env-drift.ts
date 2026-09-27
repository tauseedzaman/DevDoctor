import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export type EnvFindingType =
    | 'used_not_documented'
    | 'documented_not_used'
    | 'env_not_documented'
    | 'documented_missing_env'
    | 'missing_env_example'
    | 'env_not_ignored'
    | 'env_git_tracked';

export interface EnvFinding {
    type: EnvFindingType;
    variable?: string;
    message: string;
    fixInstruction?: string;
}

export interface EnvCheckResult {
    id: 'env-contract';
    name: 'Environment contract';
    status: 'warning' | 'error' | 'success';
    findings: EnvFinding[];
    gitSecurityIssue?: EnvFinding;
    hasEnvExample?: boolean;
}

const IGNORED_DIRS = new Set([
    'node_modules',
    'vendor',
    '.git',
    'dist',
    'build',
    '.next',
    'coverage',
    'storage',
    'cache',
    'public/build',
    '.devdoctor',
    '.gemini',
    '.brain',
    'tmp',
]);

const SCANNED_EXTENSIONS = new Set([
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.cjs',
    '.php',
    '.py',
]);

/**
 * Extract environment variable names from a file's content based on standard syntax.
 * NEVER extracts or stores variable values.
 */

export function extractEnvVarsFromCode(content: string): Set<string> {
    const vars = new Set<string>();

    // JS/TS: process.env.FOO, process.env["FOO"], process.env['FOO']
    const jsDotMatches = content.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g);
    for (const m of jsDotMatches) {
        vars.add(m[1]);
    }

    const jsBracketMatches = content.matchAll(/process\.env\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g);
    for (const m of jsBracketMatches) {
        vars.add(m[1]);
    }

    // PHP/Laravel: env('FOO'), env("FOO")
    const phpMatches = content.matchAll(/\benv\(['"]([A-Za-z_][A-Za-z0-9_]*)['"]\)/g);
    for (const m of phpMatches) {
        vars.add(m[1]);
    }

    // Python: os.getenv("FOO"), os.environ.get("FOO"), os.environ["FOO"]
    const pyGetEnvMatches = content.matchAll(/os\.getenv\(['"]([A-Za-z_][A-Za-z0-9_]*)['"]\)/g);
    for (const m of pyGetEnvMatches) {
        vars.add(m[1]);
    }

    const pyEnvironGetMatches = content.matchAll(/os\.environ\.get\(['"]([A-Za-z_][A-Za-z0-9_]*)['"]\)/g);
    for (const m of pyEnvironGetMatches) {
        vars.add(m[1]);
    }

    const pyEnvironBracketMatches = content.matchAll(/os\.environ\[['"]([A-Za-z_][A-Za-z0-9_]*)['"]\]/g);
    for (const m of pyEnvironBracketMatches) {
        vars.add(m[1]);
    }

    return vars;
}

/**
 * Parse variable keys from a .env or .env.example file content.
 * NEVER stores values.
 */
export function parseEnvKeys(fileContent: string): Set<string> {
    const keys = new Set<string>();
    const lines = fileContent.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Match lines like KEY=value, KEY=, export KEY=value
        const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
        if (match) {
            keys.add(match[1]);
        }
    }

    return keys;
}

/**
 * Recursively scan project directory for source code environment variable usages.
 */
export function scanProjectEnvVars(dirPath: string): Set<string> {
    const usedVars = new Set<string>();

    function walk(currentDir: string) {
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
                    walk(fullPath);
                }
            } else if (entry.isFile()) {
                const ext = path.extname(entry.name);
                if (SCANNED_EXTENSIONS.has(ext)) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const foundInFile = extractEnvVarsFromCode(content);
                        foundInFile.forEach(v => usedVars.add(v));
                    } catch {
                        // Ignore read errors
                    }
                }
            }
        }
    }

    walk(dirPath);
    return usedVars;
}

export interface GitSecurityCheckResult {
    gitSecurityIssue?: EnvFinding;
    gitSecurityWarning?: EnvFinding;
}

/**
 * Check if .env is actually tracked by Git or missing from .gitignore.
 */
export function checkDotEnvGitSecurity(projectDir: string): GitSecurityCheckResult {
    let isTracked = false;
    let isIgnored = false;

    // 1. Check Git metadata safely using git ls-files and git check-ignore
    try {
        const lsOutput = execFileSync('git', ['ls-files', '.env'], {
            cwd: projectDir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();

        if (lsOutput.split(/\r?\n/).some(line => line.trim() === '.env')) {
            isTracked = true;
        }

        execFileSync('git', ['check-ignore', '-q', '.env'], {
            cwd: projectDir,
            stdio: ['ignore', 'ignore', 'ignore'],
        });
        isIgnored = true;
    } catch {
        // If git commands fail or return non-zero exit codes, handle gracefully
    }

    // 2. State 4/5/6: Actually tracked by Git index (even if deleted from disk) -> ERROR
    if (isTracked) {
        return {
            gitSecurityIssue: {
                type: 'env_git_tracked',
                message: '.env appears to be tracked by Git.',
                fixInstruction: 'Add .env to .gitignore\ngit rm --cached .env',
            },
        };
    }

    // 3. If not tracked in Git index, check local disk file presence
    const envPath = path.join(projectDir, '.env');
    if (!fs.existsSync(envPath)) {
        return {};
    }

    // 4. Static .gitignore fallback check if git check-ignore did not mark it as ignored
    if (!isIgnored) {
        const gitignorePath = path.join(projectDir, '.gitignore');
        if (fs.existsSync(gitignorePath)) {
            try {
                const content = fs.readFileSync(gitignorePath, 'utf8');
                const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                for (const line of lines) {
                    if (
                        line === '.env' ||
                        line === '.env*' ||
                        line === '.env.*' ||
                        line === '*.env' ||
                        line.startsWith('.env')
                    ) {
                        isIgnored = true;
                        break;
                    }
                }
            } catch {
                // Ignore read error
            }
        }
    }

    // 5. State 3: Exists on disk and not ignored in .gitignore, but NOT tracked -> WARNING
    if (!isIgnored) {
        return {
            gitSecurityWarning: {
                type: 'env_not_ignored',
                message: '.env exists but is not ignored in .gitignore.',
                fixInstruction: 'Add .env to .gitignore',
            },
        };
    }

    // State 2: Exists on disk and properly ignored -> SUCCESS
    return {};
}

/**
 * Perform Environment Contract Check for a given project directory.
 */
export function checkEnvContract(projectDir: string = process.cwd()): EnvCheckResult {
    const findings: EnvFinding[] = [];

    const envExamplePath = path.join(projectDir, '.env.example');
    const envPath = path.join(projectDir, '.env');

    const hasEnvExample = fs.existsSync(envExamplePath);
    const hasEnv = fs.existsSync(envPath);

    // 1. Check Git security hygiene for .env
    const { gitSecurityIssue, gitSecurityWarning } = checkDotEnvGitSecurity(projectDir);

    if (gitSecurityWarning) {
        findings.push(gitSecurityWarning);
    }

    // 2. Scan source code for environment variable references
    const usedInCode = scanProjectEnvVars(projectDir);

    // 3. Parse .env.example keys
    let exampleKeys = new Set<string>();
    if (hasEnvExample) {
        try {
            const content = fs.readFileSync(envExamplePath, 'utf8');
            exampleKeys = parseEnvKeys(content);
        } catch {
            // Ignore read errors
        }
    }

    // 4. Parse .env keys
    let envKeys = new Set<string>();
    if (hasEnv) {
        try {
            const content = fs.readFileSync(envPath, 'utf8');
            envKeys = parseEnvKeys(content);
        } catch {
            // Ignore read errors
        }
    }

    if (hasEnvExample) {
        // Category A: USED BUT NOT DOCUMENTED
        for (const v of usedInCode) {
            if (!exampleKeys.has(v)) {
                findings.push({
                    type: 'used_not_documented',
                    variable: v,
                    message: `${v} is used by the application\nbut is missing from .env.example.`,
                    fixInstruction: `Add ${v}= to .env.example`,
                });
            }
        }

        // Category B: DOCUMENTED BUT NOT USED
        for (const k of exampleKeys) {
            if (!usedInCode.has(k)) {
                findings.push({
                    type: 'documented_not_used',
                    variable: k,
                    message: `${k} exists in .env.example\nbut was not detected in source code.`,
                });
            }
        }

        // Category C: PRESENT LOCALLY BUT NOT DOCUMENTED
        if (hasEnv) {
            for (const k of envKeys) {
                if (!exampleKeys.has(k)) {
                    findings.push({
                        type: 'env_not_documented',
                        variable: k,
                        message: `${k} exists in .env but is missing from .env.example.`,
                    });
                }
            }
        }

        // Category D: DOCUMENTED BUT MISSING LOCALLY
        if (hasEnv) {
            for (const k of exampleKeys) {
                if (!envKeys.has(k)) {
                    findings.push({
                        type: 'documented_missing_env',
                        variable: k,
                        message: `${k} is documented in .env.example\nbut is missing from .env.`,
                    });
                }
            }
        }
    }

    let status: 'warning' | 'error' | 'success' = 'success';
    if (gitSecurityIssue) {
        status = 'error';
    } else if (findings.length > 0) {
        status = 'warning';
    }

    return {
        id: 'env-contract',
        name: 'Environment contract',
        status,
        findings,
        gitSecurityIssue,
        hasEnvExample,
    };
}
