# Parity manifest

```json
{
  "migration": "Spring services to Bun",
  "cutoverRequested": true,
  "rollback": {
    "documented": true,
    "evidence": ["docs/migration/rollback.md"]
  },
  "items": [
    {
      "id": "API-001",
      "domain": "api",
      "capability": "Create order",
      "required": true,
      "status": "matched",
      "legacyEvidence": ["legacy/src/order.ts"],
      "newEvidence": ["services/order/src/routes.ts"],
      "testEvidence": ["services/order/test/routes.test.ts"]
    }
  ]
}
```

Domains normally include `api`, `data`, `authorization`, `ux`, `configuration`, `deployment`, `observability`, and `recovery`. Use `accepted-gap` only with a non-empty rationale. A requested cutover is blocked by required `partial` or `missing` items and by undocumented rollback.
