# Desktop release manifest

```json
{
  "app": "SeekDock",
  "version": "1.4.0",
  "sourceCommit": "0123456789abcdef0123456789abcdef01234567",
  "toolchain": { "bun": "1.3.0", "node": "22.14.0" },
  "vendors": { "deepseek-harness": "abcdef0123456789abcdef0123456789abcdef01" },
  "targets": [
    {
      "id": "mac-arm64",
      "platform": "darwin",
      "arch": "arm64",
      "format": "dmg",
      "artifact": "dist/SeekDock-1.4.0-arm64.dmg",
      "sha256": "optional expected digest",
      "buildStatus": "pass",
      "smokeStatus": "pass",
      "smokeEvidence": ["artifacts/mac-arm64-smoke.txt"]
    }
  ]
}
```

Allowed build and smoke states are `pass`, `fail`, `not-run`, and `not-applicable`. Every target needs a unique ID and platform/architecture pair. A release target is blocked if its artifact is missing, its expected digest differs, its build failed, or smoke testing did not pass unless it is explicitly not applicable with supporting reasoning.
