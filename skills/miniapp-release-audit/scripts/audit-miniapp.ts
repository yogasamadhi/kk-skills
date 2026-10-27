import { promises as fs } from "node:fs";
import path from "node:path";

type Severity = "blocker" | "warning" | "info";

interface Finding {
  severity: Severity;
  code: string;
  message: string;
  file?: string;
}

const projectArg = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? ".";
const root = path.resolve(projectArg);
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

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (lineComment) {
      if (char === "\n") {
        lineComment = false;
        output += char;
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (inString) {
      output += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) inString = false;
      continue;
    }
    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
    } else if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else output += char;
  }
  return output.replace(/,\s*([}\]])/g, "$1");
}

async function readJson(file: string): Promise<Record<string, unknown> | null> {
  if (!(await exists(file))) return null;
  try {
    return JSON.parse(stripJsonComments(await fs.readFile(file, "utf8"))) as Record<string, unknown>;
  } catch (error) {
    add("blocker", "config-parse-failed", `Cannot parse configuration: ${error instanceof Error ? error.message : String(error)}`, path.relative(root, file));
    return null;
  }
}

async function walk(directory: string, depth = 0): Promise<string[]> {
  if (depth > 9) return [];
  const result: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "build", "coverage", ".next", ".turbo", "fixtures"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(absolute, depth + 1)));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

function relative(file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

async function pageExists(page: string): Promise<boolean> {
  const bases = [path.join(root, page), path.join(root, "src", page)];
  const extensions = [".wxml", ".vue", ".tsx", ".ts", ".jsx", ".js"];
  for (const base of bases) for (const extension of extensions) if (await exists(`${base}${extension}`)) return true;
  return false;
}

const projectConfigPath = path.join(root, "project.config.json");
const projectConfig = await readJson(projectConfigPath);
const miniprogramRootValue = typeof projectConfig?.miniprogramRoot === "string" ? projectConfig.miniprogramRoot : ".";
const miniRoot = path.resolve(root, miniprogramRootValue);
const appJsonPath = (await exists(path.join(miniRoot, "app.json"))) ? path.join(miniRoot, "app.json") : path.join(root, "app.json");
const appJson = await readJson(appJsonPath);
const pagesJson = await readJson(path.join(root, "pages.json"));
const manifestJson = await readJson(path.join(root, "manifest.json"));

const frameworks: string[] = [];
if (appJson) frameworks.push("WeChat Mini Program");
if (await exists(path.join(root, "config", "index.ts")) || await exists(path.join(root, "src", "app.config.ts"))) frameworks.push("Taro");
if (pagesJson || manifestJson) frameworks.push("uni-app");
if (frameworks.length === 0) add("warning", "framework-not-detected", "No WeChat, Taro, or uni-app configuration was detected");

if (projectConfig) {
  const appid = projectConfig.appid;
  if (typeof appid !== "string" || !appid || /tourist|test|example|placeholder/i.test(appid)) {
    add("blocker", "appid-placeholder", "project.config.json has a missing or placeholder appid", relative(projectConfigPath));
  }
  if (!(await exists(miniRoot))) add("blocker", "miniprogram-root-missing", `miniprogramRoot does not exist: ${miniprogramRootValue}`, relative(projectConfigPath));
  const serialized = JSON.stringify(projectConfig);
  if (/(privateKey|secret|accessToken|uploadKey)/i.test(serialized)) add("blocker", "credential-in-config", "Project configuration appears to contain credential material", relative(projectConfigPath));
}

if (appJson) {
  const pages = Array.isArray(appJson.pages) ? appJson.pages.filter((page): page is string => typeof page === "string") : [];
  if (pages.length === 0) add("blocker", "pages-missing", "app.json contains no pages", relative(appJsonPath));
  for (const page of pages) if (!(await pageExists(page))) add("warning", "page-source-missing", `No source file found for page '${page}'`, relative(appJsonPath));

  const subpackagesValue = appJson.subpackages ?? appJson.subPackages;
  if (Array.isArray(subpackagesValue)) {
    const roots = new Set<string>();
    for (const item of subpackagesValue) {
      if (!item || typeof item !== "object") continue;
      const subpackage = item as { root?: unknown; pages?: unknown };
      if (typeof subpackage.root !== "string" || !subpackage.root) add("blocker", "subpackage-root-missing", "A subpackage has no root", relative(appJsonPath));
      else if (roots.has(subpackage.root)) add("blocker", "subpackage-root-duplicate", `Duplicate subpackage root: ${subpackage.root}`, relative(appJsonPath));
      else roots.add(subpackage.root);
      if (!Array.isArray(subpackage.pages) || subpackage.pages.length === 0) add("warning", "subpackage-pages-empty", `Subpackage '${String(subpackage.root ?? "unknown")}' has no pages`, relative(appJsonPath));
    }
  }
}

if (pagesJson) {
  const pages = Array.isArray(pagesJson.pages) ? pagesJson.pages : [];
  if (pages.length === 0) add("blocker", "uniapp-pages-missing", "pages.json contains no pages", "pages.json");
}
if (manifestJson && JSON.stringify(manifestJson).includes("__UNI__")) add("warning", "manifest-placeholder", "manifest.json appears to contain a placeholder application id", "manifest.json");

const files = await walk(root);
const sourceFiles = files.filter((file) => /\.(?:ts|tsx|js|jsx|vue|wxml|json|uts)$/i.test(file));
let sourceBytes = 0;
let consoleLogs = 0;
const privacyApis = new Set<string>();
const knownPrivacyApis = ["getLocation", "chooseLocation", "chooseAddress", "getWeRunData", "chooseInvoiceTitle", "getUserProfile", "startRecord", "chooseMedia"];
for (const file of sourceFiles) {
  const stat = await fs.stat(file);
  sourceBytes += stat.size;
  if (stat.size > 2_000_000) continue;
  const content = await fs.readFile(file, "utf8");
  const rel = relative(file);
  if (/http:\/\/(?!localhost\b|127\.0\.0\.1\b)/i.test(content)) add("warning", "insecure-http", "Non-local HTTP endpoint detected", rel);
  if (/(?:AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|(?:secret|token|password)\s*[:=]\s*['"][^'"]{12,})/i.test(content)) {
    add("blocker", "possible-secret", "Possible credential or private key detected", rel);
  }
  const logMatches = content.match(/\bconsole\.(?:log|debug|info)\s*\(/g);
  consoleLogs += logMatches?.length ?? 0;
  if (/\b(?:TODO|FIXME)\b/.test(content)) add("info", "unfinished-marker", "TODO or FIXME remains in release source", rel);
  for (const api of knownPrivacyApis) if (new RegExp(`\\b(?:wx\\.)?${api}\\s*\\(`).test(content)) privacyApis.add(api);
}
if (consoleLogs > 0) add("warning", "debug-logging", `${consoleLogs} console logging call(s) detected; review for PII and production noise`);
if (sourceBytes > 2 * 1024 * 1024) add("warning", "source-size-signal", `Scanned source is ${(sourceBytes / 1024 / 1024).toFixed(2)} MiB; verify actual built package limits in platform tooling`);
if (privacyApis.size > 0) add("warning", "privacy-api-review", `Privacy-sensitive APIs require current declaration review: ${[...privacyApis].sort().join(", ")}`);

const manualGates = [
  "Build the exact production artifact and inspect platform-reported package and subpackage sizes.",
  "Verify request, upload, download, WebSocket, and webview domains in the platform console.",
  "Compare privacy declarations and permission descriptions with the APIs and product behavior.",
  "Preview on representative devices and test denial, offline, cold-start, and update paths.",
  "Confirm release notes, reviewer path, account capabilities, monitoring, and rollback plan."
];
const summary = {
  blockers: findings.filter((item) => item.severity === "blocker").length,
  warnings: findings.filter((item) => item.severity === "warning").length,
  info: findings.filter((item) => item.severity === "info").length
};
const output = { root, frameworks, sourceFiles: sourceFiles.length, sourceBytes, summary, findings, manualGates };

if (process.argv.includes("--json")) console.log(JSON.stringify(output, null, 2));
else {
  console.log(`Frameworks: ${frameworks.join(", ") || "not detected"}`);
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.file ? ` (${finding.file})` : ""}: ${finding.message}`);
  console.log(`${summary.blockers} blocker(s), ${summary.warnings} warning(s), ${summary.info} info`);
  for (const gate of manualGates) console.log(`Manual: ${gate}`);
}

if (process.argv.includes("--fail-on-blocker") && summary.blockers > 0) process.exitCode = 1;
