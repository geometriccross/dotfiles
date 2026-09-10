---
name: resolving-merge-conflicts
description: "Use when you need to resolve an in-progress git merge/rebase conflict."
---

1. **Inspect the current state** of the merge/rebase: run `git status`, identify conflict markers and paths, and establish whether the operation is a merge or rebase.

2. **Trace each side's intent** using available primary sources: commit messages and, when relevant and available, PRs, issues, tickets, or project documentation. Do not infer intent from the conflict text alone.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, choose the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. If the intent or a safe resolution remains unclear, stop and surface the decision rather than forcing a resolution.

4. Discover the project's **relevant automated checks** and run the smallest checks that cover the resolved paths and behavior; broaden them when the conflict affects wider behavior. Fix anything the resolution broke.
