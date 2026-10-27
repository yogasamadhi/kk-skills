---
name: delivery-completeness-ledger
description: "Track and audit completion of long, multi-phase engineering plans with stable item IDs, acceptance criteria, evidence, blockers, and explicit readiness levels. Use when users ask to continue all phases or determine whether a plan is actually complete; do not substitute activity summaries for completion evidence."
---

# Delivery Completeness Ledger

Maintain a durable, evidence-based account of what is finished and what remains.

## Workflow

1. Convert the agreed scope into stable item IDs. Preserve deferred, cancelled, and newly discovered work instead of silently removing or renaming it.
2. Give every item acceptance criteria and one status: `planned`, `in-progress`, `implemented`, `verified`, `release-ready`, `production-ready`, `blocked`, `deferred`, or `cancelled`.
3. Attach evidence appropriate to the claimed status. Code paths support `implemented`; executed tests or observed behavior support `verified`; release and operational evidence are required for stronger claims.
4. Validate the ledger format in [references/ledger-format.md](references/ledger-format.md):

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/check-ledger.ts --ledger <delivery.json> --root <repository> --json
   ```

5. When asked whether everything is done, answer at the requested readiness level and enumerate every item below that level. Report scope changes and blockers separately.

## Boundaries

- Do not infer `verified` from code presence or `production-ready` from passing unit tests.
- Do not use elapsed time, commentary volume, commits, or progress documents as completion evidence.
- A task may be functionally complete while still not release-ready; state both facts rather than collapsing them into “done.”
