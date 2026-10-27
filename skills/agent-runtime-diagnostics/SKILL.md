---
name: agent-runtime-diagnostics
description: "Diagnose Agent and LLM desktop runtime availability across process, transport, authentication, model discovery, inference, state aggregation, and UI gating. Use when an engine appears started but unavailable or provider state is contradictory; do not treat a process or health check alone as proof of usable inference."
---

# Agent Runtime Diagnostics

Trace availability through every runtime layer and identify the first failing boundary.

## Workflow

1. Identify the engine, adapter, protocol, model, credential source, sidecar or server process, and the UI state being explained. Do not expose secret values in logs or reports.
2. Collect observations in this order: `process`, `transport`, `authentication`, `models`, `inference`, `state`, and `ui`. Mark unavailable evidence as `unknown` rather than guessing.
3. Record observations in the snapshot format from [references/runtime-snapshot.md](references/runtime-snapshot.md), then run:

   ```bash
   node --experimental-strip-types <skill-directory>/scripts/diagnose-runtime.ts --snapshot <runtime.json> --json
   ```

4. Locate the first failed layer, but also inspect contradictions. Successful inference with an unavailable UI usually indicates aggregation or gating logic, while successful process startup with failed inference does not.
5. Report confirmed facts, inferred causes with confidence, missing evidence, the smallest next probe, and any user-visible state bug separately from provider failure.

## Boundaries

- Do not send paid inference requests, change credentials, restart services, kill processes, or alter provider configuration without authorization.
- Sanitize bearer tokens, API keys, cookies, query credentials, and request bodies before retaining evidence.
- Model-list failure may coexist with successful calls to a configured model; preserve that distinction.
