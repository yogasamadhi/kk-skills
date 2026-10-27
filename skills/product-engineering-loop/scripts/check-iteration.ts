import { promises as fs } from "node:fs";
import path from "node:path";

type Status = "planned" | "in-progress" | "implemented" | "verified" | "abandoned";
type Severity = "error" | "warning" | "info";
interface Iteration { id?: string; status?: Status; user?: string; problem?: string; hypothesis?: string; scope?: string[]; acceptance?: string[]; changes?: string[]; behaviorEvidence?: string[]; visualEvidence?: string[]; commands?: string[]; visibleChange?: boolean; learning?: string; nextDecision?: string; notes?: string; }
interface Finding { severity: Severity; code: string; message: string; iteration?: string; file?: string; }

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const ledgerArg = value("--ledger") ?? args.find((arg) => !arg.startsWith("--"));
if (!ledgerArg) throw new Error("Usage: check-iteration.ts --ledger <iterations.json> [--root <repository>] [--json] [--fail-on-error]");
const ledgerPath = path.resolve(ledgerArg);
const root = path.resolve(value("--root") ?? path.dirname(ledgerPath));
const parsed = JSON.parse(await fs.readFile(ledgerPath, "utf8")) as { product?: string; iterations?: Iteration[] };
if (!Array.isArray(parsed.iterations)) throw new Error("Iteration ledger must contain an iterations array");
const statuses = new Set<Status>(["planned", "in-progress", "implemented", "verified", "abandoned"]);
const findings: Finding[] = [];
const add = (severity: Severity, code: string, message: string, iteration?: string, file?: string): void => {
  findings.push({ severity, code, message, iteration, file });
};
const seen = new Set<string>();

async function checkPath(file: string, iteration: string): Promise<void> {
  const absolute = path.resolve(root, file);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) add("error", "path-outside-root", `Evidence path leaves repository: ${file}`, iteration, file);
  else {
    try { await fs.access(absolute); } catch { add("error", "path-missing", `Referenced path does not exist: ${file}`, iteration, file); }
  }
}

for (const [index, iteration] of parsed.iterations.entries()) {
  const id = iteration.id?.trim() || `#${index + 1}`;
  if (!iteration.id?.trim()) add("error", "iteration-id-missing", "Iteration requires a stable ID", id);
  else if (seen.has(iteration.id)) add("error", "iteration-id-duplicate", `Duplicate iteration ID: ${iteration.id}`, id);
  else seen.add(iteration.id);
  if (!iteration.status || !statuses.has(iteration.status)) add("error", "status-invalid", `Invalid iteration status: ${iteration.status ?? "<missing>"}`, id);
  if (!iteration.user?.trim()) add("warning", "target-user-missing", "Iteration does not name the target user", id);
  if (!iteration.problem?.trim()) add("error", "problem-missing", "Iteration requires an observed product problem", id);
  if (!iteration.hypothesis?.trim() && iteration.status !== "abandoned") add("error", "hypothesis-missing", "Iteration requires a testable hypothesis", id);
  if (!Array.isArray(iteration.scope) || iteration.scope.length === 0) add("error", "scope-missing", "Iteration requires a bounded scope", id);
  if (!Array.isArray(iteration.acceptance) || iteration.acceptance.length === 0) add("error", "acceptance-missing", "Iteration requires acceptance criteria", id);
  const changes = Array.isArray(iteration.changes) ? iteration.changes : [];
  const behavior = Array.isArray(iteration.behaviorEvidence) ? iteration.behaviorEvidence : [];
  const visuals = Array.isArray(iteration.visualEvidence) ? iteration.visualEvidence : [];
  const commands = Array.isArray(iteration.commands) ? iteration.commands : [];
  if (["implemented", "verified"].includes(iteration.status ?? "") && changes.length === 0) add("error", "changes-missing", `${iteration.status} iteration records no changed paths`, id);
  if (iteration.status === "verified" && behavior.length === 0) add("error", "behavior-evidence-missing", "Verified iteration has no behavior evidence", id);
  if (iteration.status === "verified" && iteration.visibleChange !== false && visuals.length === 0) add("error", "visual-evidence-missing", "Verified visible iteration has no visual evidence", id);
  if (iteration.status === "verified" && commands.length === 0) add("error", "commands-missing", "Verified iteration records no executed verification commands", id);
  if (iteration.status === "verified" && !iteration.learning?.trim()) add("warning", "learning-missing", "Verified iteration records no product learning", id);
  if (iteration.status === "verified" && !iteration.nextDecision?.trim()) add("warning", "next-decision-missing", "Verified iteration records no next decision", id);
  if (iteration.status === "abandoned" && !iteration.notes?.trim()) add("warning", "abandonment-unexplained", "Abandoned iteration should record why it stopped", id);
  for (const file of [...changes, ...behavior, ...visuals]) await checkPath(file, id);
}
const summary = {
  iterations: parsed.iterations.length,
  verified: parsed.iterations.filter((iteration) => iteration.status === "verified").length,
  errors: findings.filter((item) => item.severity === "error").length,
  warnings: findings.filter((item) => item.severity === "warning").length
};
const output = { ledger: ledgerPath, root, product: parsed.product ?? null, summary, findings };
if (args.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.iteration ? ` (${finding.iteration})` : ""}: ${finding.message}`);
  console.log(`${summary.iterations} iteration(s), ${summary.verified} verified, ${summary.errors} error(s)`);
}
if (args.includes("--fail-on-error") && summary.errors > 0) process.exitCode = 1;
