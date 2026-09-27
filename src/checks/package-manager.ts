import fs from 'fs';
import path from 'path';

export type CheckStatus = 'success' | 'warning' | 'error';

export interface LockfileInfo {
    pm: string;
    filename: string;
}

export interface PackageManagerCheckResult {
    id: 'package-manager';
    name: 'Package manager';
    status: CheckStatus;
    title?: string;
    declaredRaw?: string;
    declaredPm?: string;
    detectedPm?: string;
    lockfiles: LockfileInfo[];
    conflictingLockfiles?: LockfileInfo[];
    matchingLockfile?: LockfileInfo;
    message?: string;
    fixInstruction?: string;
}

const SUPPORTED_PMS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

const KNOWN_LOCKFILES: { filename: string; pm: string }[] = [
    { filename: 'package-lock.json', pm: 'npm' },
    { filename: 'pnpm-lock.yaml', pm: 'pnpm' },
    { filename: 'yarn.lock', pm: 'yarn' },
    { filename: 'bun.lock', pm: 'bun' },
    { filename: 'bun.lockb', pm: 'bun' },
];

/**
 * Perform Package Manager / Lockfile consistency check for a given project directory.
 */
export function checkPackageManager(projectDir: string = process.cwd()): PackageManagerCheckResult {
    const lockfiles: LockfileInfo[] = [];

    // 1. Detect existing lockfiles
    for (const item of KNOWN_LOCKFILES) {
        const lockPath = path.join(projectDir, item.filename);
        if (fs.existsSync(lockPath)) {
            lockfiles.push({ pm: item.pm, filename: item.filename });
        }
    }

    // 2. Inspect package.json
    const pkgPath = path.join(projectDir, 'package.json');
    let pkgJson: Record<string, unknown> | null = null;
    let isMalformedJson = false;

    if (fs.existsSync(pkgPath)) {
        try {
            pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        } catch {
            isMalformedJson = true;
        }
    }

    if (isMalformedJson) {
        return {
            id: 'package-manager',
            name: 'Package manager',
            status: 'warning',
            lockfiles,
            message: 'Could not parse package.json.',
        };
    }

    // 3. Extract declared packageManager
    let declaredRaw: string | undefined;
    if (pkgJson) {
        if (typeof pkgJson.packageManager === 'string') {
            declaredRaw = pkgJson.packageManager.trim();
        } else if (
            pkgJson.engines &&
            typeof (pkgJson.engines as Record<string, unknown>).packageManager === 'string'
        ) {
            declaredRaw = ((pkgJson.engines as Record<string, unknown>).packageManager as string).trim();
        }
    }

    let declaredPm: string | undefined;
    if (declaredRaw) {
        // Parse e.g. "pnpm@10.0.0", "pnpm@10.0.0+sha512...", "pnpm"
        const match = declaredRaw.match(/^([A-Za-z0-9_-]+)(?:@.*)?$/);
        if (match) {
            declaredPm = match[1].toLowerCase();
        }
    }

    // Check if declared package manager is unsupported
    if (declaredPm && !SUPPORTED_PMS.has(declaredPm)) {
        return {
            id: 'package-manager',
            name: 'Package manager',
            status: 'warning',
            declaredRaw,
            declaredPm,
            lockfiles,
            message: `Unsupported package manager declared: ${declaredRaw}`,
        };
    }

    // 4. Case Analysis

    // Scenario A: Explicit packageManager declared
    if (declaredPm) {
        const matchingLocks = lockfiles.filter(l => l.pm === declaredPm);
        const conflictingLocks = lockfiles.filter(l => l.pm !== declaredPm);

        if (matchingLocks.length > 0 && conflictingLocks.length === 0) {
            // Perfect match (e.g. pnpm@10.0.0 + pnpm-lock.yaml)
            return {
                id: 'package-manager',
                name: 'Package manager',
                status: 'success',
                declaredRaw,
                declaredPm,
                lockfiles,
                matchingLockfile: matchingLocks[0],
            };
        }

        if (matchingLocks.length > 0 && conflictingLocks.length > 0) {
            // Explicit declaration + matching lockfile AND conflicting lockfile(s)
            const conflictNames = conflictingLocks.map(l => l.filename).join(', ');
            return {
                id: 'package-manager',
                name: 'Package manager',
                status: 'warning',
                title: 'Package manager mismatch',
                declaredRaw,
                declaredPm,
                lockfiles,
                matchingLockfile: matchingLocks[0],
                conflictingLockfiles: conflictingLocks,
                fixInstruction: `Remove conflicting lockfile(s) (${conflictNames}) and use ${declaredPm}.`,
            };
        }

        if (matchingLocks.length === 0 && conflictingLocks.length > 0) {
            // Explicit declaration but only conflicting lockfile(s) present
            const detectedNames = conflictingLocks.map(l => l.filename).join(', ');
            return {
                id: 'package-manager',
                name: 'Package manager',
                status: 'warning',
                title: 'Package manager mismatch',
                declaredRaw,
                declaredPm,
                lockfiles,
                conflictingLockfiles: conflictingLocks,
                fixInstruction: `Use ${declaredPm} for this project.\nRemove the conflicting lockfile (${detectedNames}) and run:\n\n${declaredPm} install`,
            };
        }

        if (lockfiles.length === 0) {
            // Explicit declaration but no lockfile present
            return {
                id: 'package-manager',
                name: 'Package manager',
                status: 'warning',
                title: 'Package manager lockfile missing',
                declaredRaw,
                declaredPm,
                lockfiles: [],
                fixInstruction: `Run '${declaredPm} install' to generate a ${declaredPm} lockfile.`,
            };
        }
    }

    // Scenario B: No packageManager declared
    if (lockfiles.length === 1) {
        // Single lockfile present -> infer PM
        const singleLock = lockfiles[0];
        return {
            id: 'package-manager',
            name: 'Package manager',
            status: 'success',
            detectedPm: singleLock.pm,
            lockfiles,
            matchingLockfile: singleLock,
        };
    }

    // Multiple lockfiles for same package manager (e.g. bun.lock and bun.lockb)
    const uniquePms = new Set(lockfiles.map(l => l.pm));
    if (lockfiles.length > 1 && uniquePms.size === 1) {
        const singlePm = Array.from(uniquePms)[0];
        return {
            id: 'package-manager',
            name: 'Package manager',
            status: 'success',
            detectedPm: singlePm,
            lockfiles,
        };
    }

    if (lockfiles.length > 1) {
        // Multiple lockfiles for different package managers
        return {
            id: 'package-manager',
            name: 'Package manager',
            status: 'warning',
            title: 'Multiple package manager lockfiles detected',
            lockfiles,
            message: 'Multiple lockfiles can cause different dependency trees to be installed.',
            fixInstruction: 'Keep the lockfile belonging to the package manager used by this project.',
        };
    }

    // No declaration and no lockfiles
    return {
        id: 'package-manager',
        name: 'Package manager',
        status: 'warning',
        lockfiles: [],
        message: "Could not determine the project's package manager.",
    };
}
