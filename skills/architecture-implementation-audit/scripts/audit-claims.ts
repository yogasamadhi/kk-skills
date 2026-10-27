import { promises as fs } from "node:fs";
import path from "node:path";

type ClaimStatus = "implemented" | "partial" | "planned" | "missing" | "conflict";
type Severity = "error" | "warning" | "info";

interface Claim {
  id?: string;
  statement?: string;
  status?: ClaimStatus;
  design?: string[];
  implementation?: string[];
  configuration?: string[];
  tests?: string[];
  governingSource?: string;
  notes?: string;
}

interface Finding {
  severity: Severity;
  code: string;
  message: string;
  claim?: string;
  file?: string;
}

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const ledgerArg = value("--ledger") ?? args.find((arg) => !arg.startsWith("--"));
if (!ledgerArg) throw new Error("Usage: audit-claims.ts --ledger <claims.json> [--root <repository>] [--json] [--fail-on-error]");
const ledgerPath = path.resolve(ledgerArg);
const root = path.resolve(value("--root") ?? path.dirname(ledgerPath));
const findings: Finding[] = [];
const allowed = new Set<ClaimStatus>(["implemented", "partial", "planned", "missing", "conflict"]);

function add(severity: Severity, code: string, message: string, claim?: string, file?: string): void {
  findings.push({ severity, code, message, claim, file });
}

async function checkEvidence(claimId: string, file: string): Promise<void> {
  const absolute = path.resolve(root, file);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    add("error", "evidence-outside-root", `Evidence path leaves the repository: ${file}`, claimId, file);
    return;
  }
  try {
    await fs.access(absolute);
  } catch {
    add("error", "evidence-missing", `Evidence path does not exist: ${file}`, claimId, file);
  }
}

const parsed = JSON.parse(await fs.readFile(ledgerPath, "utf8")) as { claims?: Claim[] };
if (!Array.isArray(parsed.claims)) throw new Error("Claim ledger must contain a claims array");
const seen = new Set<string>();

for (const [index, claim] of parsed.claims.entries()) {
  const id = claim.id?.trim() || `#${index + 1}`;
  if (!claim.id?.trim()) add("error", "claim-id-missing", "Claim requires a stable ID", id);
  else if (seen.has(claim.id)) add("error", "claim-id-duplicate", `Duplicate claim ID: ${claim.id}`, id);
  else seen.add(claim.id);
  if (!claim.statement?.trim()) add("error", "statement-missing", "Claim requires an atomic statement", id);
  if (!claim.status || !allowed.has(claim.status)) add("error", "status-invalid", `Invalid claim status: ${claim.status ?? "<missing>"}`, id);

  const design = Array.isArray(claim.design) ? claim.design : [];
  const implementation = Array.isArray(claim.implementation) ? claim.implementation : [];
  const configuration = Array.isArray(claim.configuration) ? claim.configuration : [];
  const tests = Array.isArray(claim.tests) ? claim.tests : [];
  if (claim.status === "implemented" && implementation.length === 0) {
    add("error", "implementation-evidence-missing", "Implemented claim has no implementation evidence", id);
  }
  if (claim.status === "implemented" && tests.length === 0) {
    add("warning", "test-evidence-missing", "Implemented claim has no test evidence", id);
  }
  if (claim.status === "partial" && implementation.length === 0 && configuration.length === 0) {
    add("warning", "partial-evidence-weak", "Partial claim has no implementation or configuration evidence", id);
  }
  if (claim.status === "planned" && implementation.length > 0) {
    add("warning", "planned-has-implementation", "Planned claim links implementation evidence; verify its classification", id);
  }
  if (claim.status === "conflict" && !claim.notes?.trim()) {
    add("error", "conflict-unexplained", "Conflicting claim must explain the disagreement and governing source", id);
  }
  if (design.length + implementation.length + configuration.length + tests.length === 0 && !claim.governingSource) {
    add("warning", "claim-unlinked", "Claim has no linked evidence", id);
  }
  for (const file of [...design, ...implementation, ...configuration, ...tests]) await checkEvidence(id, file);
  if (claim.governingSource) await checkEvidence(id, claim.governingSource);
}

const statusCounts = Object.fromEntries([...allowed].map((status) => [status, parsed.claims!.filter((claim) => claim.status === status).length]));
const summary = {
  claims: parsed.claims.length,
  errors: findings.filter((item) => item.severity === "error").length,
  warnings: findings.filter((item) => item.severity === "warning").length,
  statusCounts
};
const output = { ledger: ledgerPath, root, summary, findings };
if (args.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.claim ? ` (${finding.claim})` : ""}: ${finding.message}`);
  console.log(`${summary.claims} claim(s), ${summary.errors} error(s), ${summary.warnings} warning(s)`);
}
if (args.includes("--fail-on-error") && summary.errors > 0) process.exitCode = 1;
