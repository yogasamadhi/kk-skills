---
name: evidence-based-technical-decision
description: "Compare technical options using current project constraints, weighted criteria, authoritative sources, migration cost, operational risk, and reversibility. Use for architecture, framework, infrastructure, protocol, or vendor decisions; do not use a generic feature checklist or assume the numerically highest score overrides hard constraints."
---

# Evidence-Based Technical Decision

Produce a project-specific decision that is traceable to evidence and explicit tradeoffs.

## Workflow

1. Inspect the current repository and state the decision, hard constraints, desired outcomes, time horizon, and options. Include retaining the current approach when it is a real option.
2. Research temporally unstable facts from authoritative current sources. Distinguish sourced facts, repository facts, estimates, and inferences.
3. Define weighted criteria before scoring. Mark hard constraints separately so a weighted average cannot compensate for violating them.
4. Capture sources, scores, risks, migration cost, reversibility, unknowns, and the recommendation in the format from [references/decision-record.md](references/decision-record.md).
5. Run the deterministic scorer:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/score-decision.ts --decision <decision.json> --json
   ```

6. Explain sensitivity: identify which assumptions or score changes would alter the recommendation. Propose a bounded proof of concept for important unknowns instead of inventing certainty.

## Boundaries

- Do not select a technology solely because a competitor or vendor uses it.
- Do not hide hard-constraint violations inside an aggregate score.
- A recommendation does not authorize migration, purchasing, account creation, or production changes.
