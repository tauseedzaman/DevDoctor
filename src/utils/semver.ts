export interface SemVer {
    major: number;
    minor: number;
    patch: number;
}

/**
 * Clean a raw version string (e.g., "v22.12.0", "  20.10.0  ", "20.x")
 */
export function cleanVersionString(raw: string): string {
    return raw.trim().replace(/^v/i, '');
}

/**
 * Parse a semver string into major, minor, patch numbers.
 * Missing components default to 0.
 */
export function parseSemver(versionStr: string): SemVer | null {
    const cleaned = cleanVersionString(versionStr);
    const match = cleaned.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    if (!match) return null;

    return {
        major: parseInt(match[1], 10),
        minor: match[2] !== undefined ? parseInt(match[2], 10) : 0,
        patch: match[3] !== undefined ? parseInt(match[3], 10) : 0,
    };
}

/**
 * Compare two SemVer objects.
 * Returns -1 if a < b, 0 if a == b, 1 if a > b.
 */
export function compareSemver(a: SemVer, b: SemVer): number {
    if (a.major !== b.major) return a.major < b.major ? -1 : 1;
    if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
    if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
    return 0;
}

/**
 * Evaluate if a given version (e.g., "v22.12.0") satisfies a range requirement.
 * Supports:
 * - exact version ("20.10.0", "v20.10.0")
 * - major-only / wildcard ("20", "20.x", "20.*", "*", "lts/*", "latest")
 * - operators (">=", ">", "<=", "<", "=", "^", "~")
 * - combined ranges (">=18.0.0 <21.0.0")
 */
export function satisfiesSemver(currentVersionStr: string, rangeStr: string): boolean {
    const current = parseSemver(currentVersionStr);
    if (!current) return false;

    const trimmedRange = rangeStr.trim();

    // Wildcards and LTS indicators
    if (!trimmedRange || trimmedRange === '*' || trimmedRange.toLowerCase() === 'latest' || trimmedRange.toLowerCase().startsWith('lts/')) {
        return true;
    }

    // Handle logical OR ranges (e.g. "^18.0.0 || ^20.0.0")
    const orBranches = trimmedRange.split(/\s*\|\|\s*/).filter(Boolean);
    if (orBranches.length > 1) {
        return orBranches.some(branch => satisfiesSemver(currentVersionStr, branch));
    }

    // Split multiple clauses separated by spaces or commas (e.g., ">=18.0.0 <21.0.0")
    const clauses = trimmedRange.split(/\s+|,/).filter(Boolean);
    if (clauses.length > 1) {
        return clauses.every(clause => satisfiesSemver(currentVersionStr, clause));
    }

    const clause = clauses[0] || trimmedRange;

    // Check for operator prefix
    const opMatch = clause.match(/^(>=|<=|>|<|=|~|\^)?\s*(.*)$/);
    if (!opMatch) return false;

    const op = opMatch[1] || '=';
    const targetRaw = opMatch[2];

    // Handle x-ranges or wildcards like "20.x", "20.*", or major-only "20" (when no operator specified)
    if (/^\d+(\.[xX*])?$/.test(targetRaw) || (!opMatch[1] && /^\d+$/.test(targetRaw))) {
        const majorMatch = targetRaw.match(/^(\d+)/);
        if (majorMatch) {
            const reqMajor = parseInt(majorMatch[1], 10);
            if (op === '=') {
                return current.major === reqMajor;
            }
        }
    }

    const target = parseSemver(targetRaw);
    if (!target) return false;

    const cmp = compareSemver(current, target);

    switch (op) {
        case '>=':
            return cmp >= 0;
        case '>':
            return cmp > 0;
        case '<=':
            return cmp <= 0;
        case '<':
            return cmp < 0;
        case '=':
            return cmp === 0;
        case '^': {
            // Caret range: allows changes that do not modify left-most non-zero digit
            if (cmp < 0) return false;
            if (target.major > 0) {
                return current.major === target.major;
            } else if (target.minor > 0) {
                return current.minor === target.minor;
            } else {
                return current.patch === target.patch;
            }
        }
        case '~': {
            // Tilde range: allows patch-level changes if minor version is specified
            if (cmp < 0) return false;
            return current.major === target.major && current.minor === target.minor;
        }
        default:
            return cmp === 0;
    }
}
