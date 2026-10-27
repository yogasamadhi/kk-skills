---
name: usage-window-scheduler
description: "Install and enable minimal, low-cost Codex messages at fixed daily times to attempt to start a subscription usage window. Use for 安装并启用定时任务, quota warm-ups, first-message timers, 定时启动额度计时, and managing those schedules. Complete authorized installation and activation together; only Codex is currently supported."
---

# Usage Window Scheduler

Create a small scheduled inference request at **05:00, 10:00, 10:01, 15:00, 15:01 and 15:02** in the user's time zone. Each run should only reply `OK`. The objective is to start an eligible subscription window before the user's working hours.

## Install and enable in one operation

The supported installation entry is [INSTALL.md](INSTALL.md). Its one-line user request explicitly authorizes installing the skill **and enabling standalone scheduled runs** with a cheap model. Complete that request in the same turn: obtain/install files, read this skill directly, resolve defaults, reconcile, create or resume the native schedule, and verify it. Do not stop after copying files or require another activation message. A restart is not needed to read the installed instructions and finish setup in the current turn.

When session context explicitly establishes that installation includes activation, carry that authorization forward. Explain the chosen defaults in a short progress update and continue without another permission question. Defaults are the trusted user time zone, the six exact daily times above, with no evening run, the available economical model, failures-only notifications, and profile `default`; do not ask the user to fill in JSON, choose hours, or run the planner manually. Ask only for genuinely missing data or a mode choice required by the host that the user has not already made.

File discovery alone is not an installer hook. Ordinary file-only installs, source-code development, and explicit previews must stay within their requested scope. Do not claim a file copy activated anything. If a generic installer only downloads files, the coordinating agent must immediately read this skill and perform the already-authorized activation; the user should not need a second turn.

Use these completion states: **installed and active** only after native read-back matches; **installed, activation blocked** if the scheduler is unavailable or a required setting cannot be represented; **preview only** for a preview request. Include the actual blocker when relevant, never report partial setup as successful installation. The planner's `--verify-installation` mode can check the observed read-back; see [references/codex.md](references/codex.md).

## Establish the target

- Determine whether the user wants install-and-enable, a preview, an update, or a pause. Install-and-enable already authorizes the described activation; do not ask again. Writing the skill or showing a plan alone does not.
- Use the user's IANA time zone from trusted session context; ask only if it is unknown. Never substitute UTC or the execution host's time zone silently.
- Support Codex with **ChatGPT sign-in**. API keys and custom gateways may use separate billing and cannot be assumed to start the subscription's timer. No credential extraction is needed.
- Prefer `gpt-6-luna` at `low` effort **when available** for this minimal task. Check current model availability and supported effort in the live tool schema/model picker, without sending test inference. Allow another user-selected economical model; do not fall back silently to an expensive default. See [references/codex.md](references/codex.md) for dated official evidence and operating limits.

## Choose the scheduled context

Discover the host's `automation_update` capability and inspect its current schema before any write. Prefer native scheduling over editing scheduler files or installing OS jobs.

- By default use a chat-attached schedule (`heartbeat`) as required by the host. It reuses the chat context and model. A prompt saying “use Luna” does **not** change the execution model.
- If the user explicitly requests standalone runs/new context each time, use the standalone Codex adapter below. This pins a cheap model and avoids the growing chat history. Both the documented install request and UI default prompt explicitly request this mode; do not ask for that choice again.
- If the user wants a cheap model but the current chat uses a costly model and the heartbeat API cannot override it, explain that limitation and offer standalone runs. Obtain that missing mode choice before creating them; never create standalone tasks as a workaround without authorization. Do not change the user's general model configuration.

## Preview and reconcile

For an authorized standalone workflow, generate the desired configuration with the bundled, read-only helper:

```bash
node --experimental-strip-types <skill-directory>/scripts/plan-schedule.ts --timezone Asia/Singapore --json
```

The default is **one automation with six exact daily execution times**, with no evening run. Override `--times`, `--model`, or `--profile` only when requested. `--hours` with `--minute` remains available for schedules sharing a minute. The helper emits a draft; it neither installs jobs nor sends messages. Run `--help` for options. It rejects unsupported platforms.

Preserve exact hour/minute pairs: a simple hour list and minute list would schedule unwanted combinations. The helper uses RFC 5545 `BYSETPOS` for an irregular list. For this default it selects only the six requested slots, excluding 05:01, 05:02 and 10:02. The later minute slots are explicitly scheduled independent requests even if an earlier one succeeds; they are not an open-ended retry policy and do not represent six new usage windows.

1. Inspect existing automations using the available list/read mechanism. In the desktop host, inspect only the relevant `$CODEX_HOME/automations/*/automation.toml` metadata (default `~/.codex/automations/`), then use `automation_update` in view mode to resolve matching IDs. Never print unrelated prompts or secrets. Missing directory means no local records; an inaccessible or malformed listing means inventory is unknown, not empty.
2. Match the stable name `Usage Window / Codex / <profile>`, not a substring such as “quota”. An existing task with that name must be inspected before adoption. Multiple matches are a conflict; do not create another task or delete duplicates automatically.
3. Optionally pass an inventory snapshot with `--existing <inventory.json>` using the format in [references/codex.md](references/codex.md). The planner reports `create`, `update`, `noop`, `pause`, or `conflict`; its inventory is evidence, not authorization. Without a snapshot the action is `inspect`, not `create`.
4. Show the local times, time zone, model, effort, six requests/day, execution context, and notification policy. Reuse an existing ID rather than duplicating a task. Preserve unrelated saved fields when updating.

## Apply and verify

- For standalone runs, use the current `automation_update` schema with the planned fields, `kind=cron`, and local execution. Resolve a project with the project's listing capability only if the host requires one; prefer projectless execution for a one-word request. Do not attach an arbitrary code repository. If projectless standalone execution is unavailable, stop at the concrete preview and explain the required host choice.
- For heartbeat runs, use the same times and minimal prompt, without unsupported model fields. Confirm that the actual chat model satisfies the user's cost preference before activation.
- The desired prompt is: `Reply only OK. Do not use tools, read files, or perform any other work.` Keep scheduling and notification instructions out of this inference prompt. Set `notificationPolicy=failed_runs_only` where supported.
- **Time-zone gate:** the RRULE contains wall-clock times, not an IANA zone. The helper's `schedule.timeZone` is review metadata, not a tool argument. Verify the scheduler's configured zone and next-run display before activation. Do not insert an unsupported `timezone` field or convert to a fixed UTC offset for a DST zone. If the host cannot represent the requested zone, leave the task paused or uncreated and explain the mismatch.
- Call the native tool once with the resolved ID/full required fields. On failure, inspect the saved state before retrying; never retry an uncertain creation blindly. Read it back and verify its ID, status, recurrence, effective model/effort, notifications, and next local execution times. A tool response alone does not prove all six times were accepted. If the host rejects a multi-hour rule, report the rejection and obtain authorization for an alternative rather than silently installing partial times.
- Do not trigger a paid “test now” unless authorized. Report configuration verified separately from an actual scheduled request and from a server-observed window start. If usage inspection is available, its reset timestamp can provide evidence after the first scheduled run; `OK` alone does not prove timer alignment.
- Pause by the exact managed ID, preserving its other settings. Do not delete tasks, change authentication, purchase credits, retry exhausted quota, or replay missed slots without a request. Normal operation makes one attempt per scheduled slot; scheduler-level retries/catch-up behavior must be checked in the host and cannot be guaranteed by the prompt.

## Scope and extension

This starts no new allowance while an existing window is active and does not reset weekly limits. Timing delays can cause a slot to arrive before the prior window expires. Sleeping/offline machines and an unavailable model may prevent a run. Explain these limits briefly when presenting the plan.

Only Codex is implemented. For an additional platform, follow the adapter checklist in [references/platform-adapters.md](references/platform-adapters.md); do not route its traffic through an OpenAI API call and label that a successful subscription warm-up.
