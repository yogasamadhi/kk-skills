import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, copyFile, mkdir, mkdtemp, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const temporary = await mkdtemp(path.join(os.tmpdir(), "supertools-skill-"));
const installedSkill = path.join(temporary, "installed skill");
const script = path.join(installedSkill, "scripts", "artifact-fingerprint.ts");
const site = path.join(temporary, "staged site");
const copy = path.join(temporary, "restored site");

function fingerprint(directory: string, expected?: string, status = 0): string {
  const args = ["--experimental-strip-types", script, directory];
  if (expected !== undefined) args.push(expected);
  const result = spawnSync(process.execPath, args, { cwd: temporary, encoding: "utf8" });
  assert.equal(result.status, status, result.error?.message ?? result.stderr);
  return (status === 0 ? result.stdout : result.stderr).trim();
}

async function checkReleaseExample(expectedDigest: string): Promise<void> {
  // These copyable examples are POSIX shell. Also exercise them from a standalone installation.
  const guide = await readFile(path.join(installedSkill, "references", "cloudbase.md"), "utf8");
  const blocks = [...guide.matchAll(/^```sh\r?\n([\s\S]*?)\r?\n```$/gm)].map(match => match[1]);
  const prepare = blocks.find(block => block.includes("artifact-fingerprint.ts") && !block.includes("tcb hosting deploy"));
  const upload = blocks.find(block => block.includes("tcb hosting deploy"));
  assert.ok(prepare && upload, "Missing candidate or upload example");

  const calls = path.join(temporary, "tcb-calls");
  const env = {
    ...process.env,
    PATH: temporary + path.delimiter + process.env.PATH,
    SKILL_DIR: installedSkill,
    SITE_DIR: copy,
    EXPECTED_SHA256: expectedDigest,
    CLOUD_PATH: "preview/quote",
    ENV_ID: "fixture-only",
    TCB_CALLS: calls
  };
  await writeFile(path.join(temporary, "tcb"), '#!/bin/sh\nprintf "%s\\n" "$@" >> "$TCB_CALLS"\nexit "${TCB_EXIT:-0}"\n', { mode: 0o700 });

  const run = (command: string, overrides: Record<string, string> = {}) => {
    const result = spawnSync("sh", ["-c", command], { cwd: temporary, encoding: "utf8", env: { ...env, TCB_EXIT: "0", ...overrides } });
    if (result.error) throw result.error;
    return result;
  };
  const prepared = run(prepare);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(prepared.stdout.trim(), expectedDigest);

  const invalidSettings: Record<string, string>[] = [
    { EXPECTED_SHA256: "0".repeat(64) },
    { EXPECTED_SHA256: "" },
    { CLOUD_PATH: "" },
    { ENV_ID: "" },
    { SITE_DIR: path.join(temporary, "absent") }
  ];
  for (const overrides of invalidSettings) {
    assert.notEqual(run(upload, overrides).status, 0);
    await assert.rejects(readFile(calls), { code: "ENOENT" });
  }
  const success = run(upload);
  assert.equal(success.status, 0, success.stderr);
  const args = (await readFile(calls, "utf8")).trimEnd().split("\n");
  assert.deepEqual(args, ["hosting", "deploy", copy, env.CLOUD_PATH, "-e", env.ENV_ID, "--safe", "--verify"]);
  assert.equal(run(upload, { TCB_EXIT: "17" }).status, 17);
}

try {
  await cp("skills/supertools-project-lifecycle", installedSkill, { recursive: true });
  await mkdir(path.join(site, "assets"), { recursive: true });
  await mkdir(copy);
  assert.match(fingerprint(copy, undefined, 1), /empty/);

  await writeFile(path.join(site, "index.html"), "<p>Version one</p>");
  await writeFile(path.join(site, "assets", "entry.js"), "console.log(1)");
  await mkdir(path.join(copy, "assets"));
  await copyFile(path.join(site, "assets", "entry.js"), path.join(copy, "assets", "entry.js"));
  await copyFile(path.join(site, "index.html"), path.join(copy, "index.html"));

  const original = fingerprint(site);
  assert.match(original, /^[a-f0-9]{64}$/);
  assert.equal(fingerprint(copy, original), original);
  if (process.platform !== "win32") await checkReleaseExample(original);
  assert.match(fingerprint(copy, "too-short", 1), /Usage/);

  await rename(path.join(copy, "assets", "entry.js"), path.join(copy, "assets", "renamed.js"));
  assert.match(fingerprint(copy, original, 1), /fingerprint mismatch/);
  await rename(path.join(copy, "assets", "renamed.js"), path.join(copy, "assets", "entry.js"));
  await writeFile(path.join(copy, "index.html"), "<p>Version two</p>");
  assert.match(fingerprint(copy, original, 1), /fingerprint mismatch/);
  await writeFile(path.join(copy, "index.html"), "<p>Version one</p>");
  assert.equal(fingerprint(copy, original), original);
  await writeFile(path.join(copy, "old.html"), "<p>Leftover file</p>");
  assert.match(fingerprint(copy, original, 1), /fingerprint mismatch/);

  // A Windows directory junction exercises link rejection without Developer Mode privileges.
  const linkType = process.platform === "win32" ? "junction" : "dir";
  await symlink(path.join(site, "assets"), path.join(copy, "linked-assets"), linkType);
  assert.match(fingerprint(copy, undefined, 1), /only regular files and directories/);
  const linkedRoot = path.join(temporary, "alias");
  await symlink(site, linkedRoot, linkType);
  assert.match(fingerprint(linkedRoot, undefined, 1), /must be a directory/);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
