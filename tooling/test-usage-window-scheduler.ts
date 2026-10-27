import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm, cp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

interface PlanResult {
  schedule: { times: string[]; scheduledRequestsPerDay: number; timeZone: string };
  desired: { name: string; rrule: string; model: string; reasoningEffort: string; notificationPolicy: string };
  reconciliation: { action: string; id?: string; changedFields?: string[] };
  mode: string;
  installation?: { state: string; complete: boolean; taskId?: string };
  error: string;
}

const skill = path.resolve("skills/usage-window-scheduler");
const temporary = await mkdtemp(path.join(os.tmpdir(), "usage-window-scheduler-"));
const script = path.join(temporary, "standalone-skill", "scripts", "plan-schedule.ts");
let assertions = 0;

function run(args: string[], expectedStatus = 0): PlanResult {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", script, ...args], {
    cwd: temporary,
    encoding: "utf8",
    shell: false
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  assertions += 1;
  if (expectedStatus === 1) return { error: result.stderr } as PlanResult;
  return JSON.parse(result.stdout) as PlanResult;
}

async function inventory(automations: unknown[], schedulerTimeZone = "Asia/Singapore"): Promise<string> {
  const file = path.join(temporary, "inventory.json");
  await writeFile(file, JSON.stringify({ schedulerTimeZone, automations }));
  return file;
}

// Independent daily expansion of the RFC 5545 subset emitted by the planner.
// This checks actual hour/minute pairs, including negative assertions for extras.
function dailyOccurrences(rule: string): string[] {
  const parts = new Map<string, string>(rule.replace(/^RRULE:/, "").split(";").map((part): [string, string] => {
    const [key, value] = part.split("=");
    return [key, value];
  }));
  assert.equal(parts.get("FREQ"), "DAILY");
  const hours = new Set((parts.get("BYHOUR") ?? "").split(",").map(Number));
  const minutes = new Set((parts.get("BYMINUTE") ?? "").split(",").map(Number));
  const candidates: string[] = [];
  for (let minuteOfDay = 0; minuteOfDay < 24 * 60; minuteOfDay += 1) {
    const hour = Math.floor(minuteOfDay / 60);
    const minute = minuteOfDay % 60;
    if (hours.has(hour) && minutes.has(minute)) candidates.push(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }
  const positions = parts.get("BYSETPOS")?.split(",").map(Number);
  return positions ? positions.map((position) => candidates[position - 1]) : candidates;
}

try {
  // Copy just this skill: no workspace dependencies or sibling skills may be needed.
  await cp(skill, path.join(temporary, "standalone-skill"), { recursive: true });
  const base = ["--timezone", "Asia/Singapore", "--json"];
  const preview = run(base);
  const defaultTimes = ["05:00", "10:00", "10:01", "15:00", "15:01", "15:02"];
  assert.deepEqual(preview.schedule.times, defaultTimes);
  assert.equal(preview.schedule.scheduledRequestsPerDay, 6);
  assert.deepEqual(dailyOccurrences(preview.desired.rrule), defaultTimes);
  for (const extra of ["05:01", "05:02", "10:02", "20:00"]) assert.ok(!dailyOccurrences(preview.desired.rrule).includes(extra));
  assert.equal(preview.desired.model, "gpt-6-luna");
  assert.equal(preview.desired.reasoningEffort, "low");
  assert.equal(preview.desired.notificationPolicy, "failed_runs_only");
  assert.equal(preview.reconciliation.action, "inspect");
  assert.equal(preview.mode, "preview");
  assert.ok(!Object.hasOwn(preview.desired, "timeZone"));
  assert.ok(!Object.hasOwn(preview.desired, "mode"));

  const empty = await inventory([]);
  assert.equal(run([...base, "--existing", empty]).reconciliation.action, "create");
  const task = { id: "managed-123", ...preview.desired };
  const saved = await inventory([task, { id: "unrelated", name: "Other task" }]);
  assert.equal(run([...base, "--existing", saved]).reconciliation.action, "noop");
  const previousSchedule = await inventory([{ ...task, rrule: "FREQ=DAILY;BYHOUR=5,10,15,20;BYMINUTE=0;BYSECOND=0" }]);
  const migration = run([...base, "--existing", previousSchedule]);
  assert.equal(migration.reconciliation.action, "update");
  assert.equal(migration.reconciliation.id, task.id);
  assert.deepEqual(migration.reconciliation.changedFields, ["rrule"]);
  const normalized = await inventory([{ ...task, rrule: "RRULE:BYMINUTE=2,1,0;BYSECOND=0;BYHOUR=15,10,5;BYSETPOS=9,8,7,5,4,1;INTERVAL=1;FREQ=DAILY" }]);
  assert.equal(run([...base, "--existing", normalized]).reconciliation.action, "noop");
  await inventory([task, { id: "unrelated", name: "Other task" }]);
  const updated = run([...base, "--existing", saved, "--hours", "15,10", "--minute", "5", "--model", "economical-model"]);
  assert.equal(updated.reconciliation.action, "update");
  assert.equal(updated.reconciliation.id, task.id);
  assert.deepEqual(updated.schedule.times, ["10:05", "15:05"]);
  assert.equal(updated.desired.name, preview.desired.name);
  assert.ok(updated.reconciliation.changedFields?.includes("model"));
  assert.deepEqual(dailyOccurrences(updated.desired.rrule), ["10:05", "15:05"]);
  const exact = run([...base, "--times", "15:02,05:00,10:01"]);
  assert.deepEqual(exact.schedule.times, ["05:00", "10:01", "15:02"]);
  assert.deepEqual(dailyOccurrences(exact.desired.rrule), exact.schedule.times);
  const fullGrid = run([...base, "--times", "05:00,05:01,10:00,10:01"]);
  assert.deepEqual(dailyOccurrences(fullGrid.desired.rrule), fullGrid.schedule.times);
  assert.ok(!fullGrid.desired.rrule.includes("BYSETPOS"));
  const midnight = run([...base, "--times", "23:59,00:00"]);
  assert.deepEqual(dailyOccurrences(midnight.desired.rrule), ["00:00", "23:59"]);
  assert.equal(run([...base, "--existing", saved, "--pause"]).reconciliation.action, "pause");
  assert.equal(run([...base, "--existing", await inventory([{ ...task, status: "PAUSED" }]), "--pause"]).reconciliation.action, "noop");
  assert.equal(run([...base, "--existing", await inventory([{ ...task, status: "PAUSED" }])]).reconciliation.action, "update");
  assert.equal(run([...base, "--existing", await inventory([]), "--pause"]).reconciliation.action, "noop");
  assert.equal(run([...base, "--existing", await inventory([task, { ...task, id: "duplicate" }])], 2).reconciliation.action, "conflict");
  assert.equal(run([...base, "--existing", await inventory([task], "Europe/London")], 2).reconciliation.action, "conflict");
  assert.equal(run([...base, "--existing", await inventory([task], "Europe/London"), "--pause"]).reconciliation.action, "pause");
  assert.equal(run([...base, "--existing", await inventory([{ ...task, kind: "heartbeat" }])], 2).reconciliation.action, "conflict");
  assert.equal(run([...base, "--existing", await inventory([{ ...task, projectId: "some-project" }])], 2).reconciliation.action, "conflict");
  assert.match(run([...base, "--existing", await inventory([{ id: task.id, name: task.name }])], 1).error, /incomplete/);
  assert.match(run([...base, "--existing", await inventory([{ name: "Incomplete entry" }])], 1).error, /requires/);
  const malformed = path.join(temporary, "malformed.json");
  await writeFile(malformed, JSON.stringify({ automations: [] }));
  assert.match(run([...base, "--existing", malformed], 1).error, /schedulerTimeZone/);

  const verification = path.join(temporary, "verification.json");
  async function verify(skillInstalled: boolean, automations: unknown[], schedulerTimeZone = "Asia/Singapore", expectedStatus = 3): Promise<PlanResult> {
    await writeFile(verification, JSON.stringify({ skillInstalled, automations, schedulerTimeZone }));
    return run([...base, "--verify-installation", verification], expectedStatus);
  }
  assert.deepEqual((await verify(true, [task], "Asia/Singapore", 0)).installation, {
    state: "installed-and-active", complete: true, taskId: task.id
  });
  assert.equal((await verify(true, [])).installation?.state, "skill-installed-only");
  assert.equal((await verify(false, [task])).installation?.state, "not-installed");
  assert.equal((await verify(true, [{ ...task, status: "PAUSED" }])).installation?.complete, false);
  assert.equal((await verify(true, [{ ...task, model: "expensive-model" }])).installation?.state, "activation-incomplete");
  assert.equal((await verify(true, [{ ...task, rrule: "FREQ=DAILY;BYHOUR=5;BYMINUTE=0;BYSECOND=0" }])).installation?.complete, false);
  assert.equal((await verify(true, [{ ...task, rrule: "FREQ=DAILY;BYHOUR=5,10,15;BYMINUTE=0,1,2;BYSECOND=0" }])).installation?.complete, false);
  assert.equal((await verify(true, [task], "Europe/London")).installation?.state, "activation-blocked");
  assert.equal((await verify(true, [task, { ...task, id: "duplicate" }])).installation?.complete, false);
  assert.match(run([...base, "--verify-installation", await inventory([task])], 1).error, /skillInstalled/);
  assert.match(run([...base, "--verify-installation", verification, "--pause"], 1).error, /cannot be combined/);

  // Wall-clock schedules are stable across DST; the host resolves next-run instants.
  const london = run(["--timezone", "Europe/London", "--json"]);
  assert.deepEqual(london.schedule.times, preview.schedule.times);
  assert.equal(london.desired.rrule, preview.desired.rrule);
  assert.equal(london.schedule.timeZone, "Europe/London");
  for (const args of [
    [], ["--timezone", "Mars/Olympus"], ["--timezone", "+08:00"],
    [...base, "--platform", "claude"], [...base, "--hours", "4,4,9"],
    [...base, "--hours", "24"], [...base, "--hours", "4,"],
    [...base, "--hours", "4.5"], [...base, "--minute", "60"],
    [...base, "--profile", "../other"], [...base, "--pause"],
    [...base, "--model", "$(unwanted)"], [...base, "--apply"],
    [...base, "--timezone", "UTC"], [...base, "--hours"],
    [...base, "--times", "05:00,05:00"], [...base, "--times", "5:00"],
    [...base, "--times", "24:00"], [...base, "--times", "10:60"],
    [...base, "--times", "05:00,"], [...base, "--times", "05:00", "--hours", "5"],
    [...base, "--times", "05:00", "--minute", "0"]
  ]) run(args, 1);

  const help = spawnSync(process.execPath, ["--experimental-strip-types", script, "--help"], { encoding: "utf8", cwd: temporary });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Read-only/);
  // Preview must not create scheduler/configuration files in its working directory.
  assert.deepEqual((await readdir(temporary)).sort(), ["inventory.json", "malformed.json", "standalone-skill", "verification.json"]);
  console.log(`${assertions} scheduler scenarios passed (isolated skill copy, no live requests)`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
