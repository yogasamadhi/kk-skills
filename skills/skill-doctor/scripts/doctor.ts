import { promises as fs } from "node:fs";
import path from "node:path";

type Severity = "error" | "warning" | "info";

interface Finding {
  severity: Severity;
  code: string;
  message: string;
  file?: string;
  skill: string;
}

interface Frontmatter {
  name?: string;
  description?: string;
}

const argv = process.argv.slice(2);
const json = argv.includes("--json");
const strict = argv.includes("--strict");
const targetArg = argv.find((arg) => !arg.startsWith("--")) ?? ".";
const target = path.resolve(targetArg);
const findings: Finding[] = [];

function add(skill: string, severity: Severity, code: string, message: string, file?: string): void {
  findings.push({ skill, severity, code, message, file });
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "dist"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await listFiles(absolute)));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

async function findSkills(directory: string): Promise<string[]> {
  if (await exists(path.join(directory, "SKILL.md"))) return [directory];
  const skills: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || [".git", "node_modules", "dist"].includes(entry.name)) continue;
    skills.push(...(await findSkills(path.join(directory, entry.name))));
  }
  return skills;
}

function parseFrontmatter(markdown: string): Frontmatter | undefined {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return undefined;
  const result: Frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const item = line.match(/^(name|description):\s*(.*)$/);
    if (!item) continue;
    const value = item[2].trim().replace(/^(["'])(.*)\1$/, "$2");
    result[item[1] as keyof Frontmatter] = value;
  }
  return result;
}

function relative(skillDir: string, file: string): string {
  return path.relative(skillDir, file).split(path.sep).join("/");
}

async function auditSkill(skillDir: string): Promise<void> {
  const folder = path.basename(skillDir);
  const skillFile = path.join(skillDir, "SKILL.md");
  const markdown = await fs.readFile(skillFile, "utf8");
  const metadata = parseFrontmatter(markdown);

  if (!metadata) {
    add(folder, "error", "frontmatter-missing", "SKILL.md lacks YAML frontmatter", "SKILL.md");
    return;
  }

  const name = metadata.name ?? folder;
  if (!metadata.name) add(folder, "error", "name-missing", "Frontmatter name is required", "SKILL.md");
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name) || metadata.name.length > 64) {
    add(name, "error", "name-invalid", "Name must use lowercase letters, digits, and single hyphens", "SKILL.md");
  }
  if (metadata.name && metadata.name !== folder) {
    add(name, "error", "folder-name-mismatch", `Folder '${folder}' does not match name '${metadata.name}'`, "SKILL.md");
  }

  if (!metadata.description) add(name, "error", "description-missing", "Frontmatter description is required", "SKILL.md");
  else {
    if (metadata.description.length > 1024) add(name, "error", "description-too-long", "Description exceeds 1024 characters", "SKILL.md");
    if (metadata.description.length < 40) add(name, "warning", "description-too-short", "Description may not route requests precisely", "SKILL.md");
    if (!/\buse\b|when|用于|适用/i.test(metadata.description)) {
      add(name, "warning", "description-no-trigger", "Description does not clearly say when to use the skill", "SKILL.md");
    }
  }

  const byteLength = Buffer.byteLength(markdown);
  if (byteLength > 20_000) {
    add(name, "warning", "entrypoint-large", `SKILL.md is ${byteLength} bytes; consider progressive disclosure`, "SKILL.md");
  }

  const referenced = new Set<string>();
  for (const match of markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const rawTarget = match[1].trim();
    if (/^(?:https?:|mailto:|#)/.test(rawTarget)) {
      if (/^https?:/.test(rawTarget)) add(name, "info", "external-reference", `External instruction source: ${rawTarget}`, "SKILL.md");
      continue;
    }
    const targetPath = decodeURIComponent(rawTarget.split("#", 1)[0]);
    if (!targetPath) continue;
    const resolved = path.resolve(skillDir, targetPath);
    if (!resolved.startsWith(`${skillDir}${path.sep}`)) {
      add(name, "error", "reference-escapes-package", `Reference escapes the skill directory: ${rawTarget}`, "SKILL.md");
      continue;
    }
    referenced.add(relative(skillDir, resolved));
    if (!(await exists(resolved))) add(name, "error", "reference-missing", `Referenced file does not exist: ${rawTarget}`, "SKILL.md");
  }

  for (const match of markdown.matchAll(/(?:scripts|references|assets)\/[A-Za-z0-9_./-]+/g)) {
    const candidate = match[0].replace(/[),.;:`]+$/, "");
    referenced.add(candidate);
    if (!(await exists(path.join(skillDir, candidate)))) {
      add(name, "error", "resource-missing", `Mentioned resource does not exist: ${candidate}`, "SKILL.md");
    }
  }

  const allFiles = await listFiles(skillDir);
  for (const file of allFiles) {
    const rel = relative(skillDir, file);
    if (/^(?:scripts|references|assets)\//.test(rel) && !referenced.has(rel)) {
      add(name, "warning", "resource-orphaned", `Bundled resource is not discoverable from SKILL.md: ${rel}`, rel);
    }
  }

  const openaiYaml = path.join(skillDir, "agents", "openai.yaml");
  if (await exists(openaiYaml)) {
    const yaml = await fs.readFile(openaiYaml, "utf8");
    if (!yaml.includes("interface:")) add(name, "error", "ui-interface-missing", "agents/openai.yaml lacks interface metadata", "agents/openai.yaml");
    if (!yaml.includes(`$${name}`)) add(name, "error", "default-prompt-mismatch", "default_prompt must mention the skill by name", "agents/openai.yaml");
  }

  const textFiles = allFiles.filter((file) => /\.(?:md|ts|js|mjs|cjs|json|ya?ml|sh)$/i.test(file));
  const sensitiveDataPattern = new RegExp([String.raw`(?:\.ss`, String.raw`h\/|id_`, "rsa|wallet pri", "vate|seed ph", "rase)"].join(""), "i");
  for (const file of textFiles) {
    const content = await fs.readFile(file, "utf8");
    const rel = relative(skillDir, file);
    const riskyPatterns: Array<[RegExp, Severity, string, string]> = [
      [/\brm\s+-rf\b/i, "error", "destructive-delete", "Contains a recursive forced deletion command"],
      [/\bgit\s+reset\s+--hard\b/i, "warning", "destructive-git", "Contains a destructive git reset command"],
      [/(?:curl|wget)[^\n|]*\|\s*(?:sh|bash)\b/i, "error", "remote-shell-pipe", "Pipes remote content directly into a shell"],
      [sensitiveDataPattern, "warning", "sensitive-data-access", "Mentions highly sensitive local data"],
      [/ignore\s+(?:all\s+)?previous\s+instructions/i, "warning", "instruction-override", "Contains an instruction-override phrase"],
      [/[A-Za-z0-9+/]{180,}={0,2}/, "warning", "opaque-payload", "Contains a long opaque token that merits review"]
    ];
    for (const [pattern, severity, code, message] of riskyPatterns) {
      if (pattern.test(content)) add(name, severity, code, message, rel);
    }
  }
}

if (!(await exists(target))) throw new Error(`Target does not exist: ${target}`);
const skillDirs = await findSkills(target);
if (skillDirs.length === 0) throw new Error(`No SKILL.md found under ${target}`);
for (const skillDir of skillDirs) await auditSkill(skillDir);

const summary = {
  skills: skillDirs.length,
  errors: findings.filter((item) => item.severity === "error").length,
  warnings: findings.filter((item) => item.severity === "warning").length,
  info: findings.filter((item) => item.severity === "info").length
};

if (json) console.log(JSON.stringify({ target, summary, findings }, null, 2));
else {
  for (const item of findings) {
    const location = item.file ? ` (${item.file})` : "";
    console.log(`[${item.severity.toUpperCase()}] ${item.skill}/${item.code}${location}: ${item.message}`);
  }
  console.log(`Audited ${summary.skills} skill(s): ${summary.errors} error(s), ${summary.warnings} warning(s), ${summary.info} info`);
}

if (summary.errors > 0 || (strict && summary.warnings > 0)) process.exitCode = 1;
