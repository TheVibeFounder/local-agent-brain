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

test("wiki-first flow initializes, stages pages, promotes them, saves query results, and rebuilds index", async () => {
  const workspace = makeWorkspace();
  const vaultName = "demo-vault";
  const vaultPath = path.join(workspace, vaultName);

  let result = await runCli(["init", vaultName, "--profile", "research"], { cwd: workspace });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Initialized research vault/);
  assert.ok(fs.existsSync(path.join(vaultPath, "wiki")));
  assert.ok(fs.existsSync(path.join(vaultPath, "staging/wiki")));

  result = await runCli(["doctor"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Doctor completed with 0 errors and 0 warnings/);

  result = await runCli(["ingest", fixturePath], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Ingested 1 item/);

  result = await runCli(["compile"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /wiki candidate/);

  const stagedFiles = fs
    .readdirSync(path.join(vaultPath, "staging/wiki"))
    .filter((file) => file.endsWith(".md"));
  assert.equal(stagedFiles.length, 1);

  const staged = parseFrontmatter(
    fs.readFileSync(path.join(vaultPath, "staging/wiki", stagedFiles[0]), "utf8")
  );
  assert.equal(staged.data.kind, "wiki-page");
  assert.ok(staged.body.includes("TLDR: "));
  assert.ok(staged.body.includes("## Counter-Arguments and Data Gaps"));

  result = await runCli(["promote", staged.data.id], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Promoted/);
  assert.match(result.stdout, /wiki\//);

  const wikiRootFiles = fs
    .readdirSync(path.join(vaultPath, "wiki"))
    .filter((file) => file.endsWith(".md"));
  assert.equal(wikiRootFiles.length, 1);

  const wikiPage = parseFrontmatter(
    fs.readFileSync(path.join(vaultPath, "wiki", wikiRootFiles[0]), "utf8")
  );
  assert.equal(wikiPage.data.type, "summary");
  assert.ok(wikiPage.body.includes("TLDR: "));
  assert.ok(wikiPage.body.includes("## Counter-Arguments and Data Gaps"));

  result = await runCli(["query", "What", "is", "local-agent-brain?"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /local-first knowledge kernel/i);
  assert.match(result.stdout, /Confidence:/);
  assert.match(result.stdout, /Provenance:/);

  result = await runCli(["query", "What", "is", "local-agent-brain?", "--save"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Saved:/);

  const queryResultFiles = fs
    .readdirSync(path.join(vaultPath, "wiki/query-results"))
    .filter((file) => file.endsWith(".md"));
  assert.equal(queryResultFiles.length, 1);

  const queryResultPage = parseFrontmatter(
    fs.readFileSync(path.join(vaultPath, "wiki/query-results", queryResultFiles[0]), "utf8")
  );
  assert.equal(queryResultPage.data.type, "query-result");
  assert.ok(queryResultPage.body.includes("## Related Pages"));

  result = await runCli(["decision", "new", "Should the wiki stay local-first?"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Created decision record/);

  result = await runCli(["lint"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Lint passed/);

  result = await runCli(["health-check"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Health check passed/);

  fs.rmSync(path.join(vaultPath, ".brain"), { recursive: true, force: true });
  result = await runCli(["compile"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);

  result = await runCli(["query", "What", "stores", "durable", "reviewed", "knowledge?"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /wiki|memory/i);
});

test("local-only mode denies cloud and remote fetch capabilities", () => {
  assert.equal(isCapabilityAllowed("local-only", "model.cloud:openai"), false);
  assert.equal(isCapabilityAllowed("local-only", "network.fetch:https"), false);
  assert.equal(isCapabilityAllowed("local-only", "network.fetch:loopback"), true);
  assert.equal(isCapabilityAllowed("local-only", "model.local:ollama"), true);
});

test("ingest blocks obviously sensitive files unless explicitly allowed", async () => {
  const workspace = makeWorkspace();
  const vaultPath = path.join(workspace, "vault");
  const sensitivePath = path.join(workspace, "bank-passwords.txt");

  let result = await runCli(["init", "vault", "--profile", "research"], { cwd: workspace });
  assert.equal(result.exitCode, 0);

  fs.writeFileSync(
    sensitivePath,
    [
      "password: hunter2",
      "routing number: 021000021",
      "account number: 123456789"
    ].join("\n"),
    "utf8"
  );

  result = await runCli(["ingest", sensitivePath], { cwd: vaultPath });
  assert.equal(result.exitCode, 1);
  assert.match(result.stderr, /Ingest blocked because the input looks sensitive/);
  assert.match(result.stderr, /--allow-sensitive/);

  result = await runCli(["ingest", sensitivePath, "--allow-sensitive"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Ingested 1 item/);
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

test("lint detects contradiction, orphan wiki pages, and stale pages", async () => {
  const workspace = makeWorkspace();
  const vaultPath = path.join(workspace, "vault");

  let result = await runCli(["init", "vault", "--profile", "research"], { cwd: workspace });
  assert.equal(result.exitCode, 0);

  const sourcePath = path.join(vaultPath, "sources", "manual", "topic.md");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "# Topic\n\nFresh source material.\n", "utf8");

  fs.writeFileSync(
    path.join(vaultPath, "wiki", "topic-works.md"),
    `---
title: Topic works
type: concept
sources:
  - sources/manual/topic.md
created: 2000-01-01
updated: 2000-01-01
tags:
  - topic
---
# Topic works

TLDR: Topic works well.

## Key Claims
- This is the best way to handle the topic.

## Related Pages
- None yet.

## Counter-Arguments and Data Gaps
- Evidence is limited.

## Sources
- sources/manual/topic.md
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(vaultPath, "wiki", "topic-fails.md"),
    `---
title: Topic fails
type: concept
sources:
  - sources/manual/topic.md
created: 2000-01-01
updated: 2000-01-01
tags:
  - topic
---
# Topic fails

TLDR: Topic does not work well.

## Key Claims
- This is not a good way to handle the topic.

## Related Pages
- None yet.

## Counter-Arguments and Data Gaps
- Evidence is limited.

## Sources
- sources/manual/topic.md
`,
    "utf8"
  );

  result = await runCli(["lint"], { cwd: vaultPath });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /Potential contradiction/);
  assert.match(result.stdout, /orphaned/);
  assert.match(result.stdout, /may have made it stale/);
});
