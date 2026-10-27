import { execFileSync, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type Manager = "pnpm" | "npm" | "yarn" | "bun";

interface PackageInfo {
  directory: string;
  relativeDirectory: string;
  name: string;
  scripts: Record<string, string>;
  dependencies: Set<string>;
  affected: boolean;
  reasons: string[];
}

interface CommandPlan {
  package: string;
  script: string;
  command: string;
  executable: string;
  args: string[];
}

const argv = process.argv.slice(2);
const repoArg = argv.find((arg, index) => !arg.startsWith("--") && argv[index - 1] !== "--base") ?? ".";
const repo = path.resolve(repoArg);
const baseIndex = argv.indexOf("--base");
const base = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;
const json = argv.includes("--json");
const shouldRun = argv.includes("--run");

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function detectManager(): Manager {
  if (requireExists("pnpm-lock.yaml")) return "pnpm";
  if (requireExists("yarn.lock")) return "yarn";
  if (requireExists("bun.lock") || requireExists("bun.lockb")) return "bun";
  return "npm";
}

function requireExists(relative: string): boolean {
  try {
    execFileSync(process.execPath, ["-e", `require('fs').accessSync(${JSON.stringify(path.join(repo, relative))})`], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function findManifests(directory: string, depth = 0): Promise<string[]> {
  if (depth > 6) return [];
  const manifests: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "build", "coverage", ".next"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === "package.json") manifests.push(absolute);
    else if (entry.isDirectory()) manifests.push(...(await findManifests(absolute, depth + 1)));
  }
  return manifests;
}

function gitOutput(args: string[]): string[] {
  try {
    const output = execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return output.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function changedFiles(): string[] {
  const files = base
    ? gitOutput(["diff", "--name-only", `${base}...HEAD`])
    : [...gitOutput(["diff", "--name-only", "HEAD"]), ...gitOutput(["diff", "--cached", "--name-only"]), ...gitOutput(["ls-files", "--others", "--exclude-standard"])];
  return [...new Set(files.map((file) => file.split(path.sep).join("/")))];
}

function commandFor(manager: Manager, pkg: PackageInfo, script: string): CommandPlan {
  if (manager === "pnpm") {
    return { package: pkg.name, script, executable: "pnpm", args: ["--filter", pkg.name, "run", script], command: `pnpm --filter ${JSON.stringify(pkg.name)} run ${script}` };
  }
  if (manager === "npm") {
    const args = pkg.relativeDirectory === "." ? ["run", script] : ["--workspace", pkg.name, "run", script];
    return { package: pkg.name, script, executable: "npm", args, command: `npm ${args.map((arg) => JSON.stringify(arg)).join(" ")}` };
  }
  if (manager === "yarn") {
    const args = pkg.relativeDirectory === "." ? ["run", script] : ["workspace", pkg.name, "run", script];
    return { package: pkg.name, script, executable: "yarn", args, command: `yarn ${args.map((arg) => JSON.stringify(arg)).join(" ")}` };
  }
  const args = ["--filter", pkg.name, "run", script];
  return { package: pkg.name, script, executable: "bun", args, command: `bun ${args.map((arg) => JSON.stringify(arg)).join(" ")}` };
}

if (!(await exists(path.join(repo, "package.json")))) throw new Error(`No package.json found at ${repo}`);
const manifests = await findManifests(repo);
const packages: PackageInfo[] = [];
for (const manifest of manifests) {
  const data = JSON.parse(await fs.readFile(manifest, "utf8")) as Record<string, unknown>;
  const directory = path.dirname(manifest);
  const relativeDirectory = path.relative(repo, directory) || ".";
  const dependencies = new Set<string>();
  for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
    const entries = data[field];
    if (entries && typeof entries === "object") for (const name of Object.keys(entries)) dependencies.add(name);
  }
  packages.push({
    directory,
    relativeDirectory: relativeDirectory.split(path.sep).join("/"),
    name: typeof data.name === "string" ? data.name : relativeDirectory,
    scripts: data.scripts && typeof data.scripts === "object" ? data.scripts as Record<string, string> : {},
    dependencies,
    affected: false,
    reasons: []
  });
}

const changes = changedFiles();
const rootSensitive = new Set(["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb", "tsconfig.json", "tsconfig.base.json"]);
if (changes.some((file) => rootSensitive.has(file) || file.startsWith(".github/") || file.startsWith("tooling/"))) {
  for (const pkg of packages) {
    pkg.affected = true;
    pkg.reasons.push("shared repository configuration changed");
  }
} else {
  for (const file of changes) {
    const absolute = path.join(repo, file);
    const candidates = packages.filter((pkg) => absolute === pkg.directory || absolute.startsWith(`${pkg.directory}${path.sep}`));
    candidates.sort((a, b) => b.directory.length - a.directory.length);
    const owner = candidates[0];
    if (owner) {
      owner.affected = true;
      owner.reasons.push(file);
    }
  }
}

let expanded = true;
while (expanded) {
  expanded = false;
  const affectedNames = new Set(packages.filter((pkg) => pkg.affected).map((pkg) => pkg.name));
  for (const pkg of packages) {
    if (!pkg.affected && [...pkg.dependencies].some((dependency) => affectedNames.has(dependency))) {
      pkg.affected = true;
      pkg.reasons.push("depends on an affected workspace package");
      expanded = true;
    }
  }
}

if (changes.length === 0) {
  const rootPackage = packages.find((pkg) => pkg.relativeDirectory === ".");
  if (rootPackage) {
    rootPackage.affected = true;
    rootPackage.reasons.push("no Git diff detected; verify the requested scope manually");
  }
}

const manager = detectManager();
const scriptOrder = ["format:check", "lint", "typecheck", "test", "build"];
const plans: CommandPlan[] = [];
for (const pkg of packages.filter((item) => item.affected)) {
  for (const script of scriptOrder) if (pkg.scripts[script]) plans.push(commandFor(manager, pkg, script));
}

const executions: Array<{ command: string; status: number | null }> = [];
if (shouldRun) {
  for (const plan of plans) {
    const result = spawnSync(plan.executable, plan.args, { cwd: repo, stdio: "inherit", shell: false });
    executions.push({ command: plan.command, status: result.status });
    if (result.status !== 0) break;
  }
}

const output = {
  repo,
  manager,
  base: base ?? null,
  changedFiles: changes,
  affectedPackages: packages.filter((pkg) => pkg.affected).map(({ name, relativeDirectory, reasons }) => ({ name, directory: relativeDirectory, reasons: [...new Set(reasons)] })),
  commands: plans.map(({ command, package: packageName, script }) => ({ package: packageName, script, command })),
  executions
};

if (json) console.log(JSON.stringify(output, null, 2));
else {
  console.log(`Package manager: ${manager}`);
  console.log(`Changed files: ${changes.length}`);
  for (const pkg of output.affectedPackages) console.log(`Affected: ${pkg.name} (${pkg.reasons.join(", ")})`);
  if (plans.length === 0) console.log("No standard verification scripts detected; inspect package.json and repository instructions manually.");
  else for (const plan of plans) console.log(`Plan: ${plan.command}`);
}

if (executions.some((execution) => execution.status !== 0)) process.exitCode = 1;
