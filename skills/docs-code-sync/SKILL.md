---
name: docs-code-sync
description: "Audit documentation drift against a TypeScript or JavaScript repository, focusing on environment variables, CLI flags, public exports, package metadata, examples, and local links. Use when code or configuration changes may have made docs stale; do not rewrite documentation until the implementation is treated as the source of truth."
---

# Docs–Code Sync

Find concrete documentation drift and fix only claims supported by current implementation.

## Workflow

1. Establish the documentation surface and source of truth: exported APIs, CLI parser, configuration schema, environment access, generated references, and examples.
2. Run the heuristic scanner:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/scan-docs.ts <repo> --json
   ```

3. Confirm every candidate in source. Regex findings are leads; aliases, generated docs, conditional exports, and intentionally internal variables can create false positives.
4. Test runnable examples using the repository's supported environment when feasible. Do not insert invented output or options to make documentation appear complete.
5. Make focused documentation changes, preserve the established voice and information architecture, and update generated docs through their owning generator.
6. Report drift fixed, evidence inspected, examples run, and gaps that still require product or maintainer decisions.

## Boundaries

- Do not change implementation merely to match stale docs unless the user asks for that behavior change.
- Do not expose internal environment variables, private endpoints, secrets, or unsupported APIs for the sake of completeness.
- Treat versioned docs independently; a statement can be correct for one maintained version and wrong for another.
