---
name: runtime-compatibility-probe
description: "Assess a TypeScript or JavaScript package for compatibility risks across Node.js, Bun, Deno, browsers, and edge runtimes by examining exports, built-in modules, globals, module formats, and native assumptions. Use when targeting multiple runtimes or diagnosing environment-only failures; do not claim compatibility from static analysis alone."
---

# Runtime Compatibility Probe

Build an evidence-based compatibility matrix and distinguish static risk from executed proof.

## Workflow

1. Confirm the exact package entrypoints, supported runtime claims, minimum versions, bundler expectations, and whether server-only subpaths are intentionally separate.
2. Run the static probe:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/probe-runtime.ts <package-directory> --json
   ```

3. Interpret findings with [references/runtime-matrix.md](references/runtime-matrix.md). Inspect the imported code path rather than assuming every source file enters every bundle.
4. Design the smallest executable matrix that covers claimed environments. Test the packed artifact or consumer-facing build, not only source files.
5. For failures, localize the incompatible import, global, export condition, file-system assumption, or module-format transition. Prefer conditional entrypoints and web-standard APIs when they preserve behavior.
6. Report static status and executed status separately for every runtime and version.

## Boundaries

- “Likely compatible” from source inspection is not a passing runtime test.
- Bun and Deno compatibility with Node APIs varies by API and version; verify against current official runtime documentation when the distinction matters.
- Do not add broad polyfills or browser fallbacks without considering bundle size, security, and semantic differences.
