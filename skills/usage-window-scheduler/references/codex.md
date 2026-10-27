# Codex adapter

## Evidence checked on 2026-10-21

- [OpenAI: usage windows](https://help.openai.com/en/articles/20001516-managing-usage-with-gpt-6-astra-in-work-and-codex): for plans with a five-hour window, the first message after the old window ends starts the next. Weekly limits are separate; some plans do not have a five-hour cap. API usage is billed separately.
- [OpenAI: available models](https://developers.openai.com/codex/models): Luna is the efficient option for focused repetitive tasks. `gpt-6-luna` is the initial candidate, conditional on account/client availability. A fixed historical price table would become stale; verify available models and their relative consumption when installing or changing the schedule.
- [OpenAI: scheduled tasks](https://developers.openai.com/codex/app/automations): standalone runs start with a saved prompt; chat-attached runs retain context. Local schedules require a running app and available machine. Model/effort and advanced recurrence controls are available for supported standalone tasks.

The documentation does not guarantee exact quota alignment for a six-slot warm-up schedule. Treat scheduled inference as an attempt. For example, an initial request received at 05:00:10 and a second received at 10:00:03 are less than five hours apart. A weekly cap, a window started manually at another time, or a missed run also changes the result. Do not claim that a successful reply reset any allowance.

## Planner

Node.js 22.6+ is required. There are no npm dependencies, network requests, child processes, authentication reads, or scheduler writes in the planner.

```bash
node --experimental-strip-types <skill-directory>/scripts/plan-schedule.ts --timezone Asia/Singapore --json
node --experimental-strip-types <skill-directory>/scripts/plan-schedule.ts --timezone Europe/London --times 05:00,10:00,10:01,15:00,15:01,15:02 --model gpt-6-luna --json
node --experimental-strip-types <skill-directory>/scripts/plan-schedule.ts --timezone Asia/Singapore --existing inventory.json --pause --json
```

Default recurrence: `FREQ=DAILY;BYHOUR=5,10,15;BYMINUTE=0,1,2;BYSECOND=0;BYSETPOS=1,4,5,7,8,9`. The hour/minute expansion yields nine candidates; the selected positions retain exactly 05:00, 10:00, 10:01, 15:00, 15:01 and 15:02. No evening or midnight request is scheduled. Later minute slots execute once each, regardless of earlier success; there is no additional retry loop.

[RFC 5545 section 3.3.10](https://www.rfc-editor.org/rfc/rfc5545.html#section-3.3.10) defines applying `BYSETPOS` after hour/minute expansion within each daily interval. Do not omit it for this schedule: that would add 05:01, 05:02 and 10:02. `--times` accepts unique exact HH:mm pairs and cannot be combined with `--hours`/`--minute`. The latter flags still support a shared-minute schedule, such as `--hours 5,10,15 --minute 0`. The planner rejects positional selections outside the supported RFC range rather than emitting an invalid rule. The host may normalize the RRULE; compare meaning when reconciling a live task.

`schedule.timeZone` is independent of `desired`: current native tool arguments have no time-zone field. Verify the actual scheduler time zone/next-run preview. For DST zones, keep the IANA zone in the scheduler; repeated/missing local times follow the scheduler's documented policy. The planner does not pretend to calculate authoritative next runs.

The JSON `desired` object is a standalone configuration draft for the currently documented desktop tool. It omits `mode` and `id`; those depend on reconciliation. Never pass the entire plan to the tool. Before writes, use the live tool schema, the existing task's full record, and explicit standalone authorization.

## Optional inventory snapshot

Normalize relevant metadata from native view results into this format. `schedulerTimeZone` is **observed host configuration**, not something to guess or add to native arguments. An empty list may be supplied only after a successful inventory inspection.

```json
{
  "schedulerTimeZone": "Asia/Singapore",
  "automations": []
}
```

For each existing automation include `id`, `name`, and its full saved configuration. The planner checks the following fields on the exact matching name: `kind`, `executionEnvironment`, `projectId`, `prompt`, `rrule`, `model`, `reasoningEffort`, `notificationPolicy`, `status`. `destination` is optional and defaults to `local`. Treat a missing field as an incomplete snapshot, not a new task. Other names are ignored.

Actions:

| Action | Meaning |
| --- | --- |
| `inspect` | No complete inventory/zone was supplied; inspect before applying |
| `create` | Complete inventory contains no matching name; activation still requires authorization |
| `update` | Exact matching task differs; update that ID, preserving fields outside the managed settings |
| `noop` | Managed settings already match; no mutation |
| `pause` | Exact matching active task should be paused |
| `conflict` | Duplicates, context mismatch, or time-zone mismatch; no mutation |

The stable name includes a profile (default `default`), not the selected hours or model, so configuration changes update the same task. For the same profile, a saved project or execution-context change is a conflict, not an automatic migration. Only create a separate profile when the user requests a separate schedule.

## Operations

Use native view/update operations for edits and pauses. Keep the returned ID in the completion message so users can identify the task. A paused task resumes only when requested. Keep normal runs quiet using the native notification field, with failure notifications where supported. Retired/unavailable models require an explicit available replacement; avoid repeated retries and expensive fallbacks.

## Installation completion check

The agent performs this check internally during the one-step install; users do not prepare a snapshot themselves. After installing files and applying the authorized native schedule, observe that the installed skill exists, read the native task back, and record the inventory format above with an additional `skillInstalled` boolean. This is evidence supplied by the host, not a claim inferred from the desired plan.

```bash
node --experimental-strip-types <skill-directory>/scripts/plan-schedule.ts --timezone Asia/Singapore --verify-installation readback.json --json
```

The script remains read-only. Exit 0 with `installation.state=installed-and-active` requires `skillInstalled=true` and exactly one matching ACTIVE task with the desired context, recurrence, model/effort, notifications and observed scheduler zone. Missing tasks, paused or mismatched settings, duplicates and missing skill files cannot produce a successful installation result. Incomplete installation returns exit 3; malformed evidence returns exit 1. These are configuration checks, not a paid inference test or proof of a usage-window start.

A plain filesystem installer has no standard post-install execution hook. The supported [installation entry](../INSTALL.md) asks Codex to install **and** activate in the same request. Read the installed instructions directly and finish the already-authorized setup; do not wait for skill discovery on a later turn.
