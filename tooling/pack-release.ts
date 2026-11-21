import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [tag, destination, ...extra] = process.argv.slice(2);
if (!tag || !/^v\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(tag) || !destination || extra.length) {
  console.error("Usage: pnpm run release:pack <vX.Y.Z[-suffix]> <new-output-directory>");
  process.exit(2);
}

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.resolve(destination);
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "-z", "--", "skills"],
  { cwd: root, encoding: "utf8" },
).split("\0").filter(Boolean);
const skills = [...new Set(files.flatMap((file) => {
  const match = file.match(/^skills\/([a-z0-9-]+)\/SKILL\.md$/);
  return match ? [match[1]] : [];
}))].sort();
if (!skills.length) throw new Error("No Skill packages found.");

// Reserve a new directory so a retry cannot overwrite an earlier candidate.
await mkdir(output);
try {
  const work = await mkdtemp(path.join(tmpdir(), "kk-skills-release-"));
  try {
    const stage = path.join(work, "stage");
    const unpacked = path.join(work, "unpacked");
    await mkdir(unpacked);
    const checksums: string[] = [];

    for (const skill of skills) {
      const prefix = `skills/${skill}/`;
      const entries = [...new Set(files
        .filter((file) => file.startsWith(prefix))
        .map((file) => file.slice(prefix.length)))].sort();
      for (const entry of entries) {
        const source = path.join(root, prefix, entry);
        if (!(await lstat(source)).isFile()) {
          throw new Error(`Expected a regular file: ${prefix}${entry}`);
        }
        const target = path.join(stage, skill, entry);
        await mkdir(path.dirname(target), { recursive: true });
        await copyFile(source, target);
      }
      if (!entries.includes("LICENSE")) {
        await copyFile(path.join(root, "LICENSE"), path.join(stage, skill, "LICENSE"));
      }
      const filename = `${skill}-${tag}.zip`;
      const archive = path.join(output, filename);
      execFileSync("zip", ["-q", "-X", "-D", "-r", archive, skill], { cwd: stage, stdio: "inherit" });
      execFileSync("unzip", ["-q", archive, "-d", unpacked], { stdio: "inherit" });
      checksums.push(`${createHash("sha256").update(await readFile(archive)).digest("hex")}  ${filename}`);
    }

    execFileSync(
      process.execPath,
      ["--experimental-strip-types", "tooling/validate-skills.ts", unpacked],
      { cwd: root, stdio: "inherit" },
    );
    await writeFile(path.join(output, "SHA256SUMS.txt"), checksums.join("\n") + "\n");
    console.log(`Verified ${skills.length} Skill ZIPs in ${output}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
} catch (error) {
  await rm(output, { recursive: true, force: true });
  throw error;
}
