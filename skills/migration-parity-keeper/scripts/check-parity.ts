import { promises as fs } from "node:fs";
import path from "node:path";

type Status = "matched" | "partial" | "missing" | "accepted-gap" | "not-applicable";
type Severity = "blocker" | "warning" | "info";
interface ParityItem { id?: string; domain?: string; capability?: string; required?: boolean; status?: Status; legacyEvidence?: string[]; newEvidence?: string[]; testEvidence?: string[]; rationale?: string; }
interface Finding { severity: Severity; code: string; message: string; item?: string; file?: string; }

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const manifestArg = value("--manifest") ?? args.find((arg) => !arg.startsWith("--"));
if (!manifestArg) throw new Error("Usage: check-parity.ts --manifest <parity.json> [--root <repository>] [--json] [--fail-on-gap]");
const manifestPath = path.resolve(manifestArg);
const root = path.resolve(value("--root") ?? path.dirname(manifestPath));
const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { migration?: string; cutoverRequested?: boolean; rollback?: { documented?: boolean; evidence?: string[] }; items?: ParityItem[] };
if (!Array.isArray(parsed.items)) throw new Error("Parity manifest must contain an items array");
const allowed = new Set<Status>(["matched", "partial", "missing", "accepted-gap", "not-applicable"]);
const findings: Finding[] = [];
const add = (severity: Severity, code: string, message: string, item?: string, file?: string): void => {
  findings.push({ severity, code, message, item, file });
};
const seen = new Set<string>();
let requiredGaps = 0;

async function checkPath(file: string, item: string): Promise<void> {
  const absolute = path.resolve(root, file);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) add("blocker", "evidence-outside-root", `Evidence path leaves repository: ${file}`, item, file);
  else {
    try { await fs.access(absolute); } catch { add("blocker", "evidence-missing", `Evidence path does not exist: ${file}`, item, file); }
  }
}

for (const [index, item] of parsed.items.entries()) {
  const id = item.id?.trim() || `#${index + 1}`;
  if (!item.id?.trim()) add("blocker", "item-id-missing", "Parity item requires a stable ID", id);
  else if (seen.has(item.id)) add("blocker", "item-id-duplicate", `Duplicate parity item ID: ${item.id}`, id);
  else seen.add(item.id);
  if (!item.domain?.trim()) add("blocker", "domain-missing", "Parity item requires a domain", id);
  if (!item.capability?.trim()) add("blocker", "capability-missing", "Parity item requires a capability", id);
  if (!item.status || !allowed.has(item.status)) add("blocker", "status-invalid", `Invalid parity status: ${item.status ?? "<missing>"}`, id);
  const legacy = Array.isArray(item.legacyEvidence) ? item.legacyEvidence : [];
  const current = Array.isArray(item.newEvidence) ? item.newEvidence : [];
  const tests = Array.isArray(item.testEvidence) ? item.testEvidence : [];
  if (item.status === "matched" && (legacy.length === 0 || current.length === 0)) add("blocker", "matched-evidence-incomplete", "Matched capability needs both legacy and new evidence", id);
  if (item.status === "matched" && tests.length === 0) add("warning", "matched-test-missing", "Matched capability has no test evidence", id);
  if (item.status === "accepted-gap" && !item.rationale?.trim()) add("blocker", "accepted-gap-unexplained", "Accepted gap requires a rationale", id);
  if (item.required === true && ["partial", "missing"].includes(item.status ?? "")) requiredGaps += 1;
  for (const file of [...legacy, ...current, ...tests]) await checkPath(file, id);
}
const rollbackEvidence = Array.isArray(parsed.rollback?.evidence) ? parsed.rollback!.evidence! : [];
for (const file of rollbackEvidence) await checkPath(file, "rollback");
if (parsed.cutoverRequested && requiredGaps > 0) add("blocker", "cutover-required-gaps", `Cutover requested with ${requiredGaps} required partial or missing item(s)`);
if (parsed.cutoverRequested && (!parsed.rollback?.documented || rollbackEvidence.length === 0)) add("blocker", "rollback-not-ready", "Cutover requested without documented rollback evidence");
const domains = [...new Set(parsed.items.map((item) => item.domain).filter((domain): domain is string => Boolean(domain)))];
const summary = {
  items: parsed.items.length,
  domains,
  requiredGaps,
  blockers: findings.filter((item) => item.severity === "blocker").length,
  warnings: findings.filter((item) => item.severity === "warning").length,
  cutoverReady: Boolean(parsed.cutoverRequested && requiredGaps === 0 && parsed.rollback?.documented && rollbackEvidence.length > 0 && !findings.some((item) => item.severity === "blocker"))
};
const output = { manifest: manifestPath, root, migration: parsed.migration ?? null, cutoverRequested: parsed.cutoverRequested ?? false, summary, findings };
if (args.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.item ? ` (${finding.item})` : ""}: ${finding.message}`);
  console.log(`${summary.items} item(s), ${summary.requiredGaps} required gap(s), ${summary.blockers} blocker(s)`);
}
if (args.includes("--fail-on-gap") && (summary.blockers > 0 || summary.requiredGaps > 0)) process.exitCode = 1;
