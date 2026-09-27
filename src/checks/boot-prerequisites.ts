import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export type CheckStatus = 'success' | 'warning' | 'error';

export interface BootItemResult {
    id: string;
    name: string;
    status: CheckStatus;
    message: string;
    fixInstruction?: string;
    details?: string[];
}

export interface BootPrerequisitesCheckResult {
    id: 'boot-prerequisites';
    name: 'Boot prerequisites';
    status: CheckStatus;
    items: BootItemResult[];
}

/**
 * Safely check if docker executable is available.
 */
export function checkDockerAvailable(): boolean {
    try {
        execFileSync('docker', ['--version'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 2000,
        });
        return true;
    } catch {
        return false;
    }
}

/**
 * Safely check if docker compose sub-command or executable is available.
 */
export function checkDockerComposeAvailable(): boolean {
    try {
        execFileSync('docker', ['compose', 'version'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            timeout: 2000,
        });
        return true;
    } catch {
        try {
            execFileSync('docker-compose', ['--version'], {
                stdio: ['pipe', 'pipe', 'pipe'],
                timeout: 2000,
            });
            return true;
        } catch {
            return false;
        }
    }
}

const SUPPORTED_BOOTSTRAP_COMMANDS = [
    'npm install',
    'pnpm install',
    'yarn install',
    'bun install',
    'composer install',
    'pip install',
    'pip3 install',
];

/**
 * Perform Boot Prerequisites check for a given project directory.
 */
export function checkBootPrerequisites(
    projectDir: string = process.cwd(),
    customCheckers?: {
        isDockerAvailable?: () => boolean;
        isDockerComposeAvailable?: () => boolean;
    }
): BootPrerequisitesCheckResult {
    const items: BootItemResult[] = [];

    // 1. Environment Bootstrap Check
    const envExamplePath = path.join(projectDir, '.env.example');
    if (fs.existsSync(envExamplePath)) {
        const envPath = path.join(projectDir, '.env');
        if (fs.existsSync(envPath)) {
            items.push({
                id: 'env-bootstrap',
                name: 'Environment bootstrap',
                status: 'success',
                message: '.env exists',
            });
        } else {
            items.push({
                id: 'env-bootstrap',
                name: 'Environment bootstrap',
                status: 'warning',
                message: '.env.example exists but .env is missing.',
                fixInstruction: 'Copy .env.example to .env and configure the required values.',
            });
        }
    }

    // 2. Docker Compose Prerequisites Check
    const composeCandidates = [
        'compose.yaml',
        'compose.yml',
        'docker-compose.yml',
        'docker-compose.yaml',
    ];
    let foundComposeFile: string | undefined;
    for (const filename of composeCandidates) {
        if (fs.existsSync(path.join(projectDir, filename))) {
            foundComposeFile = filename;
            break;
        }
    }

    if (foundComposeFile) {
        const isDockerAvail = customCheckers?.isDockerAvailable
            ? customCheckers.isDockerAvailable()
            : checkDockerAvailable();

        if (!isDockerAvail) {
            items.push({
                id: 'docker-compose',
                name: 'Docker runtime',
                status: 'error',
                message: 'Docker runtime missing',
                details: [
                    `Project contains: ${foundComposeFile}`,
                    'Found:            Docker not installed',
                ],
                fixInstruction: 'Install Docker Desktop or Docker Engine.',
            });
        } else {
            const isComposeAvail = customCheckers?.isDockerComposeAvailable
                ? customCheckers.isDockerComposeAvailable()
                : checkDockerComposeAvailable();

            items.push({
                id: 'docker-compose',
                name: 'Docker Compose',
                status: 'success',
                message: 'Docker Compose configuration found',
                details: [
                    `Project contains: ${foundComposeFile}`,
                    isComposeAvail ? 'Docker Compose available' : 'Docker available',
                ],
            });
        }
    }

    // 3. README Bootstrap Hints
    const readmeCandidates = [
        'README.md',
        'README',
        'readme.md',
        'README.txt',
        'README.rst',
    ];
    let readmeContent: string | undefined;
    for (const rname of readmeCandidates) {
        const rpath = path.join(projectDir, rname);
        if (fs.existsSync(rpath)) {
            try {
                readmeContent = fs.readFileSync(rpath, 'utf8');
                break;
            } catch { }
        }
    }

    if (readmeContent) {
        const detectedCommands: string[] = [];
        for (const cmd of SUPPORTED_BOOTSTRAP_COMMANDS) {
            // Use regex to detect standalone command occurrences in text
            const escapedCmd = cmd.replace(/\s+/g, '\\s+');
            const regex = new RegExp(`\\b${escapedCmd}\\b`, 'i');
            if (regex.test(readmeContent)) {
                detectedCommands.push(cmd);
            }
        }

        if (detectedCommands.length > 0) {
            items.push({
                id: 'readme-bootstrap',
                name: 'Bootstrap instructions',
                status: 'success',
                message: 'Bootstrap instructions detected',
                details: [`Detected: ${detectedCommands.join(', ')}`],
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
        id: 'boot-prerequisites',
        name: 'Boot prerequisites',
        status,
        items,
    };
}
