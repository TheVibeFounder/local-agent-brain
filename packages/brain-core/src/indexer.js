import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { loadConfig } from "./config.js";
import { parseFrontmatter } from "./frontmatter.js";
import {
  ensureDirectory,
  extractTitle,
  normalizeQueryTokens,
  readTextIfSupported,
  relativePath,
  stripFrontmatter,
  walkFiles
} from "./utils.js";

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runSqlite(dbPath, sql, json = false) {
  const args = json ? ["-json", dbPath, sql] : [dbPath];
  const options = json ? { encoding: "utf8" } : { encoding: "utf8", input: sql };
  const result = spawnSync("sqlite3", args, options);

  if (result.status !== 0) {
    throw new Error(result.stderr || "sqlite3 command failed");
  }

  return result.stdout;
}

function parseDocument(filePath, vaultRoot) {
  const relative = relativePath(vaultRoot, filePath);
  const text = readTextIfSupported(filePath);

  if (text === null) {
    return null;
  }

  const parts = relative.split("/");
  const kind = parts[0] === "memory"
    ? "memory"
    : parts[0] === "wiki"
      ? "wiki"
    : parts[0] === "decisions"
      ? "decision"
      : parts[0] === "guides"
        ? "guide"
        : parts[0] === "state"
          ? "state"
          : "source";

  if (filePath.endsWith(".json")) {
    return {
      path: relative,
      kind,
      title: extractTitle(relative, relative),
      body: text,
      updated_at: fs.statSync(filePath).mtime.toISOString(),
      source_path: relative
    };
  }

  const { data, body } = parseFrontmatter(text);
  const title = extractTitle(body, path.basename(filePath, path.extname(filePath)));
  return {
    path: relative,
    kind,
    title,
    body: stripFrontmatter(text),
    updated_at: data.updated_at ?? fs.statSync(filePath).mtime.toISOString(),
    source_path: relative
  };
}

function collectDocuments(vaultRoot) {
  const roots = ["sources", "guides", "wiki", "memory", "decisions", "state"];
  const documents = [];

  for (const root of roots) {
    const targetRoot = path.join(vaultRoot, root);

    for (const filePath of walkFiles(targetRoot)) {
      const parsed = parseDocument(filePath, vaultRoot);

      if (parsed) {
        documents.push(parsed);
      }
    }
  }

  return documents;
}

export function ensureIndex(vaultRoot) {
  const config = loadConfig(vaultRoot);
  const dbPath = path.join(vaultRoot, config.index_path);
  ensureDirectory(path.dirname(dbPath));

  runSqlite(dbPath, `
    CREATE VIRTUAL TABLE IF NOT EXISTS documents USING fts5(
      path UNINDEXED,
      kind UNINDEXED,
      title,
      body,
      updated_at UNINDEXED,
      source_path UNINDEXED
    );
  `);

  return dbPath;
}

export function rebuildIndex(vaultRoot) {
  const dbPath = ensureIndex(vaultRoot);
  const documents = collectDocuments(vaultRoot);
  const statements = ["BEGIN;", "DELETE FROM documents;"];

  for (const document of documents) {
    statements.push(`
      INSERT INTO documents(path, kind, title, body, updated_at, source_path)
      VALUES (
        ${sqlString(document.path)},
        ${sqlString(document.kind)},
        ${sqlString(document.title)},
        ${sqlString(document.body)},
        ${sqlString(document.updated_at)},
        ${sqlString(document.source_path)}
      );
    `);
  }

  statements.push("COMMIT;");
  runSqlite(dbPath, statements.join("\n"));

  return { dbPath, documentCount: documents.length };
}

export function searchIndex(vaultRoot, question, limit = 5) {
  const config = loadConfig(vaultRoot);
  const dbPath = path.join(vaultRoot, config.index_path);

  if (!fs.existsSync(dbPath)) {
    rebuildIndex(vaultRoot);
  }

  const tokens = normalizeQueryTokens(question);

  if (tokens.length === 0) {
    return [];
  }

  const matchExpression = tokens.map((token) => `${token}*`).join(" OR ");
  const sql = `
    SELECT
      path,
      kind,
      title,
      snippet(documents, 3, '[', ']', ' … ', 16) AS snippet
    FROM documents
    WHERE documents MATCH ${sqlString(matchExpression)}
    ORDER BY
      CASE kind
        WHEN 'wiki' THEN 0
        WHEN 'memory' THEN 1
        WHEN 'decision' THEN 2
        WHEN 'guide' THEN 3
        WHEN 'state' THEN 4
        ELSE 5
      END,
      bm25(documents)
    LIMIT ${Number(limit)};
  `;

  const output = runSqlite(dbPath, sql, true).trim();
  return output ? JSON.parse(output) : [];
}
