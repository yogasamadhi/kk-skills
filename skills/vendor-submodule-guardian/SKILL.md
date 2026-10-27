---
name: vendor-submodule-guardian
description: "Inspect and govern Git submodules and vendored repositories, including paths, pinned commits, dirty state, missing gitlinks, and read-only vendor invariants. Use before moving, updating, packaging, or verifying submodules; do not update gitlinks or vendor contents without explicit authorization."
---

# Vendor Submodule Guardian

Establish the exact submodule state before making or approving vendor-related changes.

## Workflow

1. Read repository instructions and determine whether vendor trees are read-only, locally patched, or maintained as normal submodules.
2. Run the read-only inspection:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/inspect-submodules.ts <repository> --json
   ```

3. For each entry, verify `.gitmodules` name, path, URL, checked-out commit, recorded gitlink, initialization state, and dirtiness. Apply the distinctions in [references/invariants.md](references/invariants.md); treat a clean nested worktree and a changed parent gitlink as different facts.
4. Before an authorized move or update, capture the old path and commit. Afterward, check scripts, CI, documentation, package configuration, and test fixtures for stale paths; verify the intended commit remains available.
5. Report the exact before/after commit IDs, vendor modifications, parent-repository changes, validation commands, and unresolved drift.

## Boundaries

- Inspection does not authorize `submodule update`, checkout, pull, commit, push, URL changes, or edits inside vendor trees.
- Do not describe “latest” without resolving it to an immutable commit.
- Never discard dirty vendor changes. Identify their owner and intent before proposing recovery.
