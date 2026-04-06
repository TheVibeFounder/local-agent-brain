import fs from "node:fs";
import path from "node:path";

import { createUlid } from "./ulid.js";
import { loadConfig } from "./config.js";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { rebuildIndex, searchIndex } from "./indexer.js";
import { logAction } from "./logs.js";
import { resolveVaultRoot } from "./paths.js";
import { collectSchemaIssues } from "./schemas.js";
import { initializeVault } from "./vault.js";
import {
  datedPathParts,
  ensureDirectory,
  extractEvidenceLines,
  extractSummary,
  extractTitle,
  fileExists,
  hashText,
  isTextFile,
  isUrl,
  nowIso,
  relativePath,
  scoreConfidence,
  slugify,
  uniquePath,
  walkFiles
} from "./utils.js";

function readVaultContext(cwd, explicitVault) {
  const vaultRoot = resolveVaultRoot(cwd, explicitVault);
  const config = loadConfig(vaultRoot);
  return { vaultRoot, config };
}

function createUrlCapture(url) {
  return `# URL Capture\n\n- url: ${url}\n- captured_at: ${nowIso()}\n- note: V1 stores the URL reference durably without remote fetching.\n`;
}

function gatherCompilableFiles(vaultRoot, scope) {
  const roots = scope ? [scope] : ["sources", "guides"];
  const output = [];

  for (const root of roots) {
    const absolute = path.join(vaultRoot, root);

    for (const filePath of walkFiles(absolute)) {
      if (isTextFile(filePath)) {
        output.push(filePath);
      }
    }
  }

  return output;
}

function findExistingCandidateBySource(vaultRoot, sourcePath) {
  const stagingRoot = path.join(vaultRoot, "staging");

  for (const candidatePath of walkFiles(stagingRoot)) {
    if (!candidatePath.endsWith(".md")) {
      continue;
    }

    const parsed = parseFrontmatter(fs.readFileSync(candidatePath, "utf8"));

    if (parsed.data.source_path === sourcePath && parsed.data.status === "pending") {
      return { candidatePath, candidate: parsed };
    }
  }

  return null;
}

function buildCandidateContent(vaultRoot, sourceFilePath) {
  const content = fs.readFileSync(sourceFilePath, "utf8");
  const relativeSourcePath = relativePath(vaultRoot, sourceFilePath);
  const title = extractTitle(content, path.basename(sourceFilePath));
  const summary = extractSummary(content);
  const evidence = extractEvidenceLines(content, 3);
  const sourceHash = hashText(content);
  const existing = findExistingCandidateBySource(vaultRoot, relativeSourcePath);
  const id = existing?.candidate.data.id ?? createUlid();
  const slug = slugify(title, "candidate");
  const candidatePath = existing?.candidatePath
    ?? path.join(vaultRoot, "staging/memory", `${id}-${slug}.md`);

  const body = [
    `# ${title}`,
    "",
    summary,
    "",
    "## Evidence",
    ...evidence.map((line) => `- ${line}`),
    "",
    "## Open Questions",
    "- What should be promoted from this source?"
  ].join("\n");

  const frontmatter = {
    id,
    kind: "synthesis",
    proposed_target: "memory/syntheses",
    status: "pending",
    created_at: existing?.candidate.data.created_at ?? nowIso(),
    generated_by: "brain compile",
    provenance: [relativeSourcePath],
    confidence: evidence.length >= 3 ? "medium" : "low",
    source_path: relativeSourcePath,
    source_hash: sourceHash
  };

  return { candidatePath, id, content: serializeFrontmatter(frontmatter, body) };
}

function writeViews(vaultRoot) {
  const sections = {
    sources: walkFiles(path.join(vaultRoot, "sources")).length,
    memory: walkFiles(path.join(vaultRoot, "memory")).filter((file) => file.endsWith(".md")).length,
    decisions: walkFiles(path.join(vaultRoot, "decisions")).filter((file) => file.endsWith(".md")).length,
    staging: walkFiles(path.join(vaultRoot, "staging")).filter((file) => file.endsWith(".md")).length
  };

  const content = `# Vault Status

- Sources: ${sections.sources}
- Memory files: ${sections.memory}
- Decisions: ${sections.decisions}
- Pending staging files: ${sections.staging}
- Updated at: ${nowIso()}
`;

  fs.writeFileSync(path.join(vaultRoot, "views/index.md"), content, "utf8");
}

export function initCommand({ targetPath, profile = "research", cwd = process.cwd() }) {
  const result = initializeVault(path.resolve(cwd, targetPath), { profile });
  return {
    ...result,
    message: `Initialized ${profile} vault at ${result.vaultRoot}`
  };
}

export function doctorCommand({ cwd = process.cwd(), vault }) {
  const { vaultRoot } = readVaultContext(cwd, vault);
  const issues = collectSchemaIssues(vaultRoot);
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");

  return {
    vaultRoot,
    status: errors.length > 0 ? "error" : warnings.length > 0 ? "warn" : "ok",
    issues,
    message: `Doctor completed with ${errors.length} errors and ${warnings.length} warnings.`
  };
}

export function ingestCommand({ target, cwd = process.cwd(), vault }) {
  if (!target) {
    throw new Error("ingest requires a file, folder, or URL.");
  }

  const { vaultRoot } = readVaultContext(cwd, vault);
  const [year, month, day] = datedPathParts(new Date());
  const baseDir = path.join(vaultRoot, "sources/manual", year, month, day);
  ensureDirectory(baseDir);
  const written = [];

  if (isUrl(target)) {
    const filename = `${slugify(target, "capture")}.md`;
    const destination = uniquePath(path.join(baseDir, filename));
    fs.writeFileSync(destination, createUrlCapture(target), "utf8");
    written.push(relativePath(vaultRoot, destination));
  } else {
    const sourcePath = path.resolve(cwd, target);

    if (!fileExists(sourcePath)) {
      throw new Error(`Input not found: ${target}`);
    }

    const stat = fs.statSync(sourcePath);
    const destination = uniquePath(path.join(baseDir, path.basename(sourcePath)));

    if (stat.isDirectory()) {
      fs.cpSync(sourcePath, destination, { recursive: true });
      written.push(relativePath(vaultRoot, destination));
    } else {
      fs.copyFileSync(sourcePath, destination);
      written.push(relativePath(vaultRoot, destination));
    }
  }

  const indexResult = rebuildIndex(vaultRoot);
  logAction(vaultRoot, {
    actor: "brain",
    command: "ingest",
    sources_used: [],
    tool: "brain ingest",
    capabilities: ["sources.append", "logs.append"],
    result: "ok",
    side_effects: written
  });

  return {
    vaultRoot,
    written,
    indexPath: indexResult.dbPath,
    message: `Ingested ${written.length} item(s).`
  };
}

export function compileCommand({ scope, cwd = process.cwd(), vault }) {
  const { vaultRoot } = readVaultContext(cwd, vault);
  const sourceFiles = gatherCompilableFiles(vaultRoot, scope);
  let created = 0;
  let updated = 0;
  const candidateIds = [];

  for (const sourceFile of sourceFiles) {
    const candidate = buildCandidateContent(vaultRoot, sourceFile);
    const existed = fileExists(candidate.candidatePath);
    fs.writeFileSync(candidate.candidatePath, candidate.content, "utf8");
    candidateIds.push(candidate.id);

    if (existed) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  writeViews(vaultRoot);
  const indexResult = rebuildIndex(vaultRoot);
  logAction(vaultRoot, {
    actor: "brain",
    command: "compile",
    sources_used: sourceFiles.map((file) => relativePath(vaultRoot, file)),
    tool: "brain compile",
    capabilities: ["sources.read", "staging.write", "views.write", "logs.append"],
    result: "ok",
    side_effects: candidateIds
  });

  return {
    vaultRoot,
    created,
    updated,
    indexedDocuments: indexResult.documentCount,
    candidateIds,
    message: `Compile finished with ${created} new and ${updated} updated candidate(s).`
  };
}

function findCandidateById(vaultRoot, candidateId) {
  for (const candidatePath of walkFiles(path.join(vaultRoot, "staging"))) {
    if (!candidatePath.endsWith(".md")) {
      continue;
    }

    const parsed = parseFrontmatter(fs.readFileSync(candidatePath, "utf8"));

    if (parsed.data.id === candidateId) {
      return { candidatePath, parsed };
    }
  }

  return null;
}

export function promoteCommand({ candidateId, cwd = process.cwd(), vault }) {
  if (!candidateId) {
    throw new Error("promote requires a candidate id.");
  }

  const { vaultRoot } = readVaultContext(cwd, vault);
  const located = findCandidateById(vaultRoot, candidateId);

  if (!located) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }

  const { candidatePath, parsed } = located;
  const title = extractTitle(parsed.body, candidateId);
  const slug = slugify(title, "synthesis");
  const targetRelative = `${parsed.data.proposed_target}/${candidateId}-${slug}.md`;
  const targetPath = path.join(vaultRoot, targetRelative);
  ensureDirectory(path.dirname(targetPath));

  const frontmatter = {
    id: candidateId,
    type: "synthesis",
    status: "promoted",
    confidence: parsed.data.confidence,
    sources: parsed.data.provenance ?? [],
    updated_at: nowIso()
  };

  const body = [
    `# ${title}`,
    "",
    extractSummary(parsed.body, 400),
    "",
    "## Open Questions",
    "- Review and refine this synthesis as new evidence arrives."
  ].join("\n");

  fs.writeFileSync(targetPath, serializeFrontmatter(frontmatter, body), "utf8");
  const updatedCandidate = {
    ...parsed.data,
    status: "promoted",
    promoted_at: nowIso()
  };
  fs.writeFileSync(candidatePath, serializeFrontmatter(updatedCandidate, parsed.body), "utf8");

  const indexResult = rebuildIndex(vaultRoot);
  logAction(vaultRoot, {
    actor: "brain",
    command: "promote",
    sources_used: parsed.data.provenance ?? [],
    tool: "brain promote",
    capabilities: ["staging.read", "memory.write", "logs.append"],
    result: "ok",
    side_effects: [relativePath(vaultRoot, targetPath)]
  });

  return {
    vaultRoot,
    candidateId,
    target: targetRelative,
    indexedDocuments: indexResult.documentCount,
    message: `Promoted ${candidateId} into ${targetRelative}.`
  };
}

export function queryCommand({ question, cwd = process.cwd(), vault }) {
  if (!question) {
    throw new Error("query requires a question.");
  }

  const { vaultRoot } = readVaultContext(cwd, vault);
  const results = searchIndex(vaultRoot, question, 5);

  if (results.length === 0) {
    return {
      vaultRoot,
      confidence: "low",
      answer: "I could not find grounded evidence for that question in the local vault.",
      provenance: [],
      message: "No grounded evidence found."
    };
  }

  const snippets = results.slice(0, 3).map((result) => result.snippet.replace(/\[[^\]]+\]/g, (value) => value.slice(1, -1)));
  const answer = snippets.join(" ");
  const provenance = results.map((result) => result.path);
  const confidence = scoreConfidence(results.map((result) => result.kind));

  return {
    vaultRoot,
    confidence,
    answer,
    provenance,
    message: "Grounded answer generated from local index."
  };
}

export function healthCheckCommand({ cwd = process.cwd(), vault }) {
  const { vaultRoot, config } = readVaultContext(cwd, vault);
  const issues = collectSchemaIssues(vaultRoot);
  const indexPath = path.join(vaultRoot, config.index_path);

  if (!fileExists(indexPath)) {
    issues.push({
      severity: "warning",
      path: ".brain/index.db",
      message: "Index is missing. Run brain compile to rebuild it."
    });
  }

  logAction(vaultRoot, {
    actor: "brain",
    command: "health-check",
    sources_used: [],
    tool: "brain health-check",
    capabilities: ["logs.append"],
    result: issues.some((issue) => issue.severity === "error") ? "error" : "ok",
    side_effects: []
  });

  return {
    vaultRoot,
    status: issues.some((issue) => issue.severity === "error") ? "error" : issues.length > 0 ? "warn" : "ok",
    issues,
    message: issues.length > 0 ? `Health check found ${issues.length} issue(s).` : "Health check passed."
  };
}

export function decisionNewCommand({ question = "New decision", cwd = process.cwd(), vault }) {
  const { vaultRoot } = readVaultContext(cwd, vault);
  const id = createUlid();
  const slug = slugify(question, "decision");
  const date = new Date().toISOString().slice(0, 10);
  const filePath = uniquePath(path.join(vaultRoot, "decisions", `${date}-${slug}.md`));
  const content = serializeFrontmatter(
    {
      id,
      date,
      owner: "user",
      status: "proposed",
      evidence: [],
      related: []
    },
    `# ${question}

## Question
${question}

## Options
- Option A
- Option B

## Choice
Pending.

## Rejected
- None yet.

## Rationale
Pending review.

## What would change this
- New evidence.
`
  );

  fs.writeFileSync(filePath, content, "utf8");
  const indexResult = rebuildIndex(vaultRoot);
  logAction(vaultRoot, {
    actor: "brain",
    command: "decision new",
    sources_used: [],
    tool: "brain decision new",
    capabilities: ["decisions.write", "logs.append"],
    result: "ok",
    side_effects: [relativePath(vaultRoot, filePath)]
  });

  return {
    vaultRoot,
    path: relativePath(vaultRoot, filePath),
    indexedDocuments: indexResult.documentCount,
    message: `Created decision record at ${relativePath(vaultRoot, filePath)}.`
  };
}
