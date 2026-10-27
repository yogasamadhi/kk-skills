import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type Severity = "blocker" | "warning" | "info";

interface Finding {
  severity: Severity;
  code: string;
  message: string;
  file?: string;
}

const packageArg = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? ".";
const packageDir = path.resolve(packageArg);
const manifestPath = path.join(packageDir, "package.json");
const findings: Finding[] = [];

function add(severity: Severity, code: string, message: string, file?: string): void {
  findings.push({ severity, code, message, file });
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function collectExportPaths(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === "string" && value.startsWith("./")) result.add(value);
  else if (Array.isArray(value)) for (const item of value) collectExportPaths(item, result);
  else if (value && typeof value === "object") for (const item of Object.values(value)) collectExportPaths(item, result);
  return result;
}

if (!(await exists(manifestPath))) throw new Error(`No package.json found at ${packageDir}`);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
const privatePackage = manifest.private === true;

if (typeof manifest.name !== "string" || !manifest.name) add("blocker", "name-missing", "package.json requires a package name", "package.json");
if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
  add("blocker", "version-invalid", "Version must be a semver-like value", "package.json");
}
if (privatePackage) add("info", "private-package", "Package is marked private; registry publication is disabled", "package.json");
if (!privatePackage && typeof manifest.license !== "string") add("warning", "license-missing", "Published package does not declare a license", "package.json");
if (!privatePackage && !Array.isArray(manifest.files)) add("warning", "files-allowlist-missing", "Published package has no files allowlist", "package.json");
if (!privatePackage && typeof manifest.repository !== "string" && !(manifest.repository && typeof manifest.repository === "object")) {
  add("warning", "repository-missing", "Published package does not declare its source repository", "package.json");
}

for (const field of ["main", "module", "types", "typings"] as const) {
  const value = manifest[field];
  if (typeof value !== "string") continue;
  if (value.includes("*")) {
    add("info", "path-pattern", `${field} uses a pattern and needs manual verification: ${value}`, "package.json");
  } else if (!(await exists(path.resolve(packageDir, value)))) {
    add("blocker", `${field}-missing`, `${field} target does not exist: ${value}`, "package.json");
  }
}

for (const exportPath of collectExportPaths(manifest.exports)) {
  if (exportPath.includes("*")) {
    add("info", "export-pattern", `Export pattern needs manual verification: ${exportPath}`, "package.json");
  } else if (!(await exists(path.resolve(packageDir, exportPath)))) {
    add("blocker", "export-target-missing", `Export target does not exist: ${exportPath}`, "package.json");
  }
}

const dependencies = manifest.dependencies && typeof manifest.dependencies === "object" ? manifest.dependencies as Record<string, string> : {};
const devDependencies = manifest.devDependencies && typeof manifest.devDependencies === "object" ? manifest.devDependencies as Record<string, string> : {};
const peerDependencies = manifest.peerDependencies && typeof manifest.peerDependencies === "object" ? manifest.peerDependencies as Record<string, string> : {};
if (dependencies.typescript) add("warning", "typescript-runtime-dependency", "typescript is usually a development dependency for libraries", "package.json");
for (const name of Object.keys(peerDependencies)) {
  if (dependencies[name]) add("warning", "peer-duplicated-runtime", `${name} is declared in both peerDependencies and dependencies`, "package.json");
  if (!devDependencies[name]) add("info", "peer-not-installed-for-tests", `${name} is a peer dependency but not a dev dependency`, "package.json");
}

const scripts = manifest.scripts && typeof manifest.scripts === "object" ? manifest.scripts as Record<string, string> : {};
for (const lifecycle of ["prepack", "prepare", "prepublish", "prepublishOnly"]) {
  if (scripts[lifecycle]) add("info", "lifecycle-script", `${lifecycle} will execute during some packaging or publication flows`, "package.json");
}

if (!(await exists(path.join(packageDir, "README.md"))) && !(await exists(path.join(packageDir, "README")))) {
  add(privatePackage ? "info" : "warning", "readme-missing", "Package directory has no README", "package.json");
}

let gitStatus: string[] = [];
const gitResult = spawnSync("git", ["status", "--porcelain", "--", packageDir], { cwd: packageDir, encoding: "utf8", shell: false });
if (gitResult.status === 0) {
  gitStatus = (gitResult.stdout ?? "").split(/\r?\n/).filter(Boolean);
  if (gitStatus.length > 0) add("warning", "working-tree-dirty", `${gitStatus.length} package path change(s) are uncommitted`);
}

let pack: { status: number | null; files: string[]; output: string } | null = null;
if (process.argv.includes("--pack")) {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: packageDir, encoding: "utf8", shell: false });
  let files: string[] = [];
  try {
    const parsed = JSON.parse(result.stdout ?? "[]") as Array<{ files?: Array<{ path?: string }> }>;
    files = (parsed[0]?.files ?? []).map((item) => item.path).filter((item): item is string => typeof item === "string");
  } catch {
    add("blocker", "pack-output-invalid", "npm pack did not return valid JSON");
  }
  if (result.status !== 0) add("blocker", "pack-failed", "npm pack --dry-run failed");
  pack = { status: result.status, files, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

const summary = {
  blockers: findings.filter((item) => item.severity === "blocker").length,
  warnings: findings.filter((item) => item.severity === "warning").length,
  info: findings.filter((item) => item.severity === "info").length
};
const output = { packageDir, package: manifest.name ?? null, version: manifest.version ?? null, private: privatePackage, summary, findings, gitStatus, pack };

if (process.argv.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}`);
  console.log(`${summary.blockers} blocker(s), ${summary.warnings} warning(s), ${summary.info} info`);
}

if (process.argv.includes("--fail-on-blocker") && summary.blockers > 0) process.exitCode = 1;
