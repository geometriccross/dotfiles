---
name: ui-ux-pro-max
description: "Design visual systems and improve UI/UX or accessibility. Provides searchable styles, palettes, typography, charts, and stack guidance. Use for visual design decisions and UX work, not code-only frontend fixes."
---

# UI/UX Pro Max

Use the project's existing design system and stack when present. For a local UI fix, inspect the affected component and relevant states; no database search or new design system is required. For new designs or an unresolved visual/UX choice, search the relevant domain below and use the results as options, not requirements.

## Search

Run from this skill's directory, or use an absolute path to `scripts/search.py`. Use `python3` if `python` is unavailable.

```bash
python scripts/search.py "<keywords>" --domain <domain> [-n <max_results>]
python scripts/search.py "<keywords>" --stack <stack>
```

| Domain | Content |
|--------|---------|
| `product` | Recommendations by product type |
| `style` | Visual styles, effects, frameworks |
| `typography` | Font pairings |
| `color` | Palettes |
| `landing` | Page structure and conversion patterns |
| `chart` | Chart selection |
| `ux` | Usability and accessibility |
| `prompt` | Style keywords and prompts |

Stacks: `html-tailwind`, `react`, `nextjs`, `vue`, `svelte`, `swiftui`, `react-native`, `flutter`.

Choose searches that answer a concrete design question. There is no required domain order or search count. Do not introduce a framework, font, icon package, or color scheme merely because a search recommends it.

## Implementation and checks

Match checks to the changed UI and supported platforms:

- Preserve useful semantics, keyboard operation, visible focus, input labels, and accessible names. Use meaningful image alternatives; decorative images need empty alt text.
- Check contrast against the actual background, and do not rely on color alone to communicate state. Respect reduced-motion preferences where motion is used.
- Check changed layouts at relevant viewport sizes, including overflow and content hidden by fixed elements. Test light/dark variants only where supported or requested.
- Keep interactive states recognizable without accidental layout shifts. Follow existing component conventions for icons, spacing, cursors, and transitions rather than imposing fixed values.

When a browser or device check is available, verify the affected interactions and appearance. Report any visual or interaction checks that could not be performed; source inspection alone does not establish the rendered result.
