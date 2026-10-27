---
name: architecture-implementation-audit
description: "Audit whether architecture documents, accepted ADRs, protocols, configuration, code, and tests describe the same implemented system. Use when reviewing design-to-code drift or deciding whether documented capabilities are implemented; do not use for ordinary documentation copy edits."
---

# Architecture Implementation Audit

Produce an evidence-linked claim matrix that separates implemented behavior from plans and contradictions.

## Workflow

1. Identify the governing sources before judging implementation. Distinguish accepted decisions and released protocol versions from drafts, proposals, and roadmaps.
2. Turn material architecture statements into atomic claims. Give each claim a stable ID and classify it as `implemented`, `partial`, `planned`, `missing`, or `conflict`.
3. Link each claim to the relevant design, implementation, configuration, and test evidence. Do not infer implementation from a document or roadmap alone.
4. Record contradictions explicitly, including which source governs and why. Treat security-boundary, persistence, compatibility, and protocol-version conflicts as higher risk than naming drift.
5. Validate the ledger with the helper described in [references/claim-ledger.md](references/claim-ledger.md):

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/audit-claims.ts --ledger <claims.json> --root <repository> --json
   ```

6. Report the claim matrix, critical conflicts, missing evidence, remediation order, and residual uncertainty. Preserve `planned` as a legitimate state rather than calling it a defect unless the governing contract requires it now.

## Boundaries

- Do not rewrite design documents, ADRs, protocols, or code unless the user requested remediation.
- A passing test is evidence for the behavior it exercises, not for adjacent architectural claims.
- If sources disagree and governance is unclear, report uncertainty instead of selecting the newest file automatically.
