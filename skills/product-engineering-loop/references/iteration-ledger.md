# Iteration ledger

```json
{
  "product": "Agent desktop",
  "iterations": [
    {
      "id": "ITER-01",
      "status": "verified",
      "user": "Writer using the three-column workspace",
      "problem": "AI assistance obscures the draft",
      "hypothesis": "Keeping AI visible beside the editor reduces context switching",
      "scope": ["Replace the modal assistant with a persistent side panel"],
      "acceptance": ["Draft and AI panel are visible at the same time"],
      "changes": ["apps/desktop/src/Workspace.tsx"],
      "behaviorEvidence": ["artifacts/iter-01-behavior.txt"],
      "visualEvidence": ["artifacts/iter-01-desktop.png"],
      "commands": ["pnpm test --filter workspace"],
      "learning": "The fixed panel preserved writing context",
      "nextDecision": "Evaluate narrow-screen behavior"
    }
  ]
}
```

Allowed states are `planned`, `in-progress`, `implemented`, `verified`, and `abandoned`. Implemented iterations need concrete changed paths. Verified iterations additionally need behavior evidence, visual evidence when the change is visible, and commands that were actually executed.
