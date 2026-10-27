import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

type Manager = "pnpm" | "npm" | "yarn" | "bun";

interface DirectReference {
  manifest: string;
  scope: string;
  requested: string;
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const packageName = valueAfter("--package");
if (!packageName) throw new Error("Usage: audit-dependency.ts --package <name> [--root <repo>] [--explain] [--json]");
const root = path.resolve(valueAfter("--root") ?? ".");
const json = process.argv.includes("--json");

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function walkFor(directory: string, basename: string, depth = 0): Promise<string[]> {
  if (depth > 7) return [];
  const result: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "build", "coverage", ".next"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === basename) result.push(absolute);
    else if (entry.isDirectory()) result.push(...(await walkFor(absolute, basename, depth + 1)));
  }
  return result;
}

async function detectManager(): Promise<Manager> {
  if (await exists(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (await exists(path.join(root, "yarn.lock"))) return "yarn";
  if (await exists(path.join(root, "bun.lock")) || await exists(path.join(root, "bun.lockb"))) return "bun";
  return "npm";
}

function lockfileFor(manager: Manager): string {
  if (manager === "pnpm") return "pnpm-lock.yaml";
  if (manager === "yarn") return "yarn.lock";
  if (manager === "bun") return "bun.lock";
  return "package-lock.json";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const manifests = await walkFor(root, "package.json");
const directReferences: DirectReference[] = [];
for (const manifest of manifests) {
  const data = JSON.parse(await fs.readFile(manifest, "utf8")) as Record<string, unknown>;
  for (const scope of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "overrides", "resolutions"]) {
    const entries = data[scope];
    if (!entries || typeof entries !== "object") continue;
    const requested = (entries as Record<string, unknown>)[packageName];
    if (typeof requested === "string") {
      directReferences.push({ manifest: path.relative(root, manifest) || "package.json", scope, requested });
    }
  }
}

const manager = await detectManager();
const lockfile = lockfileFor(manager);
let lockfileMatches = 0;
if (await exists(path.join(root, lockfile))) {
  const content = await fs.readFile(path.join(root, lockfile), "utf8");
  lockfileMatches = [...content.matchAll(new RegExp(escapeRegExp(packageName), "g"))].length;
}

const installedManifest = path.join(root, "node_modules", ...packageName.split("/"), "package.json");
let installedVersion: string | null = null;
if (await exists(installedManifest)) {
  const installed = JSON.parse(await fs.readFile(installedManifest, "utf8")) as { version?: unknown };
  if (typeof installed.version === "string") installedVersion = installed.version;
}

let explanation: { command: string; status: number | null; output: string } | null = null;
if (process.argv.includes("--explain")) {
  const command: Record<Manager, [string, string[]]> = {
    pnpm: ["pnpm", ["why", "--recursive", packageName]],
    npm: ["npm", ["explain", packageName, "--all"]],
    yarn: ["yarn", ["why", packageName]],
    bun: ["bun", ["pm", "why", packageName]]
  };
  const [executable, args] = command[manager];
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", shell: false });
  explanation = {
    command: [executable, ...args].join(" "),
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
  };
}

const output = {
  package: packageName,
  root,
  manager,
  evidence: {
    directReferences,
    lockfile: await exists(path.join(root, lockfile)) ? lockfile : null,
    lockfileMatches,
    installedVersion,
    explanation
  },
  limitations: [
    "Text presence does not establish that a resolved version is affected.",
    "This collector does not fetch advisories or evaluate reachability.",
    "Workspace-local and nested node_modules layouts may require package-manager explanation output."
  ]
};

if (json) console.log(JSON.stringify(output, null, 2));
else {
  console.log(`Package manager: ${manager}`);
  console.log(`Direct references: ${directReferences.length}`);
  for (const item of directReferences) console.log(`${item.manifest} ${item.scope}: ${item.requested}`);
  console.log(`Lockfile matches: ${lockfileMatches}`);
  console.log(`Installed root version: ${installedVersion ?? "not found"}`);
  if (explanation) console.log(`${explanation.command} exited ${explanation.status}\n${explanation.output}`);
}

if (process.argv.includes("--fail-on-found") && (directReferences.length > 0 || lockfileMatches > 0)) process.exitCode = 1;
