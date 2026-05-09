# Codex custom skills

This directory is the repo-managed source for local Codex custom skills. Codex loads user skills from `$HOME/.agents/skills/<name>/SKILL.md`.

If the runtime path is absent, install the repo-managed skills with:

```sh
ln -s /Users/geometriccross/.config/dotfiles/codex/skills /Users/geometriccross/.agents/skills
```

Do not place user custom skills in `codex/skills/.system/`; that directory is reserved for system-provided skills.
