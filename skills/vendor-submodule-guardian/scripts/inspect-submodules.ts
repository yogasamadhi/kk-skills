import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type Severity = "blocker" | "warning" | "info";
interface Finding { severity: Severity; code: string; message: string; submodule?: string; }
interface SubmoduleConfig { name: string; path?: string; url?: string; branch?: string; }

const args = process.argv.slice(2);
const repoArg = args.find((arg) => !arg.startsWith("--")) ?? ".";
const repo = path.resolve(repoArg);
const findings: Finding[] = [];
const add = (severity: Severity, code: string, message: string, submodule?: string): void => {
  findings.push({ severity, code, message, submodule });
};
const runGit = (gitArgs: string[], cwd = repo) => spawnSync("git", gitArgs, { cwd, encoding: "utf8", shell: false });

function parseGitmodules(source: string): SubmoduleConfig[] {
  const modules: SubmoduleConfig[] = [];
  let current: SubmoduleConfig | undefined;
  for (const rawLine of source.split(/\r?\n/)) {
    const section = rawLine.match(/^\s*\[submodule\s+"([^"]+)"\]\s*$/);
    if (section) {
      current = { name: section[1] };
      modules.push(current);
      continue;
    }
    const entry = rawLine.match(/^\s*([A-Za-z][\w.-]*)\s*=\s*(.*?)\s*$/);
    if (!entry || !current) continue;
    if (entry[1] === "path") current.path = entry[2];
    if (entry[1] === "url") current.url = entry[2];
    if (entry[1] === "branch") current.branch = entry[2];
  }
  return modules;
}

const gitmodulesPath = path.join(repo, ".gitmodules");
let source: string | undefined;
try { source = await fs.readFile(gitmodulesPath, "utf8"); } catch { /* no submodules */ }
const modules = source === undefined ? [] : parseGitmodules(source);
if (source !== undefined && modules.length === 0) add("blocker", "gitmodules-empty", ".gitmodules exists but has no parseable submodule sections");

const repositoryProbe = runGit(["rev-parse", "--show-toplevel"]);
if (repositoryProbe.status !== 0) add("blocker", "repository-not-git", "Target directory is not inside a Git worktree");
const details: Array<Record<string, unknown>> = [];
const declaredPaths = new Set<string>();

for (const module of modules) {
  const id = module.name;
  if (!module.path) add("blocker", "path-missing", "Submodule declaration has no path", id);
  if (!module.url) add("blocker", "url-missing", "Submodule declaration has no URL", id);
  if (!module.path) {
    details.push({ ...module });
    continue;
  }
  if (declaredPaths.has(module.path)) add("blocker", "path-duplicate", `Multiple submodules use path ${module.path}`, id);
  declaredPaths.add(module.path);
  const absolute = path.resolve(repo, module.path);
  if (absolute !== repo && !absolute.startsWith(`${repo}${path.sep}`)) {
    add("blocker", "path-outside-repository", `Submodule path leaves the repository: ${module.path}`, id);
    details.push({ ...module });
    continue;
  }
  let pathExists = true;
  try { await fs.access(absolute); } catch { pathExists = false; add("blocker", "worktree-missing", `Submodule path does not exist: ${module.path}`, id); }
  const stage = runGit(["ls-files", "--stage", "--", module.path]);
  const stageLine = (stage.stdout ?? "").trim().split(/\r?\n/).find(Boolean) ?? "";
  const stageMatch = stageLine.match(/^(\d{6})\s+([0-9a-f]{40,64})\s+\d+\t/);
  const gitlink = stageMatch?.[1] === "160000" ? stageMatch[2] : undefined;
  if (!gitlink) add("blocker", "gitlink-missing", `No tracked submodule gitlink found for ${module.path}`, id);
  let head: string | undefined;
  let dirty: string[] = [];
  if (pathExists) {
    const headResult = runGit(["rev-parse", "HEAD"], absolute);
    if (headResult.status === 0) head = (headResult.stdout ?? "").trim();
    else add("warning", "submodule-uninitialized", `Cannot resolve child HEAD at ${module.path}`, id);
    const statusResult = runGit(["status", "--porcelain"], absolute);
    if (statusResult.status === 0) dirty = (statusResult.stdout ?? "").split(/\r?\n/).filter(Boolean);
    if (dirty.length > 0) add("warning", "worktree-dirty", `${dirty.length} local change(s) exist inside ${module.path}`, id);
  }
  if (head && gitlink && head !== gitlink) add("warning", "head-gitlink-drift", `Child HEAD ${head} differs from recorded gitlink ${gitlink}`, id);
  details.push({ ...module, gitlink: gitlink ?? null, head: head ?? null, pathExists, dirty });
}

const summary = {
  submodules: modules.length,
  blockers: findings.filter((item) => item.severity === "blocker").length,
  warnings: findings.filter((item) => item.severity === "warning").length
};
const output = { repository: repo, summary, submodules: details, findings };
if (args.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.submodule ? ` (${finding.submodule})` : ""}: ${finding.message}`);
  console.log(`${summary.submodules} submodule(s), ${summary.blockers} blocker(s), ${summary.warnings} warning(s)`);
}
if (args.includes("--fail-on-blocker") && summary.blockers > 0) process.exitCode = 1;
