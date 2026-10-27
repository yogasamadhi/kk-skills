# Runtime snapshot

```json
{
  "engine": "custom-openai-provider",
  "observations": [
    { "layer": "process", "status": "pass", "evidence": "PID 123 is listening" },
    { "layer": "transport", "status": "pass", "evidence": "GET /health returned 200" },
    { "layer": "authentication", "status": "pass", "evidence": "Sanitized authenticated probe passed" },
    { "layer": "models", "status": "fail", "evidence": "Provider does not implement /models" },
    { "layer": "inference", "status": "pass", "evidence": "Configured model returned a valid response" },
    { "layer": "state", "status": "fail", "evidence": "Availability reducer requires model refresh" },
    { "layer": "ui", "status": "fail", "evidence": "UI badge says unavailable" }
  ]
}
```

Allowed statuses are `pass`, `fail`, `unknown`, and `not-applicable`. Evidence must be sanitized prose or a path to a sanitized artifact. Include each layer once; omitted layers are reported as unknown.
