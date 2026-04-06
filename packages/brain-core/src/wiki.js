import fs from "node:fs";
import path from "node:path";

import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.js";
import { createUlid } from "./ulid.js";
import {
  extractEvidenceLines,
  extractSummary,
  extractTitle,
  normalizeQueryTokens,
  nowIso,
  relativePath,
  slugify,
  walkFiles
} from "./utils.js";

const POSITIVE_MARKERS = ["best", "better", "useful", "works", "advantage", "recommended", "strong"];
const NEGATIVE_MARKERS = ["not", "never", "risk", "avoid", "fails", "worse", "weak", "critique", "gap"];

function extractHeadings(content, limit = 4) {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, ""))
    .slice(0, limit);
}

function extractQuotedLines(content, limit = 3) {
  const quotes = content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^["“].+["”]$/.test(line) || /^>/.test(line));

  return quotes.slice(0, limit);
}

function extractActionItems(content, limit = 4) {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^[-*]\s+/.test(line) || /\b(action item|next step|todo|follow up)\b/i.test(line))
    .slice(0, limit);
}

function inferTitleFromPath(filePath) {
  const parsed = path.parse(filePath);
  return parsed.name.replace(/[-_]+/g, " ");
}

export function classifySourceType(filePath, content) {
  const lower = content.toLowerCase();
  const ext = path.extname(filePath).toLowerCase();
  const lines = content.split(/\r?\n/);
  const wordCount = normalizeQueryTokens(content).length;

  if (
    ext === ".json" ||
    ext === ".jsonl" ||
    /package\.json|tsconfig\.json|pnpm-workspace\.yaml|dockerfile|makefile/i.test(filePath) ||
    /"dependencies"\s*:|"scripts"\s*:|import\s.+from\s+|export\s+(const|function|class)\s+/i.test(content)
  ) {
    return "code-repo";
  }

  if (
    /\b(transcript|speaker \d+|action items?|meeting notes?)\b/i.test(lower) ||
    /^\s*\d{1,2}:\d{2}/m.test(content) ||
    /^\s*[A-Z][A-Za-z0-9 _-]{1,24}:\s+/m.test(content)
  ) {
    return "transcript";
  }

  if (
    /\bthread\b/i.test(lower) ||
    /https?:\/\/(x|twitter)\.com\//i.test(content) ||
    lines.filter((line) => line.trim().length > 0 && line.trim().length < 140).length > 8
  ) {
    return "thread";
  }

  if (
    /\b(whitepaper|executive summary|table of contents|appendix|methodology)\b/i.test(lower) ||
    wordCount > 1800
  ) {
    return "report";
  }

  return "article";
}

export function defaultWikiTypeForSource(sourceType) {
  switch (sourceType) {
    case "thread":
      return "concept";
    case "code-repo":
      return "entity";
    default:
      return "summary";
  }
}

export function collectWikiPages(vaultRoot) {
  const root = path.join(vaultRoot, "wiki");

  return walkFiles(root)
    .filter((filePath) => filePath.endsWith(".md"))
    .map((filePath) => {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parseFrontmatter(raw);
      return {
        path: relativePath(vaultRoot, filePath),
        absolutePath: filePath,
        basename: path.basename(filePath, ".md"),
        title: parsed.data.title ?? extractTitle(parsed.body, inferTitleFromPath(filePath)),
        data: parsed.data,
        body: parsed.body
      };
    });
}

function tokenOverlap(a, b) {
  const aTokens = new Set(normalizeQueryTokens(a));
  const bTokens = new Set(normalizeQueryTokens(b));
  let count = 0;

  for (const token of aTokens) {
    if (bTokens.has(token)) {
      count += 1;
    }
  }

  return count;
}

export function findRelatedWikiLinks(vaultRoot, title, excludeBasename, limit = 4) {
  const pages = collectWikiPages(vaultRoot)
    .filter((page) => page.basename !== excludeBasename)
    .map((page) => ({
      basename: page.basename,
      title: page.title,
      overlap: tokenOverlap(title, page.title)
    }))
    .filter((page) => page.overlap >= 2)
    .sort((left, right) => right.overlap - left.overlap)
    .slice(0, limit);

  return pages.map((page) => `- [[${page.basename}]]`);
}

function buildCounterArguments(sourceType, evidenceLines) {
  const shared = [
    "- This page may overfit to the available sources and miss strong opposing evidence.",
    "- Some claims may be time-sensitive or depend on context not captured in the current vault."
  ];

  switch (sourceType) {
    case "report":
      return [
        "- Long reports often hide important caveats in footnotes or appendices that may not be captured in a short synthesis.",
        "- A single report can look authoritative while still reflecting the author's assumptions or incentives.",
        ...shared
      ];
    case "transcript":
      return [
        "- Spoken discussions may contain ambiguity, interruptions, or off-the-cuff statements that should not be treated as final decisions.",
        "- Action items can be incomplete if the transcript misses context from before or after the captured exchange.",
        ...shared
      ];
    case "thread":
      return [
        "- Threads optimize for compression and persuasion, so nuance and counterexamples are often missing.",
        "- The strongest critique may live outside the thread entirely, especially in longer reports or direct source material.",
        ...shared
      ];
    case "code-repo":
      return [
        "- Repository structure can change quickly, so architecture summaries may go stale without a refresh.",
        "- README and config files can understate hidden dependencies, conventions, or operational complexity.",
        ...shared
      ];
    default:
      return [
        "- Articles and blog posts often reflect one authorial frame and may omit strong opposing evidence.",
        evidenceLines.length <= 1
          ? "- The source provided limited direct evidence, so confidence should stay conservative."
          : "- Multiple claims are summarized here, but not all supporting evidence may be equally strong.",
        ...shared
      ];
  }
}

function buildSection(sourceType, evidenceLines, content) {
  switch (sourceType) {
    case "report": {
      const headings = extractHeadings(content, 5);
      return [
        "## Key Sections",
        ...(headings.length > 0 ? headings.map((line) => `- ${line}`) : evidenceLines.map((line) => `- ${line}`))
      ];
    }
    case "transcript": {
      const actionItems = extractActionItems(content, 4);
      const quotes = extractQuotedLines(content, 2);
      return [
        "## Decisions and Action Items",
        ...(actionItems.length > 0 ? actionItems.map((line) => line.startsWith("- ") ? line : `- ${line}`) : evidenceLines.map((line) => `- ${line}`)),
        "",
        "## Notable Quotes",
        ...(quotes.length > 0 ? quotes.map((line) => `- ${line.replace(/^>\s*/, "")}`) : ["- No explicit quoted lines were found in the source."])
      ];
    }
    case "thread":
      return [
        "## Core Insight",
        ...evidenceLines.map((line) => `- ${line}`),
        "",
        "## Context",
        "- Treat this as a compressed insight, not a full argument."
      ];
    case "code-repo":
      return [
        "## Architecture and Patterns",
        ...evidenceLines.map((line) => `- ${line}`),
        "",
        "## Dependencies and Operational Notes",
        "- Review the repository files directly before treating this page as complete."
      ];
    default:
      return [
        "## Key Claims",
        ...evidenceLines.map((line) => `- ${line}`)
      ];
  }
}

function buildWikiBody({ title, tldr, sourceType, content, sources, relatedLinks }) {
  const evidenceLines = extractEvidenceLines(content, 4);
  const counterArguments = buildCounterArguments(sourceType, evidenceLines);
  const section = buildSection(sourceType, evidenceLines, content);

  return [
    `# ${title}`,
    "",
    `TLDR: ${tldr}`,
    "",
    "## Source Classification",
    `- Type: ${sourceType}`,
    "",
    ...section,
    "",
    "## Related Pages",
    ...(relatedLinks.length > 0 ? relatedLinks : ["- None yet."]),
    "",
    "## Counter-Arguments and Data Gaps",
    ...counterArguments,
    "",
    "## Sources",
    ...sources.map((source) => `- ${source}`)
  ].join("\n");
}

export function buildWikiCandidatePage({ vaultRoot, sourceFilePath, existing }) {
  const content = fs.readFileSync(sourceFilePath, "utf8");
  const relativeSourcePath = relativePath(vaultRoot, sourceFilePath);
  const title = extractTitle(content, inferTitleFromPath(sourceFilePath));
  const sourceType = classifySourceType(sourceFilePath, content);
  const wikiType = defaultWikiTypeForSource(sourceType);
  const tldr = extractSummary(content, 180);
  const id = existing?.data.id ?? createUlid();
  const slug = slugify(title, "wiki-page");
  const basename = `${id}-${slug}`;
  const candidatePath = existing?.candidatePath ?? path.join(vaultRoot, "staging/wiki", `${basename}.md`);
  const relatedLinks = findRelatedWikiLinks(vaultRoot, title, basename);

  const data = {
    id,
    kind: "wiki-page",
    proposed_target: "wiki",
    status: "pending",
    created_at: existing?.data.created_at ?? nowIso(),
    generated_by: "brain compile",
    provenance: [relativeSourcePath],
    confidence: sourceType === "report" || sourceType === "code-repo" ? "medium" : "low",
    source_path: relativeSourcePath,
    source_hash: fs.existsSync(sourceFilePath) ? fs.statSync(sourceFilePath).mtime.toISOString() : nowIso(),
    source_type: sourceType,
    wiki_type: wikiType,
    title
  };

  return {
    id,
    candidatePath,
    content: serializeFrontmatter(
      data,
      buildWikiBody({
        title,
        tldr,
        sourceType,
        content,
        sources: [relativeSourcePath],
        relatedLinks
      })
    )
  };
}

export function buildPromotedWikiPage({ vaultRoot, parsedCandidate, existingPath }) {
  const title = parsedCandidate.data.title ?? extractTitle(parsedCandidate.body, parsedCandidate.data.id);
  const slug = slugify(title, "wiki-page");
  const targetPath = existingPath ?? path.join(vaultRoot, "wiki", `${parsedCandidate.data.id}-${slug}.md`);
  const date = new Date().toISOString().slice(0, 10);
  const bodyLines = parsedCandidate.body.split(/\r?\n/);
  const tldrLine = bodyLines.find((line) => line.startsWith("TLDR: ")) ?? `TLDR: ${extractSummary(parsedCandidate.body, 180)}`;
  const rest = bodyLines.filter((line, index) => !(index < 3 && (line.startsWith("# ") || line.startsWith("TLDR: ") || line.trim() === "")));
  const body = [`# ${title}`, "", tldrLine, "", ...rest].join("\n");

  return {
    targetPath,
    content: serializeFrontmatter(
      {
        title,
        type: parsedCandidate.data.wiki_type ?? "summary",
        sources: parsedCandidate.data.provenance ?? [],
        created: parsedCandidate.data.created_at?.slice(0, 10) ?? date,
        updated: date,
        tags: [parsedCandidate.data.source_type ?? "source-derived"]
      },
      body
    )
  };
}

export function buildQueryResultPage({ vaultRoot, question, answer, provenance, confidence, relatedResults }) {
  const title = question.trim().replace(/[?]+$/, "") || "Query Result";
  const id = createUlid();
  const slug = slugify(title, "query-result");
  const targetPath = path.join(vaultRoot, "wiki/query-results", `${id}-${slug}.md`);
  const relatedLinks = relatedResults
    .filter((result) => result.kind === "wiki")
    .map((result) => `- [[${path.basename(result.path, ".md")}]]`)
    .slice(0, 5);
  const body = [
    `# ${title}`,
    "",
    `TLDR: ${answer}`,
    "",
    "## Answer",
    answer,
    "",
    "## Related Pages",
    ...(relatedLinks.length > 0 ? relatedLinks : ["- None yet."]),
    "",
    "## Counter-Arguments and Data Gaps",
    "- This query result reflects the currently indexed wiki and source material, so missing ingests can change the answer.",
    confidence === "low"
      ? "- Confidence is low because the answer relies on limited grounded evidence."
      : "- Even grounded answers can omit counterexamples that have not yet been promoted into the wiki.",
    "",
    "## Sources",
    ...(provenance.length > 0 ? provenance.map((item) => `- ${item}`) : ["- No sources found."])
  ].join("\n");

  return {
    targetPath,
    content: serializeFrontmatter(
      {
        title,
        type: "query-result",
        sources: provenance,
        created: new Date().toISOString().slice(0, 10),
        updated: new Date().toISOString().slice(0, 10),
        tags: ["query-result"]
      },
      body
    )
  };
}

function parseWikiLinks(body) {
  return [...body.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1]);
}

function pagePolarity(body, title) {
  const text = `${title} ${body}`.toLowerCase();
  let score = 0;

  for (const marker of POSITIVE_MARKERS) {
    if (text.includes(marker)) {
      score += 1;
    }
  }

  for (const marker of NEGATIVE_MARKERS) {
    if (text.includes(marker)) {
      score -= 1;
    }
  }

  return score;
}

export function collectLintIssues(vaultRoot) {
  const pages = collectWikiPages(vaultRoot);
  const issues = [];
  const inboundCounts = new Map(pages.map((page) => [page.basename, 0]));
  const basenameSet = new Set(pages.map((page) => page.basename));

  for (const page of pages) {
    for (const link of parseWikiLinks(page.body)) {
      if (basenameSet.has(link)) {
        inboundCounts.set(link, (inboundCounts.get(link) ?? 0) + 1);
      }
    }
  }

  for (const page of pages) {
    if (page.data.type !== "query-result" && (inboundCounts.get(page.basename) ?? 0) === 0) {
      issues.push({
        severity: "warning",
        path: page.path,
        message: "Wiki page is orphaned and has no inbound wiki links."
      });
    }

    if (page.data.updated && Array.isArray(page.data.sources)) {
      for (const source of page.data.sources) {
        const sourcePath = path.join(vaultRoot, source);

        if (
          fs.existsSync(sourcePath) &&
          fs.statSync(sourcePath).mtime.toISOString().slice(0, 10) > page.data.updated
        ) {
          issues.push({
            severity: "warning",
            path: page.path,
            message: `Source ${source} is newer than the wiki page and may have made it stale.`
          });
          break;
        }
      }
    }

    if (!Array.isArray(page.data.sources) || page.data.sources.length === 0) {
      issues.push({
        severity: "warning",
        path: page.path,
        message: "Wiki page has no recorded sources."
      });
    }
  }

  for (let left = 0; left < pages.length; left += 1) {
    for (let right = left + 1; right < pages.length; right += 1) {
      const a = pages[left];
      const b = pages[right];

      if (tokenOverlap(a.title, b.title) < 1) {
        continue;
      }

      const aPolarity = pagePolarity(a.body, a.title);
      const bPolarity = pagePolarity(b.body, b.title);

      if ((aPolarity > 0 && bPolarity < 0) || (aPolarity < 0 && bPolarity > 0)) {
        issues.push({
          severity: "warning",
          path: a.path,
          message: `Potential contradiction with ${b.path}. Review the two pages together.`
        });
      }
    }
  }

  return issues;
}
