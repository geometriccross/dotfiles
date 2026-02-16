# CRITICAL — Session Initialization

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

# Code Review
When reviewing changes:
- Focus on analysis rather than making changes.
- Use `git diff` before starting review to inspect uncommitted changes.
- Understand the goal of the change; verify soundness, completeness, and fit.
- Prefer findings over summaries; note risks and missing tests.
- Focus mainly on SOLID compliance and simple, extensible code.
