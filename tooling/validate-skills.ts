import { promises as fs } from "node:fs";
import path from "node:path";

type Level = "error" | "warning";

interface Finding {
  level: Level;
  skill: string;
  message: string;
}

const root = path.resolve(process.argv[2] ?? "skills");
const findings: Finding[] = [];
const names = new Map<string, string>();

function report(level: Level, skill: string, message: string): void {
  findings.push({ level, skill, message });
}

function frontmatter(markdown: string): Map<string, string> | undefined {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return undefined;

  const values = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([a-zA-Z][\w-]*):\s*(.*)$/);
    if (!entry) continue;
    values.set(entry[1], entry[2].trim().replace(/^(["'])(.*)\1$/, "$2"));
  }
  return values;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(absolute)));
    else result.push(absolute);
  }
  return result;
}

async function validateSkill(directory: string): Promise<void> {
  const folderName = path.basename(directory);
  const skillFile = path.join(directory, "SKILL.md");
  const markdown = await fs.readFile(skillFile, "utf8");
  const metadata = frontmatter(markdown);

  if (!metadata) {
    report("error", folderName, "SKILL.md 缺少 YAML frontmatter");
    return;
  }

  const name = metadata.get("name") ?? "";
  const description = metadata.get("description") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    report("error", folderName, `name 不合法: ${name || "<missing>"}`);
  }
  if (name !== folderName) {
    report("error", folderName, `name 必须与目录名一致，当前为 ${name || "<missing>"}`);
  }
  if (!description || description.length > 1024) {
    report("error", folderName, "description 缺失或超过 1024 个字符");
  } else if (description.length < 40) {
    report("warning", folderName, "description 可能过短，难以准确触发");
  }

  const previous = names.get(name);
  if (previous) report("error", folderName, `与 ${previous} 使用重复 name`);
  else names.set(name, folderName);

  if (/\b(TODO|PLACEHOLDER|replace me)\b/i.test(markdown)) {
    report("error", folderName, "SKILL.md 中仍有脚手架占位文本");
  }

  const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(linkPattern)) {
    const target = match[1].split("#", 1)[0].trim();
    if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;
    const resolved = path.resolve(directory, decodeURIComponent(target));
    if (!resolved.startsWith(`${directory}${path.sep}`)) {
      report("error", folderName, `相对链接越过 Skill 目录: ${target}`);
    } else if (!(await exists(resolved))) {
      report("error", folderName, `相对链接不存在: ${target}`);
    }
  }

  const openaiYaml = path.join(directory, "agents", "openai.yaml");
  if (await exists(openaiYaml)) {
    const yaml = await fs.readFile(openaiYaml, "utf8");
    if (!yaml.includes("interface:")) report("error", folderName, "openai.yaml 缺少 interface");
    if (!yaml.includes(`$${name}`)) {
      report("error", folderName, "openai.yaml 的 default_prompt 必须显式提及 Skill 名称");
    }
  }

  for (const file of await walk(directory)) {
    if (file.endsWith(".py")) report("error", folderName, `仓库约定禁止 Python helper: ${path.relative(directory, file)}`);
  }
}

const entries = await fs.readdir(root, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isDirectory()) continue;
  const directory = path.join(root, entry.name);
  if (await exists(path.join(directory, "SKILL.md"))) await validateSkill(directory);
}

for (const finding of findings) {
  const marker = finding.level === "error" ? "ERROR" : "WARN";
  console.log(`[${marker}] ${finding.skill}: ${finding.message}`);
}

const errors = findings.filter((finding) => finding.level === "error").length;
const warnings = findings.length - errors;
console.log(`Validated ${names.size} skills: ${errors} error(s), ${warnings} warning(s)`);
if (errors > 0) process.exitCode = 1;
