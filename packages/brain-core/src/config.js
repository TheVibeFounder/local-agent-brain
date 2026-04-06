import fs from "node:fs";
import path from "node:path";

import { SCHEMA_VERSION } from "./constants.js";
import { parseYaml, stringifyYaml } from "./yaml.js";

export function createDefaultConfig({ vaultName, profile, mode = "local-only" }) {
  return {
    version: 1,
    vault_name: vaultName,
    profile,
    mode,
    created_at: new Date().toISOString(),
    index_path: ".brain/index.db",
    schema_version: SCHEMA_VERSION
  };
}

export function loadConfig(vaultRoot) {
  const configPath = path.join(vaultRoot, "brain.config.yaml");
  return parseYaml(fs.readFileSync(configPath, "utf8"));
}

export function writeConfig(vaultRoot, config) {
  const configPath = path.join(vaultRoot, "brain.config.yaml");
  fs.writeFileSync(configPath, `${stringifyYaml(config)}\n`, "utf8");
}
