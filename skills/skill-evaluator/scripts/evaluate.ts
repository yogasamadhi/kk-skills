import { promises as fs } from "node:fs";
import path from "node:path";

interface EvaluationCase {
  id: string;
  prompt: string;
  shouldTrigger: boolean;
  mustInclude?: string[];
  mustNotInclude?: string[];
  expectedFiles?: string[];
  forbiddenFiles?: string[];
}

interface CaseFile {
  version: number;
  skill: string;
  cases: EvaluationCase[];
}

interface RunResult {
  caseId: string;
  triggered: boolean;
  transcript?: string;
  files?: string[];
}

interface ResultFile {
  results: RunResult[];
}

interface Score {
  caseId: string;
  status: "pass" | "fail" | "not-run";
  failures: string[];
}

function valueAfter(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalize(file: string): string {
  return path.normalize(file).split(path.sep).join("/").replace(/^\.\//, "");
}

function validateCases(input: unknown): asserts input is CaseFile {
  if (!input || typeof input !== "object") throw new Error("Case file must be an object");
  const candidate = input as Partial<CaseFile>;
  if (candidate.version !== 1) throw new Error("Only case format version 1 is supported");
  if (typeof candidate.skill !== "string" || !candidate.skill) throw new Error("Case file requires skill");
  if (!Array.isArray(candidate.cases) || candidate.cases.length === 0) throw new Error("Case file requires at least one case");

  const ids = new Set<string>();
  for (const item of candidate.cases) {
    if (!item || typeof item !== "object") throw new Error("Each case must be an object");
    const test = item as Partial<EvaluationCase>;
    if (typeof test.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(test.id)) throw new Error("Case ids must use lowercase kebab-case");
    if (ids.has(test.id)) throw new Error(`Duplicate case id: ${test.id}`);
    ids.add(test.id);
    if (typeof test.prompt !== "string" || test.prompt.trim().length < 8) throw new Error(`Case ${test.id} has an invalid prompt`);
    if (typeof test.shouldTrigger !== "boolean") throw new Error(`Case ${test.id} requires shouldTrigger`);
    for (const field of ["mustInclude", "mustNotInclude", "expectedFiles", "forbiddenFiles"] as const) {
      const value = test[field];
      if (value !== undefined && (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))) {
        throw new Error(`Case ${test.id} has invalid ${field}`);
      }
    }
  }
}

const casesPath = valueAfter("--cases");
if (!casesPath) throw new Error("Usage: evaluate.ts --cases <cases.json> [--results <results.json>] [--json] [--fail-on-unrun]");
const casesInput: unknown = JSON.parse(await fs.readFile(path.resolve(casesPath), "utf8"));
validateCases(casesInput);

const resultPath = valueAfter("--results");
let runResults: RunResult[] = [];
if (resultPath) {
  const parsed = JSON.parse(await fs.readFile(path.resolve(resultPath), "utf8")) as Partial<ResultFile>;
  if (!Array.isArray(parsed.results)) throw new Error("Result file requires a results array");
  runResults = parsed.results;
}
const resultById = new Map(runResults.map((result) => [result.caseId, result]));

const scores: Score[] = casesInput.cases.map((test) => {
  const result = resultById.get(test.id);
  if (!result) return { caseId: test.id, status: "not-run", failures: [] };

  const failures: string[] = [];
  if (result.triggered !== test.shouldTrigger) {
    failures.push(`expected triggered=${test.shouldTrigger}, received ${result.triggered}`);
  }
  const transcript = (result.transcript ?? "").toLocaleLowerCase();
  for (const expected of test.mustInclude ?? []) {
    if (!transcript.includes(expected.toLocaleLowerCase())) failures.push(`transcript missing '${expected}'`);
  }
  for (const forbidden of test.mustNotInclude ?? []) {
    if (transcript.includes(forbidden.toLocaleLowerCase())) failures.push(`transcript contains forbidden '${forbidden}'`);
  }
  const files = new Set((result.files ?? []).map(normalize));
  for (const expected of test.expectedFiles ?? []) {
    if (!files.has(normalize(expected))) failures.push(`expected file missing: ${expected}`);
  }
  for (const forbidden of test.forbiddenFiles ?? []) {
    if (files.has(normalize(forbidden))) failures.push(`forbidden file created: ${forbidden}`);
  }
  return { caseId: test.id, status: failures.length === 0 ? "pass" : "fail", failures };
});

const unknownResults = runResults.filter((result) => !casesInput.cases.some((test) => test.id === result.caseId));
if (unknownResults.length > 0) throw new Error(`Unknown result case ids: ${unknownResults.map((item) => item.caseId).join(", ")}`);

const summary = {
  skill: casesInput.skill,
  total: scores.length,
  passed: scores.filter((score) => score.status === "pass").length,
  failed: scores.filter((score) => score.status === "fail").length,
  notRun: scores.filter((score) => score.status === "not-run").length
};

if (process.argv.includes("--json")) console.log(JSON.stringify({ summary, scores }, null, 2));
else {
  for (const score of scores) {
    console.log(`[${score.status.toUpperCase()}] ${score.caseId}${score.failures.length ? `: ${score.failures.join("; ")}` : ""}`);
  }
  console.log(`${summary.skill}: ${summary.passed} passed, ${summary.failed} failed, ${summary.notRun} not run`);
}

if (summary.failed > 0 || (process.argv.includes("--fail-on-unrun") && summary.notRun > 0)) process.exitCode = 1;
