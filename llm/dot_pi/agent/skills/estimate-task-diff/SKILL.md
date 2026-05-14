---
name: estimate-task-diff
description: Estimate task difficulty for the orchestration
---

Estimate task complexity before execution.

# Difficulty Score
blast_radius:
-> affected_services + downstream_dependencies + external_side_effects
- 0 ~ 4:        ->  low
- 5 ~ 10:       ->  medium
- 11 ~ 15:      ->  high
- 16 ~ 20:      ->  ex-high
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
- 17 or above: danger

rollback_difficulty:
- local file edit       ->  low
- module edit           ->  medium
- schema migration      ->  high
- architecture change  ->  ex-high
- production deletion   ->  danger

# overall_difficulty
count like this:
- low: 1
- medium: 2
- high: 3
- ex-high: 4
- danger: 20

mean_of_diff =
(
blast_radius_score
+ context_pressure_score
+ estimated_tool_call_count_score
+ rollback_difficulty_score
) / 4

difficulty:
- 1.0 <= final_diff < 2.0: low
- 2.0 <= final_diff < 3.0: medium
- 3.0 <= final_diff < 4.0: high
- 4.0 <= final_diff < 5.0: ex-high
- 5.0 or above: danger

