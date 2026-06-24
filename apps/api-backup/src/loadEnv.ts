import { loadMonorepoEnv } from "@makyschool/shared/load-env";
import path from "node:path";
import { fileURLToPath } from "node:url";

const monorepoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

loadMonorepoEnv(monorepoRoot);
