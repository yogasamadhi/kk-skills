---
name: miniapp-release-audit
description: "Audit release readiness for WeChat Mini Programs, Taro, and uni-app projects by checking configuration, page paths, package size signals, production endpoints, secret leakage, privacy-sensitive APIs, and manual platform gates. Use before preview, upload, review submission, or production release; do not deploy or claim regulatory approval."
---

# Mini-App Release Audit

Produce a release checklist grounded in the current source tree and current official platform requirements.

## Workflow

1. Identify the framework, target platform, release environment, app identifier, and exact artifact or branch intended for submission.
2. Run the local static audit:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/audit-miniapp.ts <project-directory> --json
   ```

3. Confirm findings against source and build output. Framework source size is not identical to uploaded package size; use the platform's build and preview tooling for final limits.
4. Read [references/release-checklist.md](references/release-checklist.md), then verify privacy declarations, permission descriptions, request domains, plugin versions, account capabilities, and review rules against current official platform documentation.
5. If the user asks for fixes, make scoped changes and rebuild. Do not change app IDs, signing material, production domains, privacy declarations, or service scopes based on guesses.
6. Report blockers, warnings, manual gates, artifact inspected, and whether preview or upload was actually performed.

## Boundaries

- Audit does not authorize upload, review submission, deployment, or release.
- Never print, copy, or commit private keys, upload secrets, access tokens, or account credentials.
- A static pass is not legal, privacy, or platform approval. Requirements and limits change; verify them using current official sources.
