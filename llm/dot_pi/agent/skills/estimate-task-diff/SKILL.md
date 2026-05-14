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

context_pressure:
-> (repo_context + tool_context + expected_retrieval + reasoning_buffer) / model_token_limit
- < 0.35        ->  low
- 0.35〜0.60    ->  medium
- 0.60〜0.75    ->  high
- 0.75〜0.90	->  ex-high
- 0.90 or above	->  danger

estimated_tool_call_count:
- 0 ~ 3: low
- 4 ~ 8: medium
- 9 ~ 12: high
- 13 ~ 16: ex-high
- 16 or above: danger

