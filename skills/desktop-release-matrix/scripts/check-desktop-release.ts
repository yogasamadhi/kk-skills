import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";

type RunStatus = "pass" | "fail" | "not-run" | "not-applicable";
type Severity = "blocker" | "warning" | "info";
interface Target { id?: string; platform?: string; arch?: string; format?: string; artifact?: string; sha256?: string; buildStatus?: RunStatus; smokeStatus?: RunStatus; smokeEvidence?: string[]; notes?: string; }
interface Finding { severity: Severity; code: string; message: string; target?: string; file?: string; }

const args = process.argv.slice(2);
const value = (flag: string): string | undefined => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const manifestArg = value("--manifest") ?? args.find((arg) => !arg.startsWith("--"));
if (!manifestArg) throw new Error("Usage: check-desktop-release.ts --manifest <release.json> [--root <repository>] [--json] [--fail-on-blocker]");
const manifestPath = path.resolve(manifestArg);
const root = path.resolve(value("--root") ?? path.dirname(manifestPath));
const parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { app?: string; version?: string; sourceCommit?: string; toolchain?: Record<string, string>; vendors?: Record<string, string>; targets?: Target[] };
if (!Array.isArray(parsed.targets)) throw new Error("Desktop release manifest must contain a targets array");
const statuses = new Set<RunStatus>(["pass", "fail", "not-run", "not-applicable"]);
const findings: Finding[] = [];
const add = (severity: Severity, code: string, message: string, target?: string, file?: string): void => {
  findings.push({ severity, code, message, target, file });
};
const seenIds = new Set<string>();
const seenPairs = new Set<string>();

async function existsInside(file: string, target: string): Promise<string | undefined> {
  const absolute = path.resolve(root, file);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    add("blocker", "path-outside-root", `Path leaves repository: ${file}`, target, file);
    return undefined;
  }
  try { await fs.access(absolute); return absolute; } catch { add("blocker", "file-missing", `File does not exist: ${file}`, target, file); return undefined; }
}

async function sha256(file: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

if (!parsed.app?.trim()) add("blocker", "app-missing", "Release manifest requires an app name");
if (!parsed.version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(parsed.version)) add("blocker", "version-invalid", `Invalid release version: ${parsed.version ?? "<missing>"}`);
if (!parsed.sourceCommit || !/^[0-9a-f]{40}$/i.test(parsed.sourceCommit)) add("warning", "source-commit-not-immutable", "sourceCommit should be a full 40-character Git commit");
if (!parsed.toolchain || Object.keys(parsed.toolchain).length === 0) add("warning", "toolchain-missing", "No toolchain versions recorded");
for (const [name, commit] of Object.entries(parsed.vendors ?? {})) if (!/^[0-9a-f]{40}$/i.test(commit)) add("warning", "vendor-commit-not-immutable", `Vendor ${name} is not pinned to a full commit`);
const targetResults: Array<Record<string, unknown>> = [];

for (const [index, target] of parsed.targets.entries()) {
  const id = target.id?.trim() || `#${index + 1}`;
  if (!target.id?.trim()) add("blocker", "target-id-missing", "Target requires a stable ID", id);
  else if (seenIds.has(target.id)) add("blocker", "target-id-duplicate", `Duplicate target ID: ${target.id}`, id);
  else seenIds.add(target.id);
  if (!target.platform?.trim() || !target.arch?.trim()) add("blocker", "target-platform-missing", "Target requires platform and architecture", id);
  const pair = `${target.platform ?? "?"}/${target.arch ?? "?"}`;
  if (seenPairs.has(pair)) add("warning", "target-pair-duplicate", `Multiple targets use ${pair}; ensure formats are intentional`, id);
  else seenPairs.add(pair);
  if (!target.format?.trim()) add("blocker", "target-format-missing", "Target requires an artifact format", id);
  if (!target.buildStatus || !statuses.has(target.buildStatus)) add("blocker", "build-status-invalid", `Invalid build status: ${target.buildStatus ?? "<missing>"}`, id);
  else if (target.buildStatus !== "pass") add("blocker", "build-not-passed", `Build status is ${target.buildStatus}`, id);
  if (!target.smokeStatus || !statuses.has(target.smokeStatus)) add("blocker", "smoke-status-invalid", `Invalid smoke status: ${target.smokeStatus ?? "<missing>"}`, id);
  else if (target.smokeStatus === "fail" || target.smokeStatus === "not-run") add("blocker", "smoke-not-passed", `Smoke status is ${target.smokeStatus}`, id);
  else if (target.smokeStatus === "not-applicable" && !target.notes?.trim()) add("blocker", "smoke-na-unexplained", "Not-applicable smoke status requires a rationale", id);
  const smokeEvidence = Array.isArray(target.smokeEvidence) ? target.smokeEvidence : [];
  if (target.smokeStatus === "pass" && smokeEvidence.length === 0) add("blocker", "smoke-evidence-missing", "Passed smoke check has no evidence", id);
  let artifactPath: string | undefined;
  let actualSha256: string | null = null;
  if (!target.artifact?.trim()) add("blocker", "artifact-missing", "Target requires an artifact path", id);
  else artifactPath = await existsInside(target.artifact, id);
  if (artifactPath) {
    actualSha256 = await sha256(artifactPath);
    if (target.sha256 && target.sha256.toLowerCase() !== actualSha256) add("blocker", "checksum-mismatch", `Expected ${target.sha256}, received ${actualSha256}`, id, target.artifact);
  }
  for (const file of smokeEvidence) await existsInside(file, id);
  targetResults.push({ ...target, actualSha256 });
}
const summary = {
  targets: parsed.targets.length,
  blockers: findings.filter((item) => item.severity === "blocker").length,
  warnings: findings.filter((item) => item.severity === "warning").length,
  ready: findings.every((item) => item.severity !== "blocker")
};
const output = { manifest: manifestPath, root, app: parsed.app ?? null, version: parsed.version ?? null, sourceCommit: parsed.sourceCommit ?? null, summary, targets: targetResults, findings };
if (args.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.target ? ` (${finding.target})` : ""}: ${finding.message}`);
  console.log(`${summary.targets} target(s), ${summary.blockers} blocker(s), ready: ${summary.ready}`);
}
if (args.includes("--fail-on-blocker") && summary.blockers > 0) process.exitCode = 1;
