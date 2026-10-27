---
name: migration-parity-keeper
description: "Preserve required API, data, authorization, UX, configuration, deployment, and operational behavior during framework, service, architecture, or legacy-system migrations. Use to build and verify old-to-new parity and cutover readiness; do not assume a successful build proves migration completeness."
---

# Migration Parity Keeper

Make migration scope and accepted incompatibilities explicit before cutover.

## Workflow

1. Inventory externally observable legacy behavior before implementation. Include API contracts, data semantics, permissions, primary user journeys, configuration, deployment, observability, and recovery.
2. Separate behavior that must match from behavior intentionally changed. Every accepted gap needs an owner, rationale, and migration or communication plan.
3. Track each capability as `matched`, `partial`, `missing`, `accepted-gap`, or `not-applicable`, with old-system and new-system evidence.
4. Validate the parity manifest described in [references/parity-format.md](references/parity-format.md):

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/check-parity.ts --manifest <parity.json> --root <repository> --json
   ```

5. Before cutover, verify required items, data migration, consumer adaptation, rollback, and observability. Report functional parity separately from cutover readiness.

## Boundaries

- Do not copy legacy defects merely to achieve nominal parity; document the intentional difference.
- Do not remove or disable the old path until the user authorized cutover and rollback conditions are satisfied.
- A route with the same name is not parity unless its payload, errors, authorization, and side effects meet the required contract.
