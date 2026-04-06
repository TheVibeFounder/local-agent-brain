import fs from "node:fs";
import path from "node:path";

import { getProfilePreset, renderAgentsAdapter, renderBrainProtocol, renderClaudeAdapter } from "../../brain-profiles/src/index.js";
import { createDefaultConfig, writeConfig } from "./config.js";
import { REQUIRED_DIRECTORIES } from "./constants.js";
import { ensureDirectory } from "./utils.js";

export function initializeVault(targetPath, { profile }) {
  const preset = getProfilePreset(profile);
  const vaultRoot = path.resolve(targetPath);

  ensureDirectory(vaultRoot);

  if (fs.existsSync(path.join(vaultRoot, "brain.config.yaml"))) {
    throw new Error(`Vault already exists at ${vaultRoot}`);
  }

  for (const directory of REQUIRED_DIRECTORIES) {
    ensureDirectory(path.join(vaultRoot, directory));
  }

  writeConfig(vaultRoot, createDefaultConfig({
    vaultName: path.basename(vaultRoot),
    profile: preset.name,
    mode: preset.defaultMode
  }));

  fs.writeFileSync(path.join(vaultRoot, "protocols/BRAIN.md"), renderBrainProtocol(profile), "utf8");
  fs.writeFileSync(path.join(vaultRoot, "CLAUDE.md"), renderClaudeAdapter(profile), "utf8");
  fs.writeFileSync(path.join(vaultRoot, "AGENTS.md"), renderAgentsAdapter(profile), "utf8");
  fs.writeFileSync(path.join(vaultRoot, "logs/actions.jsonl"), "", "utf8");
  fs.writeFileSync(path.join(vaultRoot, "logs/connectors.jsonl"), "", "utf8");

  fs.writeFileSync(
    path.join(vaultRoot, "views/index.md"),
    `# Vault Home\n\nProfile: ${preset.label}\n\nRun \`brain compile\` to generate staged wiki candidates and refreshed views.\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(vaultRoot, "views/wiki.md"),
    "# Wiki Index\n\nNo wiki pages yet.\n",
    "utf8"
  );

  return { vaultRoot, profile: preset.name };
}
