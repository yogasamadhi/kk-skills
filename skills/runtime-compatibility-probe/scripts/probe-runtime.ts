import { builtinModules } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";

type Status = "likely" | "needs-test" | "blocked";

interface TargetResult {
  target: string;
  status: Status;
  reasons: string[];
}

const packageArg = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? ".";
const packageDir = path.resolve(packageArg);
const manifestPath = path.join(packageDir, "package.json");

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory: string, depth = 0): Promise<string[]> {
  if (depth > 8) return [];
  const result: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "build", "coverage", ".next", "fixtures"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(absolute, depth + 1)));
    else if (entry.isFile() && /\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) result.push(absolute);
  }
  return result;
}

function collectConditions(value: unknown, keys = new Set<string>()): Set<string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (!key.startsWith(".")) keys.add(key);
      collectConditions(item, keys);
    }
  } else if (Array.isArray(value)) {
    for (const item of value) collectConditions(item, keys);
  }
  return keys;
}

if (!(await exists(manifestPath))) throw new Error(`No package.json found at ${packageDir}`);
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
const codeFiles = await walk(packageDir);
const source = (await Promise.all(codeFiles.map((file) => fs.readFile(file, "utf8")))).join("\n");

const imports = new Set<string>();
const importPatterns = [
  /\bfrom\s+['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g
];
for (const pattern of importPatterns) for (const match of source.matchAll(pattern)) imports.add(match[1]);

const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/, "")));
const nodeImports = [...imports].filter((name) => name.startsWith("node:") || builtins.has(name.split("/", 1)[0]));
const flags = {
  require: /\brequire\s*\(/.test(source),
  dirname: /\b__dirname\b|\b__filename\b/.test(source),
  process: /\bprocess\.(?:env|cwd|platform|versions|nextTick)\b/.test(source),
  buffer: /\bBuffer\b/.test(source),
  nativeAddon: /\.node['"]|node-gyp|node-pre-gyp|prebuild-install/.test(source),
  childProcess: nodeImports.some((name) => /^(?:node:)?child_process$/.test(name)),
  filesystem: nodeImports.some((name) => /^(?:node:)?(?:fs|fs\/promises)$/.test(name)),
  sockets: nodeImports.some((name) => /^(?:node:)?(?:net|tls|dgram)$/.test(name))
};
const conditions = [...collectConditions(manifest.exports)].sort();
const type = typeof manifest.type === "string" ? manifest.type : "commonjs-default";

const node: TargetResult = { target: "Node.js", status: "likely", reasons: [] };
if (flags.nativeAddon) {
  node.status = "needs-test";
  node.reasons.push("native addon or native build tooling detected");
}
if (type === "module" && flags.require) {
  node.status = "needs-test";
  node.reasons.push("CommonJS require appears in a module package");
}

const bun: TargetResult = { target: "Bun", status: "needs-test", reasons: ["Node API compatibility and package lifecycle behavior require an executed consumer test"] };
if (flags.nativeAddon) bun.reasons.push("native addon detected");

const deno: TargetResult = { target: "Deno", status: "needs-test", reasons: [] };
if (nodeImports.length > 0) deno.reasons.push(`${nodeImports.length} Node built-in import(s) require current Deno compatibility verification`);
if (flags.nativeAddon) {
  deno.status = "blocked";
  deno.reasons.push("native Node addon detected");
}
if (deno.reasons.length === 0) deno.reasons.push("package resolution and permissions still require an executed Deno test");

const browserReasons: string[] = [];
if (nodeImports.length > 0) browserReasons.push(`Node built-ins imported: ${nodeImports.join(", ")}`);
if (flags.process) browserReasons.push("process global usage detected");
if (flags.buffer) browserReasons.push("Buffer global usage detected");
if (flags.require || flags.dirname) browserReasons.push("CommonJS-only globals detected");
const browser: TargetResult = {
  target: "Browser",
  status: browserReasons.length > 0 ? "blocked" : "needs-test",
  reasons: browserReasons.length > 0 ? browserReasons : ["bundler resolution and web behavior require an executed browser test"]
};

const edgeReasons: string[] = [];
if (flags.filesystem) edgeReasons.push("filesystem access detected");
if (flags.childProcess) edgeReasons.push("child_process access detected");
if (flags.sockets) edgeReasons.push("raw socket access detected");
if (flags.nativeAddon) edgeReasons.push("native addon detected");
const edge: TargetResult = {
  target: "Edge runtime",
  status: edgeReasons.length > 0 ? "blocked" : "needs-test",
  reasons: edgeReasons.length > 0 ? edgeReasons : ["specific provider runtime and compatibility flags require an executed test"]
};

const output = {
  packageDir,
  package: manifest.name ?? null,
  moduleType: type,
  engines: manifest.engines ?? null,
  exportConditions: conditions,
  nodeBuiltinImports: nodeImports,
  signals: flags,
  matrix: [node, bun, deno, browser, edge],
  limitation: "Static status is heuristic and does not replace tests against packed consumer entrypoints."
};

if (process.argv.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  console.log(`Package: ${String(output.package ?? "unnamed")} (${type})`);
  for (const result of output.matrix) console.log(`${result.target}: ${result.status} — ${result.reasons.join("; ")}`);
}

if (process.argv.includes("--fail-on-blocked") && output.matrix.some((item) => item.status === "blocked")) process.exitCode = 1;
