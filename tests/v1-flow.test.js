import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runCli } from "../packages/brain-cli/src/run.js";
import { isCapabilityAllowed, parseFrontmatter } from "../packages/brain-core/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const fixturePath = path.join(repoRoot, "tests/fixtures/meeting-notes.md");

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "local-agent-brain-"));
}

test("V1 flow initializes, ingests, compiles, promotes, queries, and rebuilds index", async () => {
  const workspace = makeWorkspace();
  const vaultName = "demo-vault";
  const vaultPath = path.join(workspace, vaultName);

  let result = await runCli(["init", vaultName, "--profile", "research"], { cwd: workspace });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Initialized research vault/);
  assert.ok(fs.existsSync(path.join(vaultPath, "brain.config.yaml")));
  assert.ok(fs.existsSync(path.join(vaultPath, "logs/actions.jsonl")));
  assert.ok(fs.existsSync(path.join(vaultPath, "logs/connectors.jsonl")));

  result = await runCli(["doctor"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Doctor completed with 0 errors and 0 warnings/);

  result = await runCli(["ingest", fixturePath], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Ingested 1 item/);

  result = await runCli(["compile"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Compile finished/);

  const stagingFiles = fs
    .readdirSync(path.join(vaultPath, "staging/memory"))
    .filter((file) => file.endsWith(".md"));
  assert.equal(stagingFiles.length, 1);

  const candidate = parseFrontmatter(
    fs.readFileSync(path.join(vaultPath, "staging/memory", stagingFiles[0]), "utf8")
  );
  assert.ok(candidate.data.id);

  result = await runCli(["promote", candidate.data.id], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Promoted/);

  const synthesisFiles = fs
    .readdirSync(path.join(vaultPath, "memory/syntheses"))
    .filter((file) => file.endsWith(".md"));
  assert.equal(synthesisFiles.length, 1);

  result = await runCli(["query", "What", "is", "local-agent-brain?"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /local-first knowledge kernel/i);
  assert.match(result.stdout, /Confidence:/);
  assert.match(result.stdout, /Provenance:/);

  result = await runCli(["decision", "new", "Should V1 stay local-first?"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Created decision record/);

  result = await runCli(["health-check"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Health check passed/);

  fs.rmSync(path.join(vaultPath, ".brain"), { recursive: true, force: true });
  result = await runCli(["compile"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);

  result = await runCli(["query", "What", "stores", "durable", "reviewed", "knowledge?"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /memory/i);
});

test("local-only mode denies cloud and remote fetch capabilities", () => {
  assert.equal(isCapabilityAllowed("local-only", "model.cloud:openai"), false);
  assert.equal(isCapabilityAllowed("local-only", "network.fetch:https"), false);
  assert.equal(isCapabilityAllowed("local-only", "network.fetch:loopback"), true);
  assert.equal(isCapabilityAllowed("local-only", "model.local:ollama"), true);
});

test("doctor validates connector manifests by type", async () => {
  const workspace = makeWorkspace();
  const vaultPath = path.join(workspace, "vault");

  let result = await runCli(["init", "vault", "--profile", "research"], { cwd: workspace });
  assert.equal(result.exitCode, 0);

  fs.writeFileSync(
    path.join(vaultPath, "connectors", "calendar.yaml"),
    [
      "name: calendar",
      "type: snapshot",
      "enabled: true",
      "sync_method: manual",
      "read_scope: calendar",
      "sensitivity: phi",
      "capabilities:",
      "  - sources.append",
      "risk_class: read",
      "approval_policy: explicit"
    ].join("\n"),
    "utf8"
  );

  result = await runCli(["doctor"], { cwd: vaultPath });
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /connectors\/calendar\.yaml: Missing required field: evidence_sink/);
  assert.match(result.stdout, /connectors\/calendar\.yaml: Missing required field: state_sink/);
  assert.match(result.stdout, /connectors\/calendar\.yaml: Missing required field: freshness_ttl/);
});
