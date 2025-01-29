import { readFile } from "fs/promises";
import { join } from "path";
import { SchemaVersion } from "../types";

export async function getCurrentVersion(
  outputDir: string,
  filename: string
): Promise<SchemaVersion> {
  try {
    const content = await readFile(join(outputDir, filename), "utf-8");
    // Try to match both formats:
    // 1. Old format: version: 1
    // 2. New format: createSchema(1, {
    const versionMatch =
      content.match(/version:\s*(\d+)/) || content.match(/createSchema\(\s*(\d+)/);
    const hashMatch = content.match(/Schema hash: ([a-f0-9]+)/);

    return {
      version: versionMatch ? parseInt(versionMatch[1], 10) : 0,
      hash: hashMatch ? hashMatch[1] : null,
    };
  } catch {
    return { version: 0, hash: null };
  }
}

export function calculateNextVersion(
  currentVersion: number,
  currentHash: string | null,
  newHash: string,
  configVersion?: number
): number {
  if (configVersion !== undefined) {
    return configVersion;
  }

  return currentHash !== newHash ? currentVersion + 1 : currentVersion === 0 ? 1 : currentVersion;
}
