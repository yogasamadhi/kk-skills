import { promises as fs } from "node:fs";
import path from "node:path";

type Status = "planned" | "in-progress" | "implemented" | "verified" | "release-ready" | "production-ready" | "blocked" | "deferred" | "cancelled";
type Severity = "error" | "warning" | "info";
interface Item { id?: string; title?: string; status?: Status; acceptance?: string[]; evidence?: string[]; commands?: string[]; notes?: string; }
interface Finding { severity: Severity; code: string; message: string; item?: string; file?: string; }

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const ledgerArg = value("--ledger") ?? args.find((arg) => !arg.startsWith("--"));
if (!ledgerArg) throw new Error("Usage: check-ledger.ts --ledger <delivery.json> [--root <repository>] [--json] [--fail-on-incomplete]");
const ledgerPath = path.resolve(ledgerArg);
const root = path.resolve(value("--root") ?? path.dirname(ledgerPath));
const parsed = JSON.parse(await fs.readFile(ledgerPath, "utf8")) as { title?: string; targetStatus?: Status; declaredComplete?: boolean; items?: Item[] };
if (!Array.isArray(parsed.items)) throw new Error("Delivery ledger must contain an items array");
const rank: Partial<Record<Status, number>> = { planned: 0, "in-progress": 1, implemented: 2, verified: 3, "release-ready": 4, "production-ready": 5 };
const allStatuses = new Set<Status>([...Object.keys(rank) as Status[], "blocked", "deferred", "cancelled"]);
const target = parsed.targetStatus ?? "verified";
const findings: Finding[] = [];
const add = (severity: Severity, code: string, message: string, item?: string, file?: string): void => {
  findings.push({ severity, code, message, item, file });
};
const seen = new Set<string>();
let incomplete = 0;

if (rank[target] === undefined) add("error", "target-status-invalid", `Target status must be an ordered readiness state, received ${target}`);
for (const [index, item] of parsed.items.entries()) {
  const id = item.id?.trim() || `#${index + 1}`;
  if (!item.id?.trim()) add("error", "item-id-missing", "Item requires a stable ID", id);
  else if (seen.has(item.id)) add("error", "item-id-duplicate", `Duplicate item ID: ${item.id}`, id);
  else seen.add(item.id);
  if (!item.title?.trim()) add("error", "item-title-missing", "Item requires a title", id);
  if (!item.status || !allStatuses.has(item.status)) add("error", "item-status-invalid", `Invalid item status: ${item.status ?? "<missing>"}`, id);
  const acceptance = Array.isArray(item.acceptance) ? item.acceptance.filter(Boolean) : [];
  const evidence = Array.isArray(item.evidence) ? item.evidence.filter(Boolean) : [];
  const commands = Array.isArray(item.commands) ? item.commands.filter(Boolean) : [];
  if (acceptance.length === 0 && !["cancelled", "deferred"].includes(item.status ?? "")) add("error", "acceptance-missing", "Active item has no acceptance criteria", id);
  const itemRank = item.status ? rank[item.status] : undefined;
  if (itemRank !== undefined && itemRank >= rank.implemented! && evidence.length === 0) add("error", "implementation-evidence-missing", `${item.status} item has no evidence paths`, id);
  if (itemRank !== undefined && itemRank >= rank.verified! && commands.length === 0) add("error", "verification-command-missing", `${item.status} item records no executed verification command`, id);
  if (item.status === "blocked" && !item.notes?.trim()) add("warning", "blocker-unexplained", "Blocked item should explain the blocking condition", id);
  if (!["deferred", "cancelled"].includes(item.status ?? "") && (itemRank === undefined || itemRank < (rank[target] ?? Infinity))) incomplete += 1;
  for (const file of evidence) {
    const absolute = path.resolve(root, file);
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) add("error", "evidence-outside-root", `Evidence path leaves repository: ${file}`, id, file);
    else {
      try { await fs.access(absolute); } catch { add("error", "evidence-missing", `Evidence path does not exist: ${file}`, id, file); }
    }
  }
}
if (parsed.declaredComplete === true && incomplete > 0) add("error", "completion-claim-false", `Ledger declares completion but ${incomplete} active item(s) are below ${target}`);
const summary = {
  items: parsed.items.length,
  targetStatus: target,
  incomplete,
  errors: findings.filter((item) => item.severity === "error").length,
  warnings: findings.filter((item) => item.severity === "warning").length
};
const output = { ledger: ledgerPath, root, title: parsed.title ?? null, declaredComplete: parsed.declaredComplete ?? false, summary, findings };
if (args.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.item ? ` (${finding.item})` : ""}: ${finding.message}`);
  console.log(`${summary.items} item(s), ${summary.incomplete} below ${target}, ${summary.errors} error(s)`);
}
if (args.includes("--fail-on-incomplete") && (summary.errors > 0 || summary.incomplete > 0)) process.exitCode = 1;
