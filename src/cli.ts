#!/usr/bin/env node

import { checkNodeRuntime } from './checks/runtime.js';
import { checkEnvContract } from './checks/env-drift.js';
import { checkPackageManager } from './checks/package-manager.js';
import { checkToolchain } from './checks/toolchain.js';
import { checkBootPrerequisites } from './checks/boot-prerequisites.js';
import {
    formatNodeResult,
    formatEnvResult,
    formatPackageManagerResult,
    formatToolchainResult,
    formatBootPrerequisitesResult,
    calculateGlobalSummaryCounts,
    formatGlobalFooter,
} from './output.js';

const VERSION = '0.1.0';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🩺 DevDoctor v${VERSION}
Diagnose why a project won't run on your machine or CI.

USAGE
  $ npx devdoctor [command] [options]

COMMANDS
  check       Run all diagnostic checks against the current repository (default)

OPTIONS
  -h, --help     Show CLI help
  -v, --version  Show CLI version

SAFETY
  - Does not install packages or modify project files
  - Does not execute arbitrary shell strings or application scripts
  - Never prints secret values or environment variable contents
`);
    process.exit(0);
}

if (args.includes('--version') || args.includes('-v')) {
    console.log(`devdoctor v${VERSION}`);
    process.exit(0);
}

const command = args[0];
if (command && command !== 'check' && !command.startsWith('-')) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "npx devdoctor --help" for available commands.');
    process.exit(1);
}

console.log('');
console.log('🩺 DevDoctor');
console.log('');
console.log('Diagnosing your project...');
console.log('');

// 1. Node Runtime Check
const nodeResult = checkNodeRuntime(process.cwd());
console.log(formatNodeResult(nodeResult));
console.log('');

// 2. Environment Contract Check
const envResult = checkEnvContract(process.cwd());
const envBlocks = formatEnvResult(envResult);

for (const block of envBlocks) {
    console.log(block);
    console.log('');
}

// 3. Package Manager Check
const pmResult = checkPackageManager(process.cwd());
console.log(formatPackageManagerResult(pmResult));
console.log('');

// 4. Project Runtime / Toolchain Check
const toolchainResult = checkToolchain(process.cwd());
const toolchainBlocks = formatToolchainResult(toolchainResult);

for (const block of toolchainBlocks) {
    console.log(block);
    console.log('');
}

// 5. Boot Prerequisites Check
const bootResult = checkBootPrerequisites(process.cwd());
const bootBlocks = formatBootPrerequisitesResult(bootResult);

for (const block of bootBlocks) {
    console.log(block);
    console.log('');
}

// Global Footer Summary
const counts = calculateGlobalSummaryCounts(
    nodeResult,
    envResult,
    pmResult,
    toolchainResult,
    bootResult
);
console.log(formatGlobalFooter(counts));
console.log('');

// Exit code calculation: 1 for error status, 0 for success/warning
const hasFailure =
    nodeResult.status === 'error' ||
    envResult.status === 'error' ||
    pmResult.status === 'error' ||
    toolchainResult.status === 'error' ||
    bootResult.status === 'error';

if (hasFailure) {
    process.exit(1);
}