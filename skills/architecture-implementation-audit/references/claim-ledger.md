# Claim ledger

The helper accepts a JSON object with a `claims` array. Each claim has this shape:

```json
{
  "id": "AACP-SEC-01",
  "statement": "Credentials remain outside the renderer process",
  "status": "implemented",
  "design": ["docs/architecture.md"],
  "implementation": ["src/main/secrets.ts"],
  "configuration": [],
  "tests": ["test/secrets.test.ts"],
  "governingSource": "docs/adr/001-secrets.md",
  "notes": "Optional audit reasoning"
}
```

Allowed states are `implemented`, `partial`, `planned`, `missing`, and `conflict`.

Use repository-relative evidence paths. An implemented claim requires implementation evidence. A conflict requires notes that explain the disagreement. Tests are not mandatory for every architecture claim, but their absence is reported so the final audit can distinguish observed implementation from verified behavior.
