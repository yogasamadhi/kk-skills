---
name: desktop-release-matrix
description: "Verify multi-platform desktop release artifacts across operating systems, architectures, runtime versions, vendored revisions, checksums, and smoke evidence. Use for Electron, Tauri, or similar macOS and Windows packaging; do not build, sign, notarize, upload, tag, or publish without explicit authorization."
---

# Desktop Release Matrix

Produce an artifact-by-artifact release decision rather than treating one successful local build as the whole release.

## Workflow

1. Confirm the intended application version and target matrix. Record toolchain versions and immutable vendor or sidecar revisions before packaging.
2. Building, signing, notarization, installer execution, and publication may run lifecycle code or mutate external state; perform only the actions the user authorized.
3. Record every target in the manifest described by [references/release-manifest.md](references/release-manifest.md), then verify artifacts:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/check-desktop-release.ts --manifest <release.json> --root <repository> --json
   ```

4. Check platform, architecture, format, file presence, SHA-256, build result, and target-specific smoke evidence. Do not use a macOS artifact as evidence for Windows or vice versa.
5. Report blockers per target, shared blockers, produced artifacts, checksums, commands actually run, and untested installation or signing risks.

## Boundaries

- Verification does not authorize version edits, certificate access, signing, notarization, installer execution, Git changes, upload, or release publication.
- A cross-compiled artifact still needs platform-appropriate smoke evidence.
- Treat ignored artifacts as outputs to report, not as proof they were built from the current commit.
