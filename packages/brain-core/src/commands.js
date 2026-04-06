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
  buildPromotedWikiPage,
  buildQueryResultPage,
  buildWikiCandidatePage,
  collectLintIssues,
  collectWikiPages
} from "./wiki.js";
import {
  datedPathParts,
  ensureDirectory,
  fileExists,
  isTextFile,
  isUrl,
  nowIso,
  relativePath,
  scoreConfidence,
  slugify,
  uniquePath,
  walkFiles
} from "./utils.js";

const SENSITIVE_NAME_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /(^|[._-])(password|passcode|bank|banking|routing|account|ssn|social-security|seed|wallet|private-key|secret|credential|token)([._-]|$)/i
];

const SENSITIVE_EXTENSIONS = new Set([
  ".env",
  ".key",
  ".kdbx",
  ".p12",
  ".pem",
  ".pfx"
]);

const SENSITIVE_CONTENT_PATTERNS = [
  {
    label: "private key material",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/
  },
  {
    label: "environment or API secrets",
    regex: /(^|\n)\s*(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|GITHUB_TOKEN|DATABASE_URL|SECRET_KEY|SESSION_SECRET|ACCESS_TOKEN)\s*=.+/i
  },
  {
    label: "password or pin entry",
    regex: /(^|\n)\s*(?:password|passcode|pin)\s*[:=]\s*\S+/i
  },
  {
    label: "bank account details",
    regex: /(routing number|account number)/i
  },
  {
    label: "social security number pattern",
    regex: /\b\d{3}-\d{2}-\d{4}\b/
  },
  {
    label: "seed or recovery phrase",
    regex: /(seed phrase|recovery phrase|mnemonic phrase)/i
  }
];

function inspectSensitivePath(filePath) {
  const basename = path.basename(filePath);
  const extension = path.extname(basename).toLowerCase();

  if (SENSITIVE_EXTENSIONS.has(extension)) {
    return `matches sensitive file extension ${extension}`;
  }

  for (const pattern of SENSITIVE_NAME_PATTERNS) {
    if (pattern.test(basename)) {
      return "looks like a secrets or financial file by name";
    }
  }

  return null;
}

function inspectSensitiveText(filePath) {
  if (!isTextFile(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, "utf8").slice(0, 200_000);

  for (const pattern of SENSITIVE_CONTENT_PATTERNS) {
    if (pattern.regex.test(content)) {
      return `contains ${pattern.label}`;
    }
  }

  return null;
}

function collectSensitiveFindings(targetPath) {
  const findings = [];
  const stat = fs.statSync(targetPath);
  const pathsToInspect = stat.isDirectory() ? walkFiles(targetPath) : [targetPath];

  for (const filePath of pathsToInspect) {
    const nameReason = inspectSensitivePath(filePath);

    if (nameReason) {
      findings.push(`${filePath}: ${nameReason}`);
      continue;
    }

    const textReason = inspectSensitiveText(filePath);

    if (textReason) {
      findings.push(`${filePath}: ${textReason}`);
    }
  }

  return findings;
}

function collectSensitiveUrlFindings(target) {
  const findings = [];

  if (/[?&](?:token|key|password|secret)=/i.test(target)) {
    findings.push(`${target}: URL appears to include a credential in the query string`);
  }

  return findings;
}

function formatSensitiveError(findings) {
  const preview = findings.slice(0, 5).map((item) => `- ${item}`).join("\n");
  const suffix = findings.length > 5 ? `\n- ...and ${findings.length - 5} more` : "";

  return [
    "Ingest blocked because the input looks sensitive.",
    "This local brain is not a password manager or a place for bank credentials.",
    "Use a dedicated password manager for secrets, or rerun with --allow-sensitive only if you intentionally want this copied into a separate local vault.",
    "",
    preview + suffix
  ].join("\n");
}

function readVaultContext(cwd, explicitVault) {
  const vaultRoot = resolveVaultRoot(cwd, explicitVault);
  const config = loadConfig(vaultRoot);
  return { vaultRoot, config };
}

function createUrlCapture(url) {
  return `# URL Capture\n\n- url: ${url}\n- captured_at: ${nowIso()}\n- note: This V1 capture stores the URL durably without fetching remote content.\n`;
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

function findExistingWikiCandidateBySource(vaultRoot, sourcePath) {
  const stagingRoot = path.join(vaultRoot, "staging/wiki");

  for (const candidatePath of walkFiles(stagingRoot)) {
    if (!candidatePath.endsWith(".md")) {
      continue;
    }

    const parsed = parseFrontmatter(fs.readFileSync(candidatePath, "utf8"));

    if (parsed.data.source_path === sourcePath && parsed.data.status === "pending") {
      return { candidatePath, data: parsed.data };
    }
  }

  return null;
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

function writeViews(vaultRoot) {
  const counts = {
    sources: walkFiles(path.join(vaultRoot, "sources")).length,
    wiki: walkFiles(path.join(vaultRoot, "wiki")).filter((file) => file.endsWith(".md")).length,
    memory: walkFiles(path.join(vaultRoot, "memory")).filter((file) => file.endsWith(".md")).length,
    decisions: walkFiles(path.join(vaultRoot, "decisions")).filter((file) => file.endsWith(".md")).length,
    stagingWiki: walkFiles(path.join(vaultRoot, "staging/wiki")).filter((file) => file.endsWith(".md")).length
  };
  const wikiPages = collectWikiPages(vaultRoot).slice(0, 20);

  fs.writeFileSync(
    path.join(vaultRoot, "views/index.md"),
    `# Vault Home

- Sources: ${counts.sources}
- Wiki pages: ${counts.wiki}
- Memory files: ${counts.memory}
- Decisions: ${counts.decisions}
- Pending wiki candidates: ${counts.stagingWiki}
- Updated at: ${nowIso()}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(vaultRoot, "views/wiki.md"),
    [
      "# Wiki Index",
      "",
      ...(wikiPages.length > 0
        ? wikiPages.map((page) => `- ${page.title} (${page.path})`)
        : ["- No wiki pages yet. Run `brain compile` and `brain promote` first."])
    ].join("\n"),
    "utf8"
  );
}

function saveQueryResult({ vaultRoot, question, result, searchResults }) {
  const page = buildQueryResultPage({
    vaultRoot,
    question,
    answer: result.answer,
    provenance: result.provenance,
    confidence: result.confidence,
    relatedResults: searchResults
  });
  ensureDirectory(path.dirname(page.targetPath));
  fs.writeFileSync(page.targetPath, page.content, "utf8");
  return relativePath(vaultRoot, page.targetPath);
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

export function ingestCommand({ target, allowSensitive = false, cwd = process.cwd(), vault }) {
  if (!target) {
    throw new Error("ingest requires a file, folder, or URL.");
  }

  const { vaultRoot } = readVaultContext(cwd, vault);
  const [year, month, day] = datedPathParts(new Date());
  const baseDir = path.join(vaultRoot, "sources/manual", year, month, day);
  ensureDirectory(baseDir);
  const written = [];

  if (isUrl(target)) {
    const sensitiveFindings = collectSensitiveUrlFindings(target);

    if (!allowSensitive && sensitiveFindings.length > 0) {
      throw new Error(formatSensitiveError(sensitiveFindings));
    }

    const filename = `${slugify(target, "capture")}.md`;
    const destination = uniquePath(path.join(baseDir, filename));
    fs.writeFileSync(destination, createUrlCapture(target), "utf8");
    written.push(relativePath(vaultRoot, destination));
  } else {
    const sourcePath = path.resolve(cwd, target);

    if (!fileExists(sourcePath)) {
      throw new Error(`Input not found: ${target}`);
    }

    const sensitiveFindings = collectSensitiveFindings(sourcePath);

    if (!allowSensitive && sensitiveFindings.length > 0) {
      throw new Error(formatSensitiveError(sensitiveFindings));
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
    const relativeSourcePath = relativePath(vaultRoot, sourceFile);
    const existing = findExistingWikiCandidateBySource(vaultRoot, relativeSourcePath);
    const candidate = buildWikiCandidatePage({
      vaultRoot,
      sourceFilePath: sourceFile,
      existing
    });
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
    message: `Compile finished with ${created} new and ${updated} updated wiki candidate(s).`
  };
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

  if (parsed.data.kind !== "wiki-page") {
    throw new Error("Only wiki-page candidates are promotable in the current workflow.");
  }

  const page = buildPromotedWikiPage({
    vaultRoot,
    parsedCandidate: parsed
  });
  ensureDirectory(path.dirname(page.targetPath));
  fs.writeFileSync(page.targetPath, page.content, "utf8");

  const updatedCandidate = {
    ...parsed.data,
    status: "promoted",
    promoted_at: nowIso()
  };
  fs.writeFileSync(candidatePath, serializeFrontmatter(updatedCandidate, parsed.body), "utf8");

  writeViews(vaultRoot);
  const indexResult = rebuildIndex(vaultRoot);
  logAction(vaultRoot, {
    actor: "brain",
    command: "promote",
    sources_used: parsed.data.provenance ?? [],
    tool: "brain promote",
    capabilities: ["staging.read", "wiki.write", "logs.append"],
    result: "ok",
    side_effects: [relativePath(vaultRoot, page.targetPath)]
  });

  return {
    vaultRoot,
    candidateId,
    target: relativePath(vaultRoot, page.targetPath),
    indexedDocuments: indexResult.documentCount,
    message: `Promoted ${candidateId} into ${relativePath(vaultRoot, page.targetPath)}.`
  };
}

export function queryCommand({ question, save = false, cwd = process.cwd(), vault }) {
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
      savedPath: null,
      message: "No grounded evidence found."
    };
  }

  const snippets = results
    .slice(0, 3)
    .map((result) => result.snippet.replace(/\[[^\]]+\]/g, (value) => value.slice(1, -1)));
  const answer = snippets.join(" ");
  const provenance = results.map((result) => result.path);
  const confidence = scoreConfidence(results.map((result) => result.kind));
  let savedPath = null;

  if (save) {
    savedPath = saveQueryResult({
      vaultRoot,
      question,
      result: { answer, provenance, confidence },
      searchResults: results
    });
    writeViews(vaultRoot);
    rebuildIndex(vaultRoot);
  }

  logAction(vaultRoot, {
    actor: "brain",
    command: save ? "query --save" : "query",
    sources_used: provenance,
    tool: "brain query",
    capabilities: save ? ["wiki.write", "logs.append"] : ["logs.append"],
    result: "ok",
    side_effects: savedPath ? [savedPath] : []
  });

  return {
    vaultRoot,
    confidence,
    answer,
    provenance,
    savedPath,
    message: savedPath
      ? `Grounded answer generated and saved to ${savedPath}.`
      : "Grounded answer generated from local index."
  };
}

export function lintCommand({ cwd = process.cwd(), vault }) {
  const { vaultRoot } = readVaultContext(cwd, vault);
  const issues = collectLintIssues(vaultRoot);

  logAction(vaultRoot, {
    actor: "brain",
    command: "lint",
    sources_used: [],
    tool: "brain lint",
    capabilities: ["logs.append"],
    result: issues.length > 0 ? "warn" : "ok",
    side_effects: []
  });

  return {
    vaultRoot,
    status: issues.length > 0 ? "warn" : "ok",
    issues,
    message: issues.length > 0 ? `Lint found ${issues.length} issue(s).` : "Lint passed."
  };
}

export function healthCheckCommand({ cwd = process.cwd(), vault }) {
  const { vaultRoot, config } = readVaultContext(cwd, vault);
  const issues = [
    ...collectSchemaIssues(vaultRoot),
    ...collectLintIssues(vaultRoot)
  ];
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
    result: issues.some((issue) => issue.severity === "error") ? "error" : issues.length > 0 ? "warn" : "ok",
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
  writeViews(vaultRoot);
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
