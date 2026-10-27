---
name: product-engineering-loop
description: "Run evidence-backed product engineering iterations that connect product diagnosis, a bounded implementation slice, real application behavior, visual verification, regression checks, and an explicit next decision. Use for repeated UI or workflow improvement cycles; do not manufacture work or use elapsed time as evidence of value."
---

# Product Engineering Loop

Make each iteration deliver a coherent user-visible improvement with verifiable behavior.

## Workflow

1. Establish the target user, primary journey, current friction, and product constraints from the running product and repository. When a legacy version exists, compare the workflow and information hierarchy rather than copying its styling blindly.
2. Select one bounded, material slice. State the hypothesis, acceptance criteria, excluded work, and regression surface before implementation.
3. Implement the slice while preserving unrelated user changes. Resolve runtime blockers safely; use isolated ports or profiles when necessary rather than taking over an unknown process.
4. Verify the actual application at relevant viewport and theme states. Combine behavior checks, visual inspection, accessibility or interaction checks, and focused regression tests in proportion to the change.
5. Record the iteration in the format from [references/iteration-ledger.md](references/iteration-ledger.md), then run:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/check-iteration.ts --ledger <iterations.json> --root <repository> --json
   ```

6. Report the user-visible delta, evidence, unresolved defects, product learning, and the next highest-value decision. Do not continue automatically when the next slice materially changes scope.

## Boundaries

- Do not use a fixed duration, number of files, or volume of changes as a quality target.
- Do not call a layout successful from source inspection alone when the application can be run and inspected.
- Product review does not authorize broad redesign, feature removal, process termination, deployment, or publication beyond the requested scope.
