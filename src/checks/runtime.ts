import fs from 'fs';
import path from 'path';
import { satisfiesSemver, cleanVersionString, parseSemver } from '../utils/semver.js';

export type CheckStatus = 'success' | 'warning' | 'error';

export interface NodeDeclaration {
    file: string;
    raw: string;
}

export interface NodeCheckResult {
    id: 'node-runtime';
    name: 'Node.js version';
    status: CheckStatus;
    currentVersion: string;
    formattedFound: string;
    declarations: NodeDeclaration[];
    requiredSummary?: string;
    fixInstruction?: string;
}

export function generateNodeFixInstruction(currentRaw: string, decls: NodeDeclaration[]): string {
    const cleanedCurrent = cleanVersionString(currentRaw);
    const parsedCurrent = parseSemver(cleanedCurrent);

    let targetMajor: number | undefined;
    const targetRawStr = decls[0]?.raw || '';

    const majorMatch = targetRawStr.match(/(?:>=|>|<=|<|\^|~|v)?\s*(\d+)/);
    if (majorMatch) {
        targetMajor = parseInt(majorMatch[1], 10);
    }

    let direction: 'older' | 'newer' | 'unknown' = 'unknown';

    if (parsedCurrent && targetMajor !== undefined) {
        if (parsedCurrent.major < targetMajor) {
            direction = 'older';
        } else if (parsedCurrent.major > targetMajor) {
            direction = 'newer';
        }
    }

    const exVersion = targetMajor !== undefined ? targetMajor : '20';
    const exampleLine = `Example: nvm install ${exVersion} && nvm use ${exVersion}`;

    if (direction === 'older') {
        return `Upgrade Node.js to a compatible version.\n${exampleLine}`;
    }
    if (direction === 'newer') {
        return `Switch to a compatible Node.js version.\n${exampleLine}`;
    }

    return `Switch to a Node.js version that satisfies the project requirement.`;
}

/**
 * Perform Node.js runtime compatibility check for a given project directory.
 */
export function checkNodeRuntime(projectDir: string = process.cwd()): NodeCheckResult {
    const currentRaw = process.version; // e.g. "v22.12.0"
    const cleanedCurrent = cleanVersionString(currentRaw);
    const parsedCurrent = parseSemver(cleanedCurrent);
    const formattedFound = parsedCurrent ? `Node ${parsedCurrent.major}.x` : `Node ${currentRaw}`;

    const declarations: NodeDeclaration[] = [];

    // 1. Check package.json engines.node
    const pkgPath = path.join(projectDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
        try {
            const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkgJson.engines && typeof pkgJson.engines.node === 'string') {
                declarations.push({
                    file: 'package.json engines.node',
                    raw: pkgJson.engines.node.trim(),
                });
            }
        } catch {
            // Ignore parse errors or read errors gracefully
        }
    }

    // 2. Check .nvmrc
    const nvmrcPath = path.join(projectDir, '.nvmrc');
    if (fs.existsSync(nvmrcPath)) {
        try {
            const rawContent = fs.readFileSync(nvmrcPath, 'utf8');
            const lines = rawContent.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            if (lines.length > 0) {
                declarations.push({
                    file: '.nvmrc',
                    raw: lines[0],
                });
            }
        } catch {
            // Ignore read errors
        }
    }

    // 3. Check .node-version
    const nodeVersionPath = path.join(projectDir, '.node-version');
    if (fs.existsSync(nodeVersionPath)) {
        try {
            const rawContent = fs.readFileSync(nodeVersionPath, 'utf8');
            const lines = rawContent.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            if (lines.length > 0) {
                declarations.push({
                    file: '.node-version',
                    raw: lines[0],
                });
            }
        } catch {
            // Ignore read errors
        }
    }

    // No declarations found
    if (declarations.length === 0) {
        return {
            id: 'node-runtime',
            name: 'Node.js version',
            status: 'success',
            currentVersion: currentRaw,
            formattedFound,
            declarations: [],
        };
    }

    // Check if current Node version satisfies all declarations
    const failedDeclarations: NodeDeclaration[] = [];
    for (const decl of declarations) {
        if (!satisfiesSemver(cleanedCurrent, decl.raw)) {
            failedDeclarations.push(decl);
        }
    }

    // Format required summary string
    let requiredSummary: string;
    if (declarations.length === 1) {
        requiredSummary = `Node ${declarations[0].raw}`;
    } else {
        requiredSummary = declarations.map(d => `${d.file} (${d.raw})`).join(', ');
    }

    if (failedDeclarations.length > 0) {
        return {
            id: 'node-runtime',
            name: 'Node.js version',
            status: 'error',
            currentVersion: currentRaw,
            formattedFound,
            declarations,
            requiredSummary,
            fixInstruction: generateNodeFixInstruction(currentRaw, declarations),
        };
    }

    return {
        id: 'node-runtime',
        name: 'Node.js version',
        status: 'success',
        currentVersion: currentRaw,
        formattedFound,
        declarations,
        requiredSummary,
    };
}
