import { promises as fs } from "node:fs";
import path from "node:path";

type Severity = "blocker" | "warning" | "info";
interface Criterion { id?: string; label?: string; weight?: number; }
interface Constraint { id?: string; statement?: string; hard?: boolean; }
interface Option { id?: string; label?: string; scores?: Record<string, number>; hardConstraintViolations?: string[]; risks?: string[]; reversibility?: string; }
interface Source { title?: string; url?: string; checkedAt?: string; authoritative?: boolean; }
interface Finding { severity: Severity; code: string; message: string; option?: string; }

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const decisionArg = value("--decision") ?? args.find((arg) => !arg.startsWith("--"));
if (!decisionArg) throw new Error("Usage: score-decision.ts --decision <decision.json> [--json] [--fail-on-blocker]");
const decisionPath = path.resolve(decisionArg);
const parsed = JSON.parse(await fs.readFile(decisionPath, "utf8")) as { decision?: string; constraints?: Constraint[]; criteria?: Criterion[]; options?: Option[]; sources?: Source[]; recommendation?: string; rationale?: string };
if (!Array.isArray(parsed.criteria) || !Array.isArray(parsed.options)) throw new Error("Decision record requires criteria and options arrays");
const findings: Finding[] = [];
const add = (severity: Severity, code: string, message: string, option?: string): void => {
  findings.push({ severity, code, message, option });
};
const criterionIds = new Set<string>();
let weightTotal = 0;
for (const [index, criterion] of parsed.criteria.entries()) {
  const id = criterion.id?.trim() || `#${index + 1}`;
  if (!criterion.id?.trim()) add("blocker", "criterion-id-missing", "Criterion requires a stable ID");
  else if (criterionIds.has(criterion.id)) add("blocker", "criterion-id-duplicate", `Duplicate criterion ID: ${criterion.id}`);
  else criterionIds.add(criterion.id);
  if (!criterion.label?.trim()) add("blocker", "criterion-label-missing", `Criterion ${id} requires a label`);
  if (typeof criterion.weight !== "number" || !Number.isFinite(criterion.weight) || criterion.weight <= 0) add("blocker", "criterion-weight-invalid", `Criterion ${id} has invalid weight`);
  else weightTotal += criterion.weight;
}
if (Math.abs(weightTotal - 100) > 0.0001) add("blocker", "weights-not-100", `Criterion weights sum to ${weightTotal}, expected 100`);
const constraintIds = new Set((parsed.constraints ?? []).map((constraint) => constraint.id).filter((id): id is string => Boolean(id)));
if ((parsed.constraints ?? []).length === 0) add("warning", "constraints-missing", "No project constraints recorded");
const optionIds = new Set<string>();
const ranking: Array<{ id: string; label: string; score: number; eligible: boolean; violations: string[] }> = [];

for (const [index, option] of parsed.options.entries()) {
  const id = option.id?.trim() || `#${index + 1}`;
  if (!option.id?.trim()) add("blocker", "option-id-missing", "Option requires a stable ID", id);
  else if (optionIds.has(option.id)) add("blocker", "option-id-duplicate", `Duplicate option ID: ${option.id}`, id);
  else optionIds.add(option.id);
  if (!option.label?.trim()) add("blocker", "option-label-missing", "Option requires a label", id);
  let weighted = 0;
  for (const criterion of parsed.criteria) {
    if (!criterion.id || typeof criterion.weight !== "number") continue;
    const score = option.scores?.[criterion.id];
    if (typeof score !== "number" || !Number.isFinite(score) || score < 1 || score > 5) add("blocker", "score-invalid", `Score for ${criterion.id} must be between 1 and 5`, id);
    else weighted += score * criterion.weight / 100;
  }
  for (const scoreId of Object.keys(option.scores ?? {})) if (!criterionIds.has(scoreId)) add("warning", "score-criterion-unknown", `Score references unknown criterion ${scoreId}`, id);
  const violations = Array.isArray(option.hardConstraintViolations) ? option.hardConstraintViolations : [];
  for (const violation of violations) if (!constraintIds.has(violation)) add("blocker", "constraint-violation-unknown", `Unknown hard-constraint ID: ${violation}`, id);
  if (!Array.isArray(option.risks) || option.risks.length === 0) add("warning", "risks-missing", "Option records no risks", id);
  if (!option.reversibility?.trim()) add("warning", "reversibility-missing", "Option does not describe reversibility", id);
  ranking.push({ id, label: option.label ?? id, score: Number(weighted.toFixed(3)), eligible: violations.length === 0, violations });
}
for (const [index, source] of (parsed.sources ?? []).entries()) {
  if (!source.title?.trim() || !source.url?.trim()) add("warning", "source-incomplete", `Source #${index + 1} needs title and URL`);
  if (!source.checkedAt || !/^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt)) add("warning", "source-date-missing", `Source #${index + 1} needs a checkedAt date`);
}
if ((parsed.sources ?? []).length === 0) add("warning", "sources-missing", "No external sources recorded");
else if (!(parsed.sources ?? []).some((source) => source.authoritative === true)) add("warning", "authoritative-source-missing", "No source is marked authoritative");
ranking.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.id.localeCompare(b.id));
const recommended = ranking.find((option) => option.id === parsed.recommendation);
const highestEligible = ranking.find((option) => option.eligible);
if (!parsed.recommendation || !recommended) add("blocker", "recommendation-invalid", `Recommendation does not name a known option: ${parsed.recommendation ?? "<missing>"}`);
else if (!recommended.eligible) add("blocker", "recommendation-ineligible", "Recommended option violates a hard constraint", recommended.id);
else if (highestEligible && recommended.id !== highestEligible.id && !parsed.rationale?.trim()) add("blocker", "lower-score-unexplained", `Recommendation differs from highest eligible score (${highestEligible.id}) without rationale`, recommended.id);
if (!parsed.rationale?.trim()) add("warning", "rationale-missing", "Decision has no recommendation rationale");
const summary = {
  criteria: parsed.criteria.length,
  options: parsed.options.length,
  weightTotal,
  recommendation: parsed.recommendation ?? null,
  highestEligible: highestEligible?.id ?? null,
  blockers: findings.filter((item) => item.severity === "blocker").length,
  warnings: findings.filter((item) => item.severity === "warning").length
};
const output = { decision: decisionPath, title: parsed.decision ?? null, summary, ranking, findings };
if (args.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  for (const option of ranking) console.log(`${option.eligible ? "[ELIGIBLE]" : "[INELIGIBLE]"} ${option.id}: ${option.score.toFixed(3)}`);
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.option ? ` (${finding.option})` : ""}: ${finding.message}`);
}
if (args.includes("--fail-on-blocker") && summary.blockers > 0) process.exitCode = 1;
