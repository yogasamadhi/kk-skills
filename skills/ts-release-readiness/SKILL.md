---
name: ts-release-readiness
description: "Review a TypeScript or JavaScript package for npm release readiness, including package metadata, exports, declaration files, packed contents, lifecycle risk, repository cleanliness, and release evidence. Use before publishing a package or release candidate; do not publish, tag, push, or change versions without explicit authorization."
---

# TypeScript Release Readiness

Produce a release decision with blocking issues, warnings, checks performed, and residual risks.

## Workflow

1. Confirm the exact package and intended version. Inspect repository release instructions, package-manager configuration, and changes since the previous release.
2. Run the static checker:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/check-release.ts <package-directory> --json
   ```

3. Inspect public exports, declarations, module formats, files allowlist, license, README, dependency scopes, generated artifacts, and workspace version relationships.
4. Compare the public API and behavior against the previous release. Classify breaking changes, migrations, deprecations, and user-visible fixes.
5. When explicitly authorized to execute package lifecycle hooks, add `--pack` to run `npm pack --dry-run --json` and inspect the actual tarball file list. Do not use `--pack` on untrusted projects.
6. Run the repository's release verification. Report blockers separately from warnings and record every command actually run.

## Boundaries

- Readiness review does not authorize version changes, changelog edits, commits, tags, pushes, registry publication, or release creation.
- Do not hide incompatible changes behind a version override or regenerate lockfiles with a different package manager.
- Treat successful compilation as only one part of release readiness; consumers also depend on exports, types, runtime formats, install contents, and documentation.
