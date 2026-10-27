# Evaluation case format

Use JSON so the bundled TypeScript scorer remains dependency-free.

```json
{
  "version": 1,
  "skill": "example-skill",
  "cases": [
    {
      "id": "positive-basic",
      "prompt": "Audit this example Skill before publishing it.",
      "shouldTrigger": true,
      "mustInclude": ["SKILL.md", "blocking"],
      "mustNotInclude": ["published successfully"],
      "expectedFiles": [],
      "forbiddenFiles": ["production-change.txt"]
    }
  ]
}
```

Result files contain one record per executed case:

```json
{
  "results": [
    {
      "caseId": "positive-basic",
      "triggered": true,
      "transcript": "Inspected SKILL.md and found one blocking issue.",
      "files": []
    }
  ]
}
```

`mustInclude` and `mustNotInclude` are case-insensitive substring assertions over the captured transcript. Use them sparingly. `expectedFiles` and `forbiddenFiles` compare normalized relative paths.
