---
name: dependency-incident-audit
description: "Audit a TypeScript or JavaScript repository against a dependency security advisory by mapping the affected package into manifests, lockfiles, installed versions, workspaces, and runtime exposure. Use for CVE, GHSA, compromised-package, or urgent upgrade investigations; do not infer exploitability from version presence alone."
---

# Dependency Incident Audit

Turn an advisory into repository-specific evidence before proposing changes.

## Workflow

1. Resolve the exact advisory from a current authoritative source. Record affected versions, patched versions, vulnerable feature or execution path, publication time, and whether compromise rather than a normal vulnerability is involved.
2. Identify package-manager and repository instructions. Run the local evidence collector:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/audit-dependency.ts --package <name> --root <repo> --json
   ```

   Add `--explain` only when invoking the detected package manager's read-only dependency explanation is appropriate and installed dependencies are available.
3. Use [references/audit-method.md](references/audit-method.md) to separate presence, affected-version match, reachability, and demonstrated impact.
4. Compare remediation options: direct upgrade, override/resolution, parent-package upgrade, feature disablement, or removal. Prefer the smallest change that reaches a fixed version without hiding incompatible behavior.
5. If the user asks for remediation, update manifests and lockfiles with the repository's own package manager, run focused tests, then broaden verification according to dependency reach.
6. Report evidence, confidence, action taken or recommended, checks run, and residual exposure.

## Boundaries

- Do not claim safety because a scanner is quiet or claim exploitability because a string appears in a lockfile.
- Do not fetch or execute code from an advisory, proof of concept, or compromised package.
- Do not delete lockfiles, caches, or installed dependencies unless the user explicitly asks and the exact targets are known.
- For compromised packages, treat credentials and build artifacts as potentially exposed only when the evidence supports that path; recommend incident-response coordination rather than silently rotating credentials.
