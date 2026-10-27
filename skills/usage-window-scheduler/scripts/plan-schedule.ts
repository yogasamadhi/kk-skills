import { readFile } from "node:fs/promises";

type RecordValue = Record<string, unknown>;
type Action = "inspect" | "create" | "update" | "noop" | "pause" | "conflict";

const DEFAULT_TIMES = "05:00,10:00,10:01,15:00,15:01,15:02";

interface Desired {
  name: string;
  kind: "cron";
  executionEnvironment: "local";
  destination: "local";
  projectId: null;
  prompt: string;
  rrule: string;
  model: string;
  reasoningEffort: "low";
  notificationPolicy: "failed_runs_only";
  status: "ACTIVE";
}

function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function zone(value: string): string {
  // Intl also accepts numeric offsets in newer Node versions; require a named zone.
  if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(value)) {
    throw new Error(`Invalid IANA time zone: ${value}`);
  }
  try {
    return new Intl.DateTimeFormat("en", { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new Error(`Invalid IANA time zone: ${value}`);
  }
}

function integer(value: string, maximum: number, label: string): number {
  if (!/^\d{1,2}$/.test(value) || Number(value) > maximum) {
    throw new Error(`${label} must be an integer from 0 to ${maximum}: ${value}`);
  }
  return Number(value);
}

function timeLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function dailySchedule(values: Map<string, string>): { times: string[]; rrule: string } {
  const explicitTimes = values.get("--times");
  const hourList = values.get("--hours");
  if (explicitTimes !== undefined && (hourList !== undefined || values.has("--minute"))) {
    throw new Error("--times cannot be combined with --hours or --minute");
  }
  if (values.has("--minute") && hourList === undefined) throw new Error("--minute requires --hours");
  let slots: number[];
  if (hourList !== undefined) {
    const hours = hourList.split(",").map((value) => integer(value.trim(), 23, "Hour"));
    if (new Set(hours).size !== hours.length) throw new Error("Hours must be unique");
    const minute = integer(values.get("--minute") ?? "0", 59, "Minute");
    slots = hours.map((hour) => hour * 60 + minute);
  } else {
    slots = (explicitTimes ?? DEFAULT_TIMES).split(",").map((value) => {
      const match = value.trim().match(/^(\d{2}):(\d{2})$/);
      if (!match) throw new Error(`Time must use HH:mm: ${value}`);
      return integer(match[1], 23, "Hour") * 60 + integer(match[2], 59, "Minute");
    });
    if (new Set(slots).size !== slots.length) throw new Error("Times must be unique");
  }
  slots.sort((left, right) => left - right);
  const hours = [...new Set(slots.map((slot) => Math.floor(slot / 60)))];
  const minutes = [...new Set(slots.map((slot) => slot % 60))].sort((left, right) => left - right);
  const candidates = hours.flatMap((hour) => minutes.map((minute) => hour * 60 + minute));
  let rrule = `FREQ=DAILY;BYHOUR=${hours.join(",")};BYMINUTE=${minutes.join(",")};BYSECOND=0`;
  if (candidates.length !== slots.length) {
    // RFC 5545 applies BYSETPOS after the hour/minute expansion within each day.
    // Select exact pairs, rather than scheduling the entire Cartesian product.
    const positions = slots.map((slot) => candidates.indexOf(slot) + 1);
    if (positions.some((position) => position > 366)) throw new Error("Exact daily schedule exceeds the supported BYSETPOS range (1–366)");
    rrule += `;BYSETPOS=${positions.join(",")}`;
  }
  return { times: slots.map(timeLabel), rrule };
}

function recurrenceKey(value: string): string {
  // Native views can add RRULE: and reorder set-valued hours/fields.
  return value.trim().replace(/^RRULE:/i, "").toUpperCase().split(";")
    .filter((field) => field !== "INTERVAL=1")
    .map((field) => {
      const [key, entry] = field.split("=");
      return entry && /^\d+(?:,\d+)*$/.test(entry)
        ? `${key}=${entry.split(",").map(Number).sort((left, right) => left - right).join(",")}`
        : field;
    }).sort().join(";");
}

const help = `Usage: node --experimental-strip-types plan-schedule.ts --timezone <IANA> [options]

Read-only standalone Codex schedule planner. Does not install jobs or send messages.

  --timezone <IANA>  Required; e.g. Asia/Singapore or Europe/London
  --platform codex   Only implemented platform (default: codex)
  --times <list>     Exact HH:mm pairs (default: ${DEFAULT_TIMES})
  --hours <list>     Alternative schedule: unique daily hours, comma-separated
  --minute <0-59>    With --hours, same minute for each hour (default: 0)
  --model <id>       Economical model candidate (default: gpt-6-luna)
  --profile <name>   Stable managed identity (default: default)
  --existing <file>  Inspected inventory JSON; absent means inspect, not create
  --verify-installation <file>
                    Verify installed files + native read-back in one snapshot
  --pause            Plan pausing the matching task; requires --existing
  --json             Machine-readable output
  --help             Show this help

Activation needs explicit standalone authorization, ChatGPT sign-in,
live model/effort availability, and verification of the scheduler's time zone.`;

function parse(argv: string[]): { values: Map<string, string>; json: boolean; pause: boolean } {
  const valueFlags = new Set(["--timezone", "--platform", "--times", "--hours", "--minute", "--model", "--profile", "--existing", "--verify-installation"]);
  const seen = new Set<string>();
  const values = new Map<string, string>();
  let json = false;
  let pause = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (seen.has(flag)) throw new Error(`Duplicate option: ${flag}`);
    seen.add(flag);
    if (flag === "--json") json = true;
    else if (flag === "--pause") pause = true;
    else if (valueFlags.has(flag)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
      values.set(flag, value);
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return { values, json, pause };
}

function reconcile(inventory: unknown, desired: Desired, timeZone: string, pause: boolean): {
  action: Action; reason: string; id?: string; changedFields?: string[];
} {
  if (!record(inventory) || !Array.isArray(inventory.automations)) {
    throw new Error("Inventory must be an object with an automations array");
  }
  if (typeof inventory.schedulerTimeZone !== "string") {
    throw new Error("Inventory requires an observed schedulerTimeZone");
  }
  const schedulerZone = zone(inventory.schedulerTimeZone);
  if (inventory.automations.some((item) => !record(item) || typeof item.id !== "string" || !item.id || typeof item.name !== "string")) {
    throw new Error("Every inventory entry requires a non-empty id and a name");
  }
  const matches = (inventory.automations as RecordValue[]).filter((item) => item.name === desired.name);
  if (matches.length > 1) return { action: "conflict", reason: "Multiple tasks have the managed name; resolve duplicates first" };
  const existing = matches[0];
  const id = existing?.id as string | undefined;
  // A pause remains possible even if the scheduler's zone has changed.
  if (!pause && schedulerZone !== timeZone) {
    return { action: "conflict", reason: `Scheduler time zone ${schedulerZone} differs from requested ${timeZone}`, id };
  }
  if (!existing) return { action: pause ? "noop" : "create", reason: pause ? "No matching task to pause" : "Inspected inventory has no matching task" };
  const required = ["kind", "executionEnvironment", "projectId", "prompt", "rrule", "model", "reasoningEffort", "notificationPolicy", "status"];
  if (required.some((key) => !Object.hasOwn(existing, key))) throw new Error("Matching task has an incomplete saved configuration");
  if (existing.status !== "ACTIVE" && existing.status !== "PAUSED") throw new Error("Matching task has an invalid status");
  if (pause) return { action: existing.status === "PAUSED" ? "noop" : "pause", reason: "Preserve saved fields and pause this ID", id };
  if (existing.kind !== "cron" || existing.executionEnvironment !== "local" || existing.projectId !== null || (existing.destination ?? "local") !== "local") {
    return { action: "conflict", reason: "Matching task uses a different execution context; do not migrate it automatically", id };
  }
  if (["prompt", "rrule", "model", "reasoningEffort"].some((key) => typeof existing[key] !== "string") ||
      ![null, "failed_runs_only"].includes(existing.notificationPolicy as null | string)) {
    throw new Error("Matching task has invalid saved settings");
  }
  const managed = ["prompt", "rrule", "model", "reasoningEffort", "notificationPolicy", "status"] as const;
  const changedFields = managed.filter((key) => key === "rrule"
    ? recurrenceKey(existing.rrule as string) !== recurrenceKey(desired.rrule)
    : existing[key] !== desired[key]);
  return {
    action: changedFields.length ? "update" : "noop",
    reason: changedFields.length ? "Update this ID and preserve unrelated saved fields" : "Managed settings already match",
    id,
    changedFields
  };
}

async function main(): Promise<void> {
  if (process.argv.slice(2).length === 1 && process.argv[2] === "--help") {
    console.log(help);
    return;
  }
  const { values, json, pause } = parse(process.argv.slice(2));
  const platform = values.get("--platform") ?? "codex";
  if (platform !== "codex") throw new Error(`Unsupported platform: ${platform}. Only codex is implemented.`);
  const rawZone = values.get("--timezone");
  if (!rawZone) throw new Error("--timezone is required; use the user's IANA time zone");
  const timeZone = zone(rawZone);
  const schedule = dailySchedule(values);
  const profile = values.get("--profile") ?? "default";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile) || profile.length > 48) throw new Error("Profile must use lowercase letters, numbers and hyphens, at most 48 characters");
  const model = values.get("--model") ?? "gpt-6-luna";
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(model)) throw new Error("Invalid model ID");
  const desired: Desired = {
    name: `Usage Window / Codex / ${profile}`,
    kind: "cron",
    executionEnvironment: "local",
    destination: "local",
    projectId: null,
    prompt: "Reply only OK. Do not use tools, read files, or perform any other work.",
    rrule: schedule.rrule,
    model,
    reasoningEffort: "low",
    notificationPolicy: "failed_runs_only",
    status: "ACTIVE"
  };
  const existingFile = values.get("--existing");
  const verificationFile = values.get("--verify-installation");
  if (verificationFile && (existingFile || pause)) throw new Error("--verify-installation cannot be combined with --existing or --pause");
  if (pause && !existingFile) throw new Error("--pause requires an inspected --existing inventory");
  const snapshotFile = verificationFile ?? existingFile;
  const snapshot: unknown = snapshotFile ? JSON.parse(await readFile(snapshotFile, "utf8")) : undefined;
  const reconciliation = snapshotFile
    ? reconcile(snapshot, desired, timeZone, pause)
    : { action: "inspect" as Action, reason: "Inspect existing automations and scheduler time zone before applying" };
  let installation: { state: string; complete: boolean; taskId?: string } | undefined;
  if (verificationFile) {
    if (!record(snapshot) || typeof snapshot.skillInstalled !== "boolean") {
      throw new Error("Installation snapshot requires observed skillInstalled (boolean)");
    }
    const state = !snapshot.skillInstalled ? "not-installed"
      : reconciliation.action === "noop" ? "installed-and-active"
      : reconciliation.action === "create" ? "skill-installed-only"
      : reconciliation.action === "conflict" ? "activation-blocked" : "activation-incomplete";
    installation = { state, complete: state === "installed-and-active", taskId: reconciliation.id };
  }
  const plan = {
    schemaVersion: 1,
    platform,
    operation: verificationFile ? "verify-installation" : pause ? "pause" : "activate",
    mode: "preview",
    schedule: {
      timeZone,
      times: schedule.times,
      scheduledRequestsPerDay: schedule.times.length
    },
    desired,
    reconciliation,
    ...(installation ? { installation } : {}),
    activationRequires: ["explicit-standalone-authorization", "chatgpt-sign-in", "live-model-and-low-effort-availability", "scheduler-timezone-and-next-run-verification"],
    effect: "Attempt a minimal subscription request; does not reset active windows or weekly allowance"
  };
  if (json) console.log(JSON.stringify(plan, null, 2));
  else {
    console.log(`${desired.name}\nPreview only: ${plan.schedule.times.join(", ")} (${timeZone})`);
    console.log(`${model} / low; ${schedule.times.length} scheduled request(s)/day; failures-only notifications`);
    console.log(`${reconciliation.action}: ${reconciliation.reason}`);
    if (installation) console.log(`Installation: ${installation.state}${installation.taskId ? ` (${installation.taskId})` : ""}`);
    console.log(`RRULE: ${desired.rrule}\n${plan.effect}`);
  }
  if (installation && !installation.complete) process.exitCode = 3;
  else if (reconciliation.action === "conflict") process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
