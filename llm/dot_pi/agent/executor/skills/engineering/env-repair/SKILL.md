---
name: env-repair
description: >
  Diagnoses and repairs broken dependency environments when lockfile-to-runtime,
  package-manager, registry, OS, architecture, compiler, cache, or path mismatches
  cause restore/install/build failures. Use for renv, venv, pip, uv, Poetry, Conda,
  Bundler, Cargo, npm, pnpm, Go modules, Maven, Gradle, Composer, SwiftPM, and other
  lockfile-based ecosystems. Prefer reproducible restore and minimal changes before
  upgrading or rebuilding dependencies.
---

# Environment Repair Skill

Use this skill when a dependency environment fails to restore, install, build, or run
from a lockfile or dependency manifest.

Repair means deciding whether to:

1. preserve the lockfile and restore the original environment,
2. adapt the dependency set to the current runtime,
3. or intentionally modernize the project.

Do not immediately upgrade everything.

---

## Core Principle

Always prefer the smallest safe change.

First infer the user's goal:

- **Reproducibility**: preserve the lockfile and original runtime as much as possible.
- **Current-runtime repair**: make the project work on the current machine/runtime.
- **Modernization**: intentionally update dependencies.

When unclear, assume reproducibility matters and avoid broad updates.

---

## Required First Steps

Before modifying the environment:

1. Identify the dependency manager and lockfile.
2. Collect the exact failing command and error.
3. Check runtime, package-manager version, OS, and architecture.
4. Confirm the active environment or interpreter.
5. Inspect rollback state with version control when available.
6. Inspect the CLI semantics before choosing repair commands.

Do not overwrite lockfiles, delete caches, or update dependencies before these checks.

---

## Inspect CLI Semantics Before Repair

Before running repair commands, inspect the CLI actually used by the project.

Do not rely on memory alone. Check one or more of:

```text
<tool> --help
<tool> -h
<tool> help
<tool> <subcommand> --help
man <tool>
project README
official documentation
diagnostic commands such as doctor, diagnose, status, env, check, or config
````

Identify which commands are for:

```text
strict restore / sync
dependency installation
dependency update
lockfile generation
lockfile verification
cache cleanup
environment diagnostics
path / interpreter inspection
test or verification
```

Prefer the least destructive command that matches the repair goal.

Never choose an update, snapshot, clean, prune, cache-deletion, or lockfile-rewrite
command merely because it sounds related.

---

## Diagnosis Model

Classify the failure before repairing it.

| Error pattern                               |               Likely layer | Typical cause                        |
| ------------------------------------------- | -------------------------: | ------------------------------------ |
| `EACCES`, `Permission denied`               |                   L0 Infra | Wrong install path or permissions    |
| `ENOSPC`, `No space left on device`         |                   L0 Infra | Disk full                            |
| `checksum mismatch`, `cache corrupt`        |                   L0 Infra | Corrupt cache or proxy artifact      |
| `Connection refused`, `403`, `timeout`      |                   L0 Infra | Network, VPN, proxy, auth            |
| `not found in registry`, `404`              | L1 Registry / L4 Namespace | Wrong source or package name         |
| `requires Python >=...`, `requires R >=...` |                 L2 Runtime | Runtime too old/new for dependency   |
| `compilation error`, `undefined symbol`     |                 L2 ABI/API | Runtime/compiler/SDK mismatch        |
| `segfault` during install/load              |                 L2 ABI/API | Binary incompatibility               |
| `ImportError` after successful install      |                    L3 Path | Installed into different environment |
| `command not found` after install           |                    L3 Path | Binary path not active               |
| Tool has wrong subcommands                  |               L4 Namespace | Wrong package/tool installed         |

Rules:

```text
L0: Fix disk, network, permissions, auth, or cache before touching dependencies.
L1: Check registry/source fields before changing package versions.
L2: Compare runtime/compiler/OS/arch with the lockfile expectation.
L3: Verify package manager and runtime point to the same environment.
L4: Verify the package name resolves to the intended package/tool.
```

---

## Repair Strategy

Use the strategies in this order.

### Strategy A: Direct Restore

Use when the runtime and package manager are compatible with the lockfile.

Goal:

```text
restore/sync/install exactly from the lockfile without updating dependency versions
```

Before running it, inspect the CLI help/docs for strict, frozen, locked, restore,
sync, or install modes.

If it works, verify and stop.

---

### Strategy B: Pin Runtime / Toolchain

Use when reproducibility matters or the lockfile expects an older runtime.

Look for runtime hints in:

```text
.python-version
.ruby-version
.node-version
.nvmrc
.tool-versions
rust-toolchain.toml
renv.lock
pyproject.toml
package.json
Gemfile
go.mod
pom.xml
build.gradle
Dockerfile
devcontainer config
CI config
README
```

Goal:

```text
activate the runtime/toolchain expected by the project, then retry Direct Restore
```

Prefer this for published analyses, old projects, production systems, and CI reproduction.

---

### Strategy C: Minimal Compatibility Update

Use when the project should run on the current runtime, but broad modernization is not desired.

Goal:

```text
update only the incompatible package or dependency family, then refresh the lockfile
```

Before updating, inspect the CLI help/docs for targeted update options.

Do not use a broad update command if a targeted update exists.

Verify before re-locking or snapshotting.

---

### Strategy D: Incremental Rebuild

Use when several dependencies are incompatible, but full modernization is still risky.

Goal:

```text
update one package or dependency family at a time, verifying after each change
```

If an update breaks another dependency, pin to the highest compatible version.

---

### Strategy E: Full Rebuild from Latest

Use only when:

```text
the user explicitly wants modernization
the lockfile is too stale to repair incrementally
minimal updates failed
the old dependency graph is unavailable
reproducibility is not important
```

Goal:

```text
re-resolve dependencies for the current runtime and intentionally rewrite the lockfile
```

Record the old lockfile and report major dependency changes.

Do not use this as the default repair path.

---

## Semantic Traps

Always verify actual CLI behavior, but keep these common distinctions in mind:

```text
npm ci restores from package-lock.json.
npm install may modify package-lock.json.

composer install restores from composer.lock.
composer update re-resolves and rewrites composer.lock.

renv::restore() restores from renv.lock.
renv::snapshot() records the current library into renv.lock.

cargo build --locked respects Cargo.lock.
cargo update modifies Cargo.lock.

uv sync --frozen restores without updating the lockfile.
uv lock --upgrade updates the lockfile.

poetry install restores from poetry.lock.
poetry update changes dependency versions and rewrites poetry.lock.
```

---

## Anti-Patterns

Avoid:

```text
updating everything immediately
running commands without checking help/docs
using install when strict restore is available
using broad update when targeted update is available
deleting global caches before proving cache corruption
using sudo for project dependencies
snapshotting or re-locking before verification
assuming package name equals tool name
ignoring non-default registries
treating ABI/runtime errors as cache errors
ignoring OS or architecture changes
```

---

## Verification

After every meaningful change, verify at the smallest useful level.

Check one or more of:

```text
package manager status/check command
key package import/load
native extension load
test suite
main script/app/analysis
lockfile or manifest diff
```

Installation success alone is not enough.

Do not snapshot, re-lock, or declare success until verification passes.

---

## Report Format

When finished, report:

```text
Root cause:
Layer:
Strategy used:
CLI semantics inspected:
Files changed:
Dependencies changed:
Runtime/toolchain changed:
Verification performed:
Remaining risks:
Suggested next step:
```

Keep the report factual. Mention uncertainty when verification was partial.
