import { spawnSync } from "node:child_process";
import path from "node:path";

interface SmokeCase {
  name: string;
  script: string;
  args: string[];
  expectedStatus?: number;
  expectedOutput?: string;
}

const root = process.cwd();
const cases: SmokeCase[] = [
  { name: "supertools-project-lifecycle", script: "tooling/test-supertools-project-lifecycle.ts", args: [] },
  { name: "usage-window-scheduler", script: "tooling/test-usage-window-scheduler.ts", args: [] },
  { name: "skill-doctor", script: "skills/skill-doctor/scripts/doctor.ts", args: ["skills", "--json"] },
  { name: "skill-evaluator", script: "skills/skill-evaluator/scripts/evaluate.ts", args: ["--cases", "tooling/fixtures/evaluator-cases.json", "--results", "tooling/fixtures/evaluator-results.json", "--json"] },
  { name: "ts-change-verification", script: "skills/ts-change-verification/scripts/plan-verification.ts", args: [".", "--json"] },
  { name: "dependency-incident-audit", script: "skills/dependency-incident-audit/scripts/audit-dependency.ts", args: ["--package", "typescript", "--root", ".", "--json"] },
  { name: "ts-release-readiness", script: "skills/ts-release-readiness/scripts/check-release.ts", args: [".", "--json"] },
  { name: "docs-code-sync", script: "skills/docs-code-sync/scripts/scan-docs.ts", args: [".", "--json"] },
  { name: "runtime-compatibility-probe", script: "skills/runtime-compatibility-probe/scripts/probe-runtime.ts", args: [".", "--json"] },
  { name: "miniapp-release-audit", script: "skills/miniapp-release-audit/scripts/audit-miniapp.ts", args: [".", "--json"] },
  { name: "architecture-implementation-audit", script: "skills/architecture-implementation-audit/scripts/audit-claims.ts", args: ["--ledger", "tooling/fixtures/workflow-skills/claims-valid.json", "--root", "tooling/fixtures/workflow-skills", "--json", "--fail-on-error"] },
  { name: "vendor-submodule-guardian", script: "skills/vendor-submodule-guardian/scripts/inspect-submodules.ts", args: [".", "--json", "--fail-on-blocker"] },
  { name: "delivery-completeness-ledger", script: "skills/delivery-completeness-ledger/scripts/check-ledger.ts", args: ["--ledger", "tooling/fixtures/workflow-skills/delivery-valid.json", "--root", "tooling/fixtures/workflow-skills", "--json", "--fail-on-incomplete"] },
  { name: "migration-parity-keeper", script: "skills/migration-parity-keeper/scripts/check-parity.ts", args: ["--manifest", "tooling/fixtures/workflow-skills/parity-valid.json", "--root", "tooling/fixtures/workflow-skills", "--json", "--fail-on-gap"] },
  { name: "agent-runtime-diagnostics", script: "skills/agent-runtime-diagnostics/scripts/diagnose-runtime.ts", args: ["--snapshot", "tooling/fixtures/workflow-skills/runtime-valid.json", "--json", "--fail-on-blocker"] },
  { name: "desktop-release-matrix", script: "skills/desktop-release-matrix/scripts/check-desktop-release.ts", args: ["--manifest", "tooling/fixtures/workflow-skills/release-valid.json", "--root", "tooling/fixtures/workflow-skills", "--json", "--fail-on-blocker"] },
  { name: "evidence-based-technical-decision", script: "skills/evidence-based-technical-decision/scripts/score-decision.ts", args: ["--decision", "tooling/fixtures/workflow-skills/decision-valid.json", "--json", "--fail-on-blocker"] },
  { name: "product-engineering-loop", script: "skills/product-engineering-loop/scripts/check-iteration.ts", args: ["--ledger", "tooling/fixtures/workflow-skills/iteration-valid.json", "--root", "tooling/fixtures/workflow-skills", "--json", "--fail-on-error"] },
  { name: "skill-doctor-negative", script: "skills/skill-doctor/scripts/doctor.ts", args: ["tooling/fixtures/broken-skill", "--json"], expectedStatus: 1, expectedOutput: "reference-missing" },
  { name: "skill-evaluator-negative", script: "skills/skill-evaluator/scripts/evaluate.ts", args: ["--cases", "tooling/fixtures/evaluator-cases.json", "--results", "tooling/fixtures/evaluator-results-failing.json"], expectedStatus: 1, expectedOutput: "FAIL" },
  { name: "dependency-incident-negative", script: "skills/dependency-incident-audit/scripts/audit-dependency.ts", args: ["--package", "typescript", "--root", ".", "--json", "--fail-on-found"], expectedStatus: 1, expectedOutput: "directReferences" },
  { name: "release-readiness-negative", script: "skills/ts-release-readiness/scripts/check-release.ts", args: ["tooling/fixtures/release-broken", "--fail-on-blocker"], expectedStatus: 1, expectedOutput: "main-missing" },
  { name: "docs-sync-negative", script: "skills/docs-code-sync/scripts/scan-docs.ts", args: ["tooling/fixtures/docs-broken", "--fail-on-error"], expectedStatus: 1, expectedOutput: "local-link-broken" },
  { name: "runtime-probe-negative", script: "skills/runtime-compatibility-probe/scripts/probe-runtime.ts", args: ["tooling/fixtures/runtime-broken", "--fail-on-blocked"], expectedStatus: 1, expectedOutput: "blocked" },
  { name: "miniapp-audit-negative", script: "skills/miniapp-release-audit/scripts/audit-miniapp.ts", args: ["tooling/fixtures/miniapp-broken", "--fail-on-blocker"], expectedStatus: 1, expectedOutput: "appid-placeholder" },
  { name: "architecture-audit-negative", script: "skills/architecture-implementation-audit/scripts/audit-claims.ts", args: ["--ledger", "tooling/fixtures/workflow-skills/claims-invalid.json", "--root", "tooling/fixtures/workflow-skills", "--fail-on-error"], expectedStatus: 1, expectedOutput: "implementation-evidence-missing" },
  { name: "submodule-guardian-negative", script: "skills/vendor-submodule-guardian/scripts/inspect-submodules.ts", args: ["tooling/fixtures/submodule-broken", "--fail-on-blocker"], expectedStatus: 1, expectedOutput: "worktree-missing" },
  { name: "delivery-ledger-negative", script: "skills/delivery-completeness-ledger/scripts/check-ledger.ts", args: ["--ledger", "tooling/fixtures/workflow-skills/delivery-invalid.json", "--root", "tooling/fixtures/workflow-skills", "--fail-on-incomplete"], expectedStatus: 1, expectedOutput: "completion-claim-false" },
  { name: "migration-parity-negative", script: "skills/migration-parity-keeper/scripts/check-parity.ts", args: ["--manifest", "tooling/fixtures/workflow-skills/parity-invalid.json", "--root", "tooling/fixtures/workflow-skills", "--fail-on-gap"], expectedStatus: 1, expectedOutput: "cutover-required-gaps" },
  { name: "agent-runtime-negative", script: "skills/agent-runtime-diagnostics/scripts/diagnose-runtime.ts", args: ["--snapshot", "tooling/fixtures/workflow-skills/runtime-invalid.json", "--fail-on-blocker"], expectedStatus: 1, expectedOutput: "process-inference-contradiction" },
  { name: "desktop-release-negative", script: "skills/desktop-release-matrix/scripts/check-desktop-release.ts", args: ["--manifest", "tooling/fixtures/workflow-skills/release-invalid.json", "--root", "tooling/fixtures/workflow-skills", "--fail-on-blocker"], expectedStatus: 1, expectedOutput: "file-missing" },
  { name: "technical-decision-negative", script: "skills/evidence-based-technical-decision/scripts/score-decision.ts", args: ["--decision", "tooling/fixtures/workflow-skills/decision-invalid.json", "--fail-on-blocker"], expectedStatus: 1, expectedOutput: "weights-not-100" },
  { name: "product-loop-negative", script: "skills/product-engineering-loop/scripts/check-iteration.ts", args: ["--ledger", "tooling/fixtures/workflow-skills/iteration-invalid.json", "--root", "tooling/fixtures/workflow-skills", "--fail-on-error"], expectedStatus: 1, expectedOutput: "behavior-evidence-missing" }
];

let failed = 0;
for (const test of cases) {
  const result = spawnSync(process.execPath, ["--experimental-strip-types", path.join(root, test.script), ...test.args], {
    cwd: root,
    encoding: "utf8",
    shell: false
  });
  const expectedStatus = test.expectedStatus ?? 0;
  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const outputMatches = test.expectedOutput === undefined || combinedOutput.includes(test.expectedOutput);
  if (result.status === expectedStatus && outputMatches) console.log(`[PASS] ${test.name}`);
  else {
    failed += 1;
    console.error(`[FAIL] ${test.name} (exit ${result.status}, expected ${expectedStatus}${test.expectedOutput ? `, output containing '${test.expectedOutput}'` : ""})`);
    if (result.stdout) console.error(result.stdout.trim());
    if (result.stderr) console.error(result.stderr.trim());
  }
}

console.log(`${cases.length - failed}/${cases.length} smoke tests passed`);
if (failed > 0) process.exitCode = 1;
