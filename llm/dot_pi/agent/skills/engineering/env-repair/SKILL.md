---
name: env-repair
description: Diagnose and repair dependency install, restore, build, or runtime failures caused by lockfile, toolchain, registry, cache, or environment mismatches. Preserve reproducibility unless the request calls for compatibility updates or modernization.
---

# Environment Repair

Start with the failing command and error, the project's dependency manager, and the intended outcome: reproduce the locked environment, support the current runtime, or modernize. If the request is simply to repair, preserve the locked dependencies where practical.

## Diagnose the relevant layer

Use the evidence to choose checks; do not collect every environment detail before making an obvious local repair.

| Error pattern | Useful check |
|---------------|--------------|
| Permission denied / disk full | Install destination, ownership, available space |
| Checksum mismatch | Artifact source, proxy, or the affected cache entry |
| Connection failure / 403 / timeout | Registry, network, authentication |
| Package not found / wrong CLI | Package identity, registry, executable path |
| Unsupported runtime / compile or ABI error | Locked dependency requirements versus runtime, compiler, OS, architecture |
| Import or command missing after installation | Active interpreter, environment, and PATH |

Read installed CLI help or version-specific documentation when command semantics are uncertain, especially whether an operation updates dependencies, rewrites the lockfile, or removes data. Known project restore commands do not require repeated help lookups.

## Choose the repair

- **Compatible environment:** use the project's strict/locked restore command, then rerun the failing operation.
- **Runtime mismatch:** activate the expected toolchain when reproducing the original environment; when current-runtime support is required, update the incompatible dependency or family and its lockfile together.
- **Modernization or unavailable dependency graph:** re-resolve more broadly when the request authorizes it. If that changes the intended compatibility or reproducibility, explain the trade-off before proceeding.

Do not cycle through all strategies when the evidence already identifies the repair. Check the diff for unintended dependency churn. Prefer targeted cache repair over deleting global caches; use elevated privileges only when the diagnosed system-level repair requires them.

## Command distinctions

These are common semantics, not substitutes for version-specific documentation when needed:

| Ecosystem | Restore / respect lock | Re-resolve / record changes |
|-----------|------------------------|----------------------------|
| npm | `npm ci` | `npm install` may change the lockfile |
| Composer | `composer install` | `composer update` |
| renv | `renv::restore()` | `renv::snapshot()` records the current library |
| Cargo | `cargo build --locked` | `cargo update` |
| uv | `uv sync --frozen` uses the existing lock without checking freshness | `uv lock --upgrade` |
| Poetry | `poetry install` | `poetry update` |

## Verify

Rerun the original failing command and a relevant import, native-extension load, test, or application path. A successful installation does not by itself prove the application works. Review manifest and lockfile changes as part of the result.

Lockfile generation may be necessary before verification can run. Treat it as a candidate change, not proof of repair; retain it as the solution only after relevant verification, or clearly report what remains unverified.
