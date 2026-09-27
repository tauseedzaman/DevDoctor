import { NodeCheckResult } from './checks/runtime.js';
import { EnvCheckResult } from './checks/env-drift.js';
import { PackageManagerCheckResult } from './checks/package-manager.js';
import { ToolchainCheckResult } from './checks/toolchain.js';
import { BootPrerequisitesCheckResult } from './checks/boot-prerequisites.js';

export function formatNodeResult(result: NodeCheckResult): string {
    const lines: string[] = [];

    switch (result.status) {
        case 'error': {
            lines.push(`✖ ${result.name} mismatch`);
            lines.push('');
            if (result.requiredSummary) {
                lines.push(`  Required: ${result.requiredSummary}`);
                lines.push(`  Found:    ${result.formattedFound}`);
            } else {
                lines.push(`  Found:    ${result.formattedFound}`);
            }

            if (result.fixInstruction) {
                lines.push('');
                lines.push('  Fix:');
                const fixLines = result.fixInstruction.split('\n');
                for (const fl of fixLines) {
                    lines.push(`    ${fl}`);
                }
            }
            break;
        }
        case 'warning': {
            lines.push(`⚠ ${result.name}`);
            lines.push('');
            lines.push('  No Node.js version requirement detected.');
            lines.push(`  Found: ${result.formattedFound}`);
            break;
        }
        case 'success': {
            lines.push(`✓ ${result.name}`);
            lines.push('');
            if (result.requiredSummary) {
                lines.push(`  Required: ${result.requiredSummary}`);
                lines.push(`  Found:    ${result.formattedFound}`);
            } else {
                lines.push('  No Node.js version requirement declared.');
                lines.push(`  Found:    ${result.formattedFound}`);
            }
            break;
        }
    }

    return lines.join('\n');
}

export function formatEnvResult(result: EnvCheckResult): string[] {
    const blocks: string[] = [];

    // Format Git Security Issue if present
    if (result.gitSecurityIssue) {
        const secLines: string[] = [];
        secLines.push('✖ Environment security');
        secLines.push('');
        secLines.push(`  ${result.gitSecurityIssue.message}`);
        if (result.gitSecurityIssue.fixInstruction) {
            secLines.push('');
            secLines.push('  Fix:');
            const fixLines = result.gitSecurityIssue.fixInstruction.split('\n');
            for (const fl of fixLines) {
                secLines.push(`    ${fl}`);
            }
        }
        blocks.push(secLines.join('\n'));
    }

    // Format Environment Contract Findings
    if (result.findings.length > 0) {
        const contractLines: string[] = [];
        contractLines.push('⚠ Environment contract');
        contractLines.push('');

        const formattedFindingBlocks: string[] = [];

        for (const f of result.findings) {
            const fLines: string[] = [];
            const msgLines = f.message.split('\n');
            for (const ml of msgLines) {
                fLines.push(`  ${ml}`);
            }
            if (f.fixInstruction) {
                fLines.push('');
                fLines.push('  Fix:');
                const fixLines = f.fixInstruction.split('\n');
                for (const fl of fixLines) {
                    fLines.push(`    ${fl}`);
                }
            }
            formattedFindingBlocks.push(fLines.join('\n'));
        }

        contractLines.push(formattedFindingBlocks.join('\n\n'));
        blocks.push(contractLines.join('\n'));
    } else if (!result.gitSecurityIssue) {
        const okLines: string[] = [];
        okLines.push('✓ Environment contract');
        okLines.push('');
        if (result.hasEnvExample) {
            okLines.push('  Environment contract is consistent and documented.');
        } else {
            okLines.push('  No .env.example file found.');
            okLines.push('  No environment contract to validate.');
        }
        blocks.push(okLines.join('\n'));
    }

    return blocks;
}

export function formatPackageManagerResult(result: PackageManagerCheckResult): string {
    const lines: string[] = [];

    const icon = result.status === 'success' ? '✓' : '⚠';
    const headerTitle = result.title || result.name;

    lines.push(`${icon} ${headerTitle}`);
    lines.push('');

    if (result.status === 'success') {
        if (result.declaredRaw) {
            lines.push(`  Declared: ${result.declaredRaw}`);
        } else if (result.detectedPm) {
            lines.push(`  Detected: ${result.detectedPm}`);
        }

        if (result.lockfiles.length > 0) {
            const lockNames = result.lockfiles.map(l => l.filename).join(', ');
            lines.push(`  Lockfile: ${lockNames}`);
        }
    } else {
        // Warning / Mismatch state
        if (result.declaredRaw) {
            lines.push(`  Declared: ${result.declaredRaw}`);
        }

        if (result.matchingLockfile) {
            lines.push(`  Lockfile: ${result.matchingLockfile.filename}`);
        }

        if (result.conflictingLockfiles && result.conflictingLockfiles.length > 0) {
            if (result.matchingLockfile) {
                const conflictNames = result.conflictingLockfiles.map(l => l.filename).join(', ');
                lines.push(`  Conflicting lockfile: ${conflictNames}`);
            } else {
                const detectedNames = result.conflictingLockfiles.map(l => l.filename).join(', ');
                lines.push(`  Detected lockfile: ${detectedNames}`);
            }
        } else if (result.lockfiles.length > 1 && !result.declaredRaw) {
            // Multiple lockfiles without explicit declaration
            for (const l of result.lockfiles) {
                lines.push(`  ${l.pm}: ${l.filename}`);
            }
        }

        if (result.message) {
            lines.push('');
            const msgLines = result.message.split('\n');
            for (const ml of msgLines) {
                lines.push(`  ${ml}`);
            }
        }

        if (result.fixInstruction) {
            lines.push('');
            lines.push('  Fix:');
            const fixLines = result.fixInstruction.split('\n');
            for (const fl of fixLines) {
                lines.push(`    ${fl}`);
            }
        }
    }

    return lines.join('\n');
}

export function formatToolchainResult(result: ToolchainCheckResult): string[] {
    const blocks: string[] = [];

    for (const item of result.items) {
        const lines: string[] = [];

        if (item.status === 'error') {
            const isMissing = item.formattedFound.includes('not installed');
            const headerTitle = isMissing ? `${item.name} runtime missing` : `${item.name} version mismatch`;

            lines.push(`✖ ${headerTitle}`);
            lines.push('');
            lines.push(`  Required: ${item.name} ${item.declaredRaw}`);
            lines.push(`  Found:    ${item.formattedFound}`);

            if (item.fixInstruction) {
                lines.push('');
                lines.push('  Fix:');
                const fixLines = item.fixInstruction.split('\n');
                for (const fl of fixLines) {
                    lines.push(`    ${fl}`);
                }
            }
        } else if (item.status === 'warning') {
            lines.push(`⚠ ${item.name} runtime`);
            lines.push('');
            lines.push(`  Required: ${item.name} ${item.declaredRaw}`);
            lines.push(`  Found:    ${item.formattedFound}`);

            if (item.fixInstruction) {
                lines.push('');
                lines.push('  Fix:');
                const fixLines = item.fixInstruction.split('\n');
                for (const fl of fixLines) {
                    lines.push(`    ${fl}`);
                }
            }
        } else {
            lines.push(`✓ ${item.name} runtime`);
            lines.push('');
            lines.push(`  Required: ${item.name} ${item.declaredRaw}`);
            lines.push(`  Found:    ${item.formattedFound}`);
        }

        blocks.push(lines.join('\n'));
    }

    return blocks;
}

export function formatBootPrerequisitesResult(result: BootPrerequisitesCheckResult): string[] {
    const blocks: string[] = [];

    if (result.items.length === 0) {
        return blocks;
    }

    const errorItems = result.items.filter(i => i.status === 'error');
    const nonErrorItems = result.items.filter(i => i.status !== 'error');

    for (const item of errorItems) {
        const lines: string[] = [];
        lines.push(`✖ ${item.message}`);
        lines.push('');

        if (item.details) {
            for (const d of item.details) {
                lines.push(`  ${d}`);
            }
        }

        if (item.fixInstruction) {
            lines.push('');
            lines.push('  Fix:');
            const fixLines = item.fixInstruction.split('\n');
            for (const fl of fixLines) {
                lines.push(`    ${fl}`);
            }
        }

        blocks.push(lines.join('\n'));
    }

    if (nonErrorItems.length > 0) {
        const lines: string[] = [];
        const hasWarning = nonErrorItems.some(i => i.status === 'warning');
        const icon = hasWarning ? '⚠' : '✓';

        lines.push(`${icon} ${result.name}`);
        lines.push('');

        for (const item of nonErrorItems) {
            if (item.status === 'warning') {
                lines.push(`  ${item.message}`);
                if (item.fixInstruction) {
                    lines.push('');
                    lines.push('  Fix:');
                    const fixLines = item.fixInstruction.split('\n');
                    for (const fl of fixLines) {
                        lines.push(`    ${fl}`);
                    }
                }
            } else {
                lines.push(`  ${item.message}`);
                if (item.details) {
                    for (const d of item.details) {
                        lines.push(`    ${d}`);
                    }
                }
            }
        }

        blocks.push(lines.join('\n'));
    }

    return blocks;
}

export interface GlobalSummaryCounts {
    errors: number;
    warnings: number;
    total: number;
}

export function calculateGlobalSummaryCounts(
    nodeResult: NodeCheckResult,
    envResult: EnvCheckResult,
    pmResult: PackageManagerCheckResult,
    toolchainResult?: ToolchainCheckResult,
    bootResult?: BootPrerequisitesCheckResult
): GlobalSummaryCounts {
    let errors = 0;
    let warnings = 0;

    // Node runtime
    if (nodeResult.status === 'error') {
        errors += 1;
    } else if (nodeResult.status === 'warning') {
        warnings += 1;
    }

    // Environment contract
    if (envResult.gitSecurityIssue) {
        errors += 1;
    }
    if (envResult.findings.length > 0) {
        warnings += envResult.findings.length;
    }

    // Package manager
    if (pmResult.status === 'error') {
        errors += 1;
    } else if (pmResult.status === 'warning') {
        warnings += 1;
    }

    // Toolchain items
    if (toolchainResult) {
        for (const item of toolchainResult.items) {
            if (item.status === 'error') {
                errors += 1;
            } else if (item.status === 'warning') {
                warnings += 1;
            }
        }
    }

    // Boot prerequisites items
    if (bootResult) {
        for (const item of bootResult.items) {
            if (item.status === 'error') {
                errors += 1;
            } else if (item.status === 'warning') {
                warnings += 1;
            }
        }
    }

    return {
        errors,
        warnings,
        total: errors + warnings,
    };
}

export function formatGlobalFooter(counts: GlobalSummaryCounts): string {
    const lines: string[] = [];
    lines.push('────────────────────────────');
    lines.push('');

    if (counts.total === 0) {
        lines.push('✓ No problems detected');
    } else {
        const issueText = `${counts.total} issue${counts.total === 1 ? '' : 's'} found`;
        lines.push(issueText);

        if (counts.errors > 0) {
            lines.push(`  ✖ ${counts.errors} error${counts.errors === 1 ? '' : 's'}`);
        }
        if (counts.warnings > 0) {
            lines.push(`  ⚠ ${counts.warnings} warning${counts.warnings === 1 ? '' : 's'}`);
        }
    }

    return lines.join('\n');
}
