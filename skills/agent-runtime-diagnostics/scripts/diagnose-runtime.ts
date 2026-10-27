import { promises as fs } from "node:fs";
import path from "node:path";

type Layer = "process" | "transport" | "authentication" | "models" | "inference" | "state" | "ui";
type Status = "pass" | "fail" | "unknown" | "not-applicable";
type Severity = "blocker" | "warning" | "info";
interface Observation { layer?: Layer; status?: Status; evidence?: string; }
interface Finding { severity: Severity; code: string; message: string; layer?: Layer; }

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const snapshotArg = value("--snapshot") ?? args.find((arg) => !arg.startsWith("--"));
if (!snapshotArg) throw new Error("Usage: diagnose-runtime.ts --snapshot <runtime.json> [--json] [--fail-on-blocker]");
const snapshotPath = path.resolve(snapshotArg);
const parsed = JSON.parse(await fs.readFile(snapshotPath, "utf8")) as { engine?: string; observations?: Observation[] };
if (!Array.isArray(parsed.observations)) throw new Error("Runtime snapshot must contain an observations array");
const order: Layer[] = ["process", "transport", "authentication", "models", "inference", "state", "ui"];
const statuses = new Set<Status>(["pass", "fail", "unknown", "not-applicable"]);
const findings: Finding[] = [];
const add = (severity: Severity, code: string, message: string, layer?: Layer): void => {
  findings.push({ severity, code, message, layer });
};
const byLayer = new Map<Layer, Observation>();

for (const observation of parsed.observations) {
  if (!observation.layer || !order.includes(observation.layer)) {
    add("blocker", "layer-invalid", `Invalid or missing runtime layer: ${observation.layer ?? "<missing>"}`);
    continue;
  }
  if (byLayer.has(observation.layer)) add("blocker", "layer-duplicate", `Layer appears more than once: ${observation.layer}`, observation.layer);
  else byLayer.set(observation.layer, observation);
  if (!observation.status || !statuses.has(observation.status)) add("blocker", "status-invalid", `Invalid status: ${observation.status ?? "<missing>"}`, observation.layer);
  if (["pass", "fail"].includes(observation.status ?? "") && !observation.evidence?.trim()) add("blocker", "evidence-missing", `${observation.status} observation requires sanitized evidence`, observation.layer);
  if (observation.evidence && /(bearer\s+[a-z0-9._-]{12,}|(?:api[_-]?key|token|secret)\s*[:=]\s*[^*\s]{8,})/i.test(observation.evidence)) {
    add("blocker", "possible-secret", "Evidence may contain an unsanitized credential", observation.layer);
  }
}
for (const layer of order) {
  if (!byLayer.has(layer)) {
    byLayer.set(layer, { layer, status: "unknown" });
    add("warning", "layer-unobserved", `No observation supplied for ${layer}`, layer);
  }
}
const statusOf = (layer: Layer): Status => byLayer.get(layer)?.status ?? "unknown";
if (statusOf("inference") === "pass" && ["fail", "unknown"].includes(statusOf("process"))) add("blocker", "process-inference-contradiction", "Inference passed while process state is failed or unknown", "process");
if (statusOf("inference") === "pass" && statusOf("authentication") === "fail") add("blocker", "auth-inference-contradiction", "Inference passed while authentication is marked failed", "authentication");
if (statusOf("models") === "fail" && statusOf("inference") === "pass") add("info", "model-discovery-independent", "Model discovery failed while configured-model inference passed; do not mark the provider unusable solely from model refresh", "models");
if (statusOf("inference") === "pass" && statusOf("state") === "fail") add("warning", "state-aggregation-bug", "Inference works but aggregated availability state fails", "state");
if (statusOf("inference") === "pass" && statusOf("ui") === "fail") add("warning", "ui-gating-bug", "Inference works but the UI reports failure", "ui");
if (statusOf("process") === "pass" && statusOf("inference") !== "pass") add("info", "startup-not-usability", "Process startup is confirmed but usable inference is not", "inference");
const firstFailure = order.find((layer) => statusOf(layer) === "fail") ?? null;
const summary = {
  engine: parsed.engine ?? null,
  firstFailure,
  usableInference: statusOf("inference") === "pass",
  uiAvailable: statusOf("ui") === "pass",
  blockers: findings.filter((item) => item.severity === "blocker").length,
  warnings: findings.filter((item) => item.severity === "warning").length
};
const observations = order.map((layer) => ({ layer, status: statusOf(layer), evidence: byLayer.get(layer)?.evidence ?? null }));
const output = { snapshot: snapshotPath, summary, observations, findings };
if (args.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.layer ? ` (${finding.layer})` : ""}: ${finding.message}`);
  console.log(`first failure: ${summary.firstFailure ?? "none"}; usable inference: ${summary.usableInference}; UI available: ${summary.uiAvailable}`);
}
if (args.includes("--fail-on-blocker") && summary.blockers > 0) process.exitCode = 1;
