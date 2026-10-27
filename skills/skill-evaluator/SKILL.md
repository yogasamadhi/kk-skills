---
name: skill-evaluator
description: "Design and score behavioral evaluations for an Agent Skill, including positive and negative activation cases, required actions, prohibited actions, and artifact assertions. Use when proving that a skill changes agent behavior correctly; do not use for static package safety review."
---

# Skill Evaluator

Evaluate observable behavior, not preferred wording.

## Workflow

1. Read the target skill and identify its promised outcomes, activation boundary, authorization boundary, and failure conditions.
2. Create cases using [references/case-format.md](references/case-format.md). Include realistic positive triggers, near-miss negative triggers, missing-input cases, and at least one risky edge case when the workflow can mutate state.
3. Capture a no-skill baseline before changing a complex skill when the harness permits it. Run the same request with the skill enabled using an isolated workspace.
4. Record each run in the result format, then score it:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/evaluate.ts --cases <cases.json> --results <results.json>
   ```

5. Inspect failures. Improve only rules supported by observed behavior, then rerun the relevant cases and a small regression set.

## Evaluation rules

- Prefer assertions about tool use, inspected evidence, changed files, stopped side effects, and output structure.
- Do not assert exact sentences unless exact text is itself the deliverable contract.
- A negative activation case should resemble a real request that belongs to a neighboring skill.
- Do not grant the evaluated agent broader permissions than an ordinary user request would provide.
- Never run production mutations, paid calls, external messages, or destructive operations merely to evaluate a skill.

Report pass, fail, and not-run separately. A structurally valid case file with no recorded runs is not a passing evaluation.
