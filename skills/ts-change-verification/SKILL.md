---
name: ts-change-verification
description: "Plan and run evidence-based verification for changes in TypeScript and JavaScript repositories by detecting the package manager, workspace graph, affected packages, and available quality scripts. Use after code or build changes; do not use to claim checks passed when they were skipped or unavailable."
---

# TypeScript Change Verification

Select the smallest verification set that still covers the changed behavior, then report exactly what ran.

## Workflow

1. Inspect repository instructions and the working tree before choosing commands. Preserve user changes and do not rewrite configuration merely to make checks pass.
2. Generate an affected-package plan:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/plan-verification.ts <repo> --base <git-ref>
   ```

   Omit `--base` to use staged and unstaged changes. Treat the generated plan as evidence, not authority; generated files, shared configs, public types, and package-manager changes may require broader coverage.
3. Run commands in increasing cost order: formatting or linting, type checking, focused tests, broader tests, then builds when build behavior or published output changed.
4. Diagnose failures. Do not change tests, loosen types, or suppress rules unless the requested implementation genuinely requires it.
5. Report commands and outcomes, skipped checks with reasons, and residual risk. Never describe an unrun command as passing.

## Safety

The helper plans commands by default. `--run` executes repository scripts and therefore may trigger project-defined lifecycle behavior; use it only when running the detected verification commands is within the user's request. It never installs dependencies automatically.
