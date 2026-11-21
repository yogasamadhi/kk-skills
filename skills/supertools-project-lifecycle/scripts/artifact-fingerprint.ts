import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";

async function fingerprint(directory: string): Promise<string> {
  if (!(await lstat(directory)).isDirectory()) {
    throw new Error("Artifact path must be a directory, not a symbolic link");
  }

  const manifest = createHash("sha256");
  let files = 0;

  async function scan(relativeDirectory: string): Promise<void> {
    const entries = await readdir(path.join(directory, relativeDirectory));
    for (const name of entries.sort()) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${name}` : name;
      const absolutePath = path.join(directory, relativePath);
      const entry = await lstat(absolutePath);
      if (entry.isDirectory()) {
        await scan(relativePath);
        continue;
      }
      if (!entry.isFile()) {
        throw new Error(`Artifact must contain only regular files and directories: ${JSON.stringify(relativePath)}`);
      }

      const hash = createHash("sha256");
      for await (const chunk of createReadStream(absolutePath)) {
        hash.update(chunk);
      }
      manifest.update(JSON.stringify([relativePath, hash.digest("hex")]));
      manifest.update("\n");
      files += 1;
    }
  }

  await scan("");
  if (files === 0) throw new Error("Artifact directory is empty");
  return manifest.digest("hex");
}

async function main(): Promise<void> {
  const [directory, expected, ...extra] = process.argv.slice(2);
  if (!directory || extra.length > 0 || (expected !== undefined && !/^[a-f0-9]{64}$/i.test(expected))) {
    throw new Error("Usage: artifact-fingerprint.ts <artifact-directory> [expected-sha256]");
  }

  const actual = await fingerprint(path.resolve(directory));
  if (expected !== undefined && actual !== expected.toLowerCase()) {
    throw new Error(`Artifact fingerprint mismatch: expected ${expected}, got ${actual}`);
  }
  console.log(actual);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
