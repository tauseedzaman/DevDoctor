# 🩺 DevDoctor

DevDoctor diagnoses why a project may fail to run on your machine or CI before you execute code.

Static, zero-dependency, and safe analysis for developer repositories.

---

## 🚀 Quick Start

Run DevDoctor directly inside any repository:

```bash
npx devdoctor
```

Or explicitly with the check command:

```bash
npx devdoctor check
```

---

## 🛡️ Safety Guarantees

DevDoctor is designed for zero-risk, static repository inspection:

- **Does not install dependencies** or run package managers
- **Does not modify project files** or change repository state
- **Never prints environment variable values** or secret tokens
- **Never executes arbitrary README commands** or `package.json` scripts
- **Does not connect to external services**, databases, or Redis
- **Uses safe process execution** with stdio piping (no shell string interpolation)

---

## 🔍 Diagnostic Checks (v1 Scope)

DevDoctor performs five core static analysis diagnostics:

1. **Node.js Runtime Check:**
   - Evaluates engine bounds in `package.json` (`engines.node`), `.nvmrc`, and `.node-version`.
   - Provides direction-aware fix guidance ("Switch to" vs "Upgrade").

2. **Environment Contract Check:**
   - Static-scans project code for environment variable references (`process.env`, `env()`, `os.environ`).
   - Identifies drift between code references, `.env.example`, and `.env`.
   - Audits Git security tracking for `.env` files to prevent secret leakage.

3. **Package Manager & Lockfile Consistency Check:**
   - Detects mismatches between `package.json` (`packageManager`), declared engines, and present lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`/`bun.lockb`).
   - Reports conflicting lockfiles without running package managers.

4. **Project Runtime & Toolchain Detection:**
   - Parses `.python-version`, `.ruby-version`, `composer.json` (`require.php`), and `.tool-versions`.
   - Safely queries system executables (`python`, `ruby`, `php`) and verifies version satisfaction.

5. **Boot Prerequisites Check:**
   - Checks for missing `.env` when `.env.example` is present.
   - Detects Docker Compose files (`compose.yaml`, `docker-compose.yml`) and verifies Docker executable availability.
   - Identifies standard bootstrap instructions in `README.md` without executing them.

---

## 📋 Example Outputs

### Healthy Project

```
🩺 DevDoctor

Diagnosing your project...

✓ Node.js version
  Required: Node >=18.0.0
  Found:    Node 24.x

✓ Environment contract
  Environment contract is consistent and documented.

✓ Package manager
  Declared: pnpm@10.0.0
  Lockfile: pnpm-lock.yaml

✓ PHP runtime
  Required: PHP ^8.2
  Found:    PHP 8.3.x

✓ Boot prerequisites
  .env exists
  Docker Compose configuration found
    Project contains: compose.yaml
    Docker Compose available

────────────────────────────

✓ No problems detected
```

### Broken Project

```
🩺 DevDoctor

Diagnosing your project...

✖ Node.js version mismatch
  Required: Node 18.x
  Found:    Node 24.x

  Fix:
    Switch to a compatible Node.js version.
    Example: nvm install 18 && nvm use 18

✖ Environment security
  .env exists and is tracked by Git.

  Fix:
    Add .env to .gitignore
    git rm --cached .env

⚠ Package manager mismatch
  Declared: pnpm@10.0.0
  Detected lockfile: package-lock.json

  Fix:
    Use pnpm for this project.
    Remove the conflicting lockfile (package-lock.json) and run:

    pnpm install

✖ Python runtime missing
  Required: Python 3.12.0
  Found:    Python not installed

  Fix:
    Install Python 3.12.0 or activate the project's configured runtime.

⚠ Boot prerequisites
  .env.example exists but .env is missing.

  Fix:
    Copy .env.example to .env and configure the required values.

────────────────────────────

5 issues found
  ✖ 3 errors
  ⚠ 2 warnings
```

---

## 📜 License

MIT License