import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = path.resolve(apiRoot, "../..");

const envFiles = [
  path.join(monorepoRoot, ".env"),
  path.join(apiRoot, ".env"),
];

function parseValue(raw: string) {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function loadFile(filePath: string, override = false) {
  const content = readFileSync(filePath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = parseValue(trimmed.slice(separator + 1));

    if (key && (override || process.env[key] === undefined)) {
      process.env[key] = value;
    }
  }
}

for (const [index, filePath] of envFiles.entries()) {
  if (existsSync(filePath)) {
    loadFile(filePath, index > 0);
  }
}
