# Upstream updates

## Provenance

The upstream repository and imported revision of these existing skills have not been verified. Names such as `setup-matt-pocock-skills` are not sufficient provenance. Do not invent an upstream URL or revision.

The local baseline before this Pi adaptation is dotfiles commit `f8229d2`, under `llm/dot_pi/agent/skills/engineering/`. This is a local comparison point, not an upstream release. Local changes are tracked in Git.

## Update procedure

1. Establish the actual source repository, license, and imported revision from import history or maintainer-provided evidence. Record them here when verified. Until then, treat candidate upstream files as a manual import, not a trusted automatic update.
2. Compare the candidate with the imported baseline and local version without overwriting the active skills. Review description changes as well as body and referenced resources.
3. Preserve local contracts: AGENTS.md owns execution mode; Pi tool names must exist; direct execution must remain usable; delegated children must not delegate again; output requirements must match available permissions and tools.
4. Check references and description/body consistency. Exercise affected behavior in disposable fixtures; obtain approval for paid agent evaluations. Static checks alone do not establish model compliance.
5. Commit the reviewed update with source URL/revision and retained adaptations. Do not automatically overwrite local files from upstream.

## Pi adaptations to preserve

- Research, review, and architecture workflows support direct execution and defer delegation decisions to AGENTS.md.
- Standards and Spec remain separate review axes; direct passes are not independent contexts. Working-tree review covers tracked and relevant untracked files without staging them.
- Alternative interface design uses the shared `codebase-design/DESIGN-IT-TWICE.md` workflow.
- Domain document templates resolve to `domain-modeling/`.
