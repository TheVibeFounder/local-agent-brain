import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function repoRootFromMeta(metaUrl) {
  const currentDir = path.dirname(fileURLToPath(metaUrl));
  return path.resolve(currentDir, "../../..");
}

export function findVaultRoot(startPath = process.cwd()) {
  let current = path.resolve(startPath);

  while (true) {
    const candidate = path.join(current, "brain.config.yaml");

    if (fs.existsSync(candidate)) {
      return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

export function resolveVaultRoot(cwd = process.cwd(), explicitPath) {
  if (explicitPath) {
    return path.resolve(cwd, explicitPath);
  }

  const found = findVaultRoot(cwd);

  if (!found) {
    throw new Error("No vault found from the current working directory.");
  }

  return found;
}
