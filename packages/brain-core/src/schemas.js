import fs from "node:fs";
import path from "node:path";

import { parseFrontmatter } from "./frontmatter.js";
import {
  REQUIRED_DIRECTORIES,
  REQUIRED_FILES,
  SCHEMA_VERSION,
  VALID_CONNECTOR_TYPES,
  VALID_MODES,
  VALID_PROFILES,
  VALID_RISK_CLASSES
} from "./constants.js";
import { loadConfig } from "./config.js";
import { parseYaml } from "./yaml.js";
import { relativePath, walkFiles } from "./utils.js";

function pushMissingFields(issues, targetPath, data, fields) {
  for (const field of fields) {
    if (!(field in data)) {
      issues.push({
        severity: "error",
        path: targetPath,
        message: `Missing required field: ${field}`
      });
    }
  }
}

function validateMarkdownFrontmatter(issues, vaultRoot, filePath, requiredFields) {
  const relative = relativePath(vaultRoot, filePath);
  const parsed = parseFrontmatter(fs.readFileSync(filePath, "utf8"));
  pushMissingFields(issues, relative, parsed.data, requiredFields);
}

function validateStateFile(issues, vaultRoot, filePath) {
  const relative = relativePath(vaultRoot, filePath);
  let parsed;

  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    issues.push({
      severity: "error",
      path: relative,
      message: `Invalid JSON: ${error.message}`
    });
    return;
  }

  pushMissingFields(issues, relative, parsed, [
    "domain",
    "captured_at",
    "expires_at",
    "source",
    "sensitivity",
    "items"
  ]);

  if (Date.parse(parsed.expires_at) && Date.parse(parsed.expires_at) < Date.now()) {
    issues.push({
      severity: "warning",
      path: relative,
      message: "State snapshot is stale."
    });
  }
}

function validateJsonLinesFile(issues, vaultRoot, filePath) {
  const relative = relativePath(vaultRoot, filePath);
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();

    if (!line) {
      continue;
    }

    try {
      JSON.parse(line);
    } catch (error) {
      issues.push({
        severity: "error",
        path: relative,
        message: `Invalid JSONL at line ${index + 1}: ${error.message}`
      });
      return;
    }
  }
}

function validateConnectorManifest(issues, vaultRoot, filePath) {
  const relative = relativePath(vaultRoot, filePath);
  let manifest;

  try {
    manifest = parseYaml(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    issues.push({
      severity: "error",
      path: relative,
      message: `Invalid connector manifest: ${error.message}`
    });
    return;
  }

  pushMissingFields(issues, relative, manifest, [
    "name",
    "type",
    "enabled",
    "sync_method",
    "read_scope",
    "sensitivity",
    "capabilities",
    "risk_class",
    "approval_policy"
  ]);

  if (manifest.type && !VALID_CONNECTOR_TYPES.includes(manifest.type)) {
    issues.push({
      severity: "error",
      path: relative,
      message: `Unsupported connector type: ${manifest.type}`
    });
  }

  if (manifest.risk_class && !VALID_RISK_CLASSES.includes(manifest.risk_class)) {
    issues.push({
      severity: "error",
      path: relative,
      message: `Unsupported risk class: ${manifest.risk_class}`
    });
  }

  if (manifest.capabilities && !Array.isArray(manifest.capabilities)) {
    issues.push({
      severity: "error",
      path: relative,
      message: "Connector capabilities must be an array."
    });
  }

  if (manifest.type === "snapshot") {
    pushMissingFields(issues, relative, manifest, ["evidence_sink", "state_sink", "freshness_ttl"]);
  }

  if (manifest.type === "evidence_only") {
    pushMissingFields(issues, relative, manifest, ["evidence_sink"]);
  }

  if (manifest.type === "state_only") {
    pushMissingFields(issues, relative, manifest, ["state_sink", "freshness_ttl"]);
  }
}

function validateToolManifest(issues, vaultRoot, filePath) {
  const relative = relativePath(vaultRoot, filePath);
  let manifest;

  try {
    manifest = parseYaml(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    issues.push({
      severity: "error",
      path: relative,
      message: `Invalid tool manifest: ${error.message}`
    });
    return;
  }

  pushMissingFields(issues, relative, manifest, [
    "name",
    "command",
    "cwd",
    "inputs",
    "outputs",
    "timeout_sec",
    "side_effects",
    "capabilities",
    "risk_class",
    "approval_policy",
    "failure_modes"
  ]);

  if (manifest.risk_class && !VALID_RISK_CLASSES.includes(manifest.risk_class)) {
    issues.push({
      severity: "error",
      path: relative,
      message: `Unsupported risk class: ${manifest.risk_class}`
    });
  }

  for (const field of ["inputs", "outputs", "side_effects", "capabilities", "failure_modes"]) {
    if (field in manifest && !Array.isArray(manifest[field])) {
      issues.push({
        severity: "error",
        path: relative,
        message: `Tool field ${field} must be an array.`
      });
    }
  }
}

export function validateVaultShape(vaultRoot) {
  const issues = [];

  for (const directory of REQUIRED_DIRECTORIES) {
    const target = path.join(vaultRoot, directory);
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      issues.push({
        severity: "error",
        path: directory,
        message: "Missing required directory."
      });
    }
  }

  for (const file of REQUIRED_FILES) {
    const target = path.join(vaultRoot, file);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
      issues.push({
        severity: "error",
        path: file,
        message: "Missing required file."
      });
    }
  }

  return issues;
}

export function validateConfigFile(vaultRoot) {
  const issues = [];
  let config;

  try {
    config = loadConfig(vaultRoot);
  } catch (error) {
    return [{
      severity: "error",
      path: "brain.config.yaml",
      message: `Invalid config: ${error.message}`
    }];
  }

  pushMissingFields(issues, "brain.config.yaml", config, [
    "version",
    "vault_name",
    "profile",
    "mode",
    "created_at",
    "index_path",
    "schema_version"
  ]);

  if (config.schema_version !== SCHEMA_VERSION) {
    issues.push({
      severity: "warning",
      path: "brain.config.yaml",
      message: `Unexpected schema version ${config.schema_version}.`
    });
  }

  if (config.profile && !VALID_PROFILES.includes(config.profile)) {
    issues.push({
      severity: "error",
      path: "brain.config.yaml",
      message: `Unsupported profile: ${config.profile}`
    });
  }

  if (config.mode && !VALID_MODES.includes(config.mode)) {
    issues.push({
      severity: "error",
      path: "brain.config.yaml",
      message: `Unsupported mode: ${config.mode}`
    });
  }

  return issues;
}

export function collectSchemaIssues(vaultRoot) {
  const issues = [
    ...validateVaultShape(vaultRoot),
    ...validateConfigFile(vaultRoot)
  ];

  for (const filePath of walkFiles(path.join(vaultRoot, "memory"))) {
    if (!filePath.endsWith(".md")) {
      continue;
    }

    validateMarkdownFrontmatter(issues, vaultRoot, filePath, ["id", "type", "updated_at"]);
  }

  for (const filePath of walkFiles(path.join(vaultRoot, "staging"))) {
    if (!filePath.endsWith(".md") && !filePath.endsWith(".json")) {
      continue;
    }

    if (filePath.endsWith(".md")) {
      validateMarkdownFrontmatter(issues, vaultRoot, filePath, [
        "id",
        "kind",
        "proposed_target",
        "status",
        "created_at",
        "generated_by",
        "provenance",
        "confidence"
      ]);
      continue;
    }
  }

  for (const filePath of walkFiles(path.join(vaultRoot, "decisions"))) {
    if (filePath.endsWith(".md")) {
      validateMarkdownFrontmatter(issues, vaultRoot, filePath, [
        "id",
        "date",
        "owner",
        "status",
        "evidence",
        "related"
      ]);
    }
  }

  for (const filePath of walkFiles(path.join(vaultRoot, "state"))) {
    if (filePath.endsWith(".json")) {
      validateStateFile(issues, vaultRoot, filePath);
    }
  }

  for (const filePath of walkFiles(path.join(vaultRoot, "connectors"))) {
    if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
      validateConnectorManifest(issues, vaultRoot, filePath);
    }
  }

  for (const filePath of walkFiles(path.join(vaultRoot, "tools"))) {
    if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
      validateToolManifest(issues, vaultRoot, filePath);
    }
  }

  for (const fileName of ["logs/actions.jsonl", "logs/connectors.jsonl"]) {
    const filePath = path.join(vaultRoot, fileName);

    if (fs.existsSync(filePath)) {
      validateJsonLinesFile(issues, vaultRoot, filePath);
    }
  }

  return issues;
}
