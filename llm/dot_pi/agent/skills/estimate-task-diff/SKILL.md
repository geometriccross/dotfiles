---
name: estimate-task-diff
description: Estimate task difficulty for the orchestraion
---

Estimate task complexity before execution.

blast_radius:
-> affected_services + downstream_dependencies + external_side_effects
- 0 ~ 4:        ->  low
- 5 ~ 10:       ->  medium
- 11 ~ 15:      ->  high
- 15 ~ 20:      ->  ex-high
- 21 or above:  ->  danger

