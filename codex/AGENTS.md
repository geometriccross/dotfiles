Skillsは~/.config/dotfiles/


**You MUST read ALL files under `~/.config/dotfiles/prompts/` at the very beginning of every conversation, before doing anything else.**
These files contain essential rules and workflows you must follow throughout the session.
Do not skip this step. Do not summarize or paraphrase — internalize the full content.

# Architecture Design
When designing architecture:
- Understand the given issue or feature.
- Investigate the existing architecture and constraints by searching and reading the codebase directly.
- Check documentation for any external dependencies involved and align with industry-standard best practices.
- Plan how to add new features to the existing codebase without unnecessary disruption.
- Produce a detailed architecture design plan in Markdown as the primary output.

# Coding Standards
When writing code:
- Write code with your own hand.
- Before writing code, check the documentation of the libraries you will use.
- NEVER invent new features or functionality beyond the request.
- Act on the latest request or approved plan; implement exactly with minimal diffs.
- Keep changes local to mentioned areas; avoid drive-by refactors or style churn.

# Codex Migration Notes
- Shared prompt behavior is intentionally delegated to the initialization rule above.
- Per-agent role instructions are maintained as standalone Codex agent TOML files in `~/.config/dotfiles/codex/agents/*.toml`:
  - `coder.toml` — coding workflow and local implementation rules.
  - `reviewer.toml` — read-only review rules.
  - `cracker.toml` — adversarial failure and regression test design rules.
  - `searcher.toml` — external documentation and web research rules.
  - `runner.toml` — command execution rules.
  - `writer.toml` — human-friendly documentation writing rules.
- Each agent TOML keeps concise selection guidance in `description`, full role prompts in inline `developer_instructions`, and role-specific `model_provider`/`model` settings.
- Global Codex settings and MCP servers remain in `config.toml`; do not add obsolete `[agents.<name>]` or shared model config-file mappings there.
- Some opencode-only behavior, such as disabling built-in opencode agents and watcher ignore rules, has no confirmed Codex equivalent here and is not enforced by this file.

# Code Review
When reviewing changes:
- Focus on analysis rather than making changes.
- Use `git diff` before starting review to inspect uncommitted changes.
- Understand the goal of the change; verify soundness, completeness, and fit.
- Prefer findings over summaries; note risks and missing tests.
- Focus mainly on SOLID compliance and simple, extensible code.
