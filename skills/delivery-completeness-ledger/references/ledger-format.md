# Delivery ledger format

```json
{
  "title": "Merchant shipment rollout",
  "targetStatus": "verified",
  "declaredComplete": false,
  "items": [
    {
      "id": "SHIP-01",
      "title": "Create shipment",
      "status": "verified",
      "acceptance": ["Merchant can create a shipment for a paid order"],
      "evidence": ["apps/api/test/shipment.test.ts"],
      "commands": ["pnpm --filter api test"],
      "notes": "Optional context"
    }
  ]
}
```

`declaredComplete` means every non-deferred and non-cancelled item has reached `targetStatus`. Evidence paths are repository-relative. Commands record checks that were actually executed; do not list intended commands as evidence.
