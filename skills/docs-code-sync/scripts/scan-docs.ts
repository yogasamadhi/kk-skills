import { promises as fs } from "node:fs";
import path from "node:path";

interface Finding {
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  file?: string;
}

const rootArg = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? ".";
const root = path.resolve(rootArg);
const findings: Finding[] = [];

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory: string, depth = 0): Promise<string[]> {
  if (depth > 10) return [];
  const files: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "build", "coverage", ".next", "fixtures"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute, depth + 1)));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function relative(file: string): string {
  return path.relative(root, file).split(path.sep).join("/");
}

const files = await walk(root);
const markdownFiles = files.filter((file) => /\.(?:md|mdx)$/i.test(file));
const codeFiles = files.filter((file) => /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(file));
const markdown = (await Promise.all(markdownFiles.map(async (file) => ({ file, content: await fs.readFile(file, "utf8") }))));
const code = (await Promise.all(codeFiles.map(async (file) => ({ file, content: await fs.readFile(file, "utf8") }))));
const allDocs = markdown.map((item) => item.content).join("\n");

const envVariables = new Map<string, Set<string>>();
const cliFlags = new Map<string, Set<string>>();
for (const item of code) {
  const rel = relative(item.file);
  const envPatterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
    /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g
  ];
  for (const pattern of envPatterns) {
    for (const match of item.content.matchAll(pattern)) {
      const locations = envVariables.get(match[1]) ?? new Set<string>();
      locations.add(rel);
      envVariables.set(match[1], locations);
    }
  }
  for (const match of item.content.matchAll(/['"`]--([a-z][a-z0-9-]{1,})\b/g)) {
    const flag = `--${match[1]}`;
    const locations = cliFlags.get(flag) ?? new Set<string>();
    locations.add(rel);
    cliFlags.set(flag, locations);
  }
}

const envExampleFiles = files.filter((file) => /(?:^|\/)\.env(?:\.example|\.sample|\.template)$/i.test(file));
const envExamples = (await Promise.all(envExampleFiles.map((file) => fs.readFile(file, "utf8")))).join("\n");
for (const [variable, locations] of envVariables) {
  if (!allDocs.includes(variable) && !envExamples.includes(variable)) {
    findings.push({ severity: "warning", code: "env-undocumented", message: `${variable} is used in code but not found in docs or env examples`, file: [...locations][0] });
  }
}
for (const [flag, locations] of cliFlags) {
  if (!allDocs.includes(flag)) findings.push({ severity: "warning", code: "cli-flag-undocumented", message: `${flag} is used in code but not found in documentation`, file: [...locations][0] });
}

const entrypoints = code.filter((item) => /(?:^|\/)(?:src\/)?index\.(?:ts|tsx|js|jsx)$/.test(relative(item.file)));
for (const item of entrypoints) {
  for (const match of item.content.matchAll(/\bexport\s+(?:declare\s+)?(?:async\s+)?(?:class|function|const|type|interface|enum)\s+([A-Z_a-z][\w]*)/g)) {
    if (!allDocs.includes(match[1])) {
      findings.push({ severity: "info", code: "export-unmentioned", message: `Public-looking export '${match[1]}' is not mentioned in docs`, file: relative(item.file) });
    }
  }
}

for (const item of markdown) {
  for (const match of item.content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "").split("#", 1)[0];
    if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;
    const resolved = path.resolve(path.dirname(item.file), decodeURIComponent(target));
    if (!(await exists(resolved))) {
      findings.push({ severity: "error", code: "local-link-broken", message: `Broken local link: ${match[1]}`, file: relative(item.file) });
    }
  }
}

const summary = {
  markdownFiles: markdownFiles.length,
  codeFiles: codeFiles.length,
  errors: findings.filter((item) => item.severity === "error").length,
  warnings: findings.filter((item) => item.severity === "warning").length,
  info: findings.filter((item) => item.severity === "info").length
};

if (process.argv.includes("--json")) console.log(JSON.stringify({ root, summary, findings }, null, 2));
else {
  for (const finding of findings) console.log(`[${finding.severity.toUpperCase()}] ${finding.code}${finding.file ? ` (${finding.file})` : ""}: ${finding.message}`);
  console.log(`Scanned ${summary.markdownFiles} docs and ${summary.codeFiles} code files: ${summary.errors} error(s), ${summary.warnings} warning(s)`);
}

if (process.argv.includes("--fail-on-error") && summary.errors > 0) process.exitCode = 1;
