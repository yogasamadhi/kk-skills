# Decision record

```json
{
  "decision": "Select the service event transport",
  "constraints": [
    { "id": "C1", "statement": "Must support local development without a cloud account", "hard": true }
  ],
  "criteria": [
    { "id": "operations", "label": "Operational simplicity", "weight": 40 },
    { "id": "delivery", "label": "Delivery semantics", "weight": 35 },
    { "id": "migration", "label": "Migration cost", "weight": 25 }
  ],
  "options": [
    {
      "id": "nats",
      "label": "NATS JetStream",
      "scores": { "operations": 4, "delivery": 4, "migration": 3 },
      "hardConstraintViolations": [],
      "risks": ["Team has limited operational experience"],
      "reversibility": "medium"
    }
  ],
  "sources": [
    { "title": "Official documentation", "url": "https://example.com", "checkedAt": "2026-08-22", "authoritative": true }
  ],
  "recommendation": "nats",
  "rationale": "Best fit under the declared constraints"
}
```

Weights must be positive and sum to 100. Scores use a 1–5 scale. The helper excludes options with hard-constraint violations from the eligible ranking and reports when the recommendation differs from the highest eligible score.
