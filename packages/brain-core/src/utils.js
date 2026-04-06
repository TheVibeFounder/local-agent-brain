import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { STOP_WORDS, SUPPORTED_TEXT_EXTENSIONS } from "./constants.js";

export function nowIso() {
  return new Date().toISOString();
}

export function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

export function fileExists(targetPath) {
  return fs.existsSync(targetPath);
}

export function slugify(value, fallback = "item") {
  const slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || fallback;
}

export function uniquePath(targetPath) {
  if (!fileExists(targetPath)) {
    return targetPath;
  }

  const { dir, name, ext } = path.parse(targetPath);
  let counter = 2;

  while (true) {
    const candidate = path.join(dir, `${name}-${counter}${ext}`);

    if (!fileExists(candidate)) {
      return candidate;
    }

    counter += 1;
  }
}

export function walkFiles(rootPath) {
  if (!fileExists(rootPath)) {
    return [];
  }

  const entries = fs.readdirSync(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
      continue;
    }

    files.push(entryPath);
  }

  return files;
}

export function isUrl(value) {
  return /^https?:\/\//i.test(value);
}

export function isTextFile(filePath) {
  return SUPPORTED_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function readTextIfSupported(filePath) {
  if (!isTextFile(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8");
}

export function hashText(text) {
  return crypto.createHash("sha1").update(text).digest("hex");
}

export function relativePath(rootPath, targetPath) {
  return path.relative(rootPath, targetPath).split(path.sep).join("/");
}

export function datedPathParts(now = new Date()) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return [year, month, day];
}

export function extractTitle(text, fallback = "Untitled") {
  const lines = text.replace(/\r\n/g, "\n").split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("#")) {
      return trimmed.replace(/^#+\s*/, "").trim() || fallback;
    }

    if (trimmed) {
      return trimmed.slice(0, 120);
    }
  }

  return fallback;
}

export function extractSummary(text, maxLength = 240) {
  const collapsed = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");

  if (collapsed.length <= maxLength) {
    return collapsed;
  }

  return `${collapsed.slice(0, maxLength).replace(/\s+\S*$/, "")}…`;
}

export function extractEvidenceLines(text, limit = 3) {
  const lines = text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"));

  return lines.slice(0, limit);
}

export function stripFrontmatter(text) {
  if (!text.startsWith("---\n")) {
    return text;
  }

  const index = text.indexOf("\n---\n", 4);
  return index === -1 ? text : text.slice(index + 5);
}

export function normalizeQueryTokens(question) {
  return question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));
}

export function scoreConfidence(kinds) {
  if (kinds.some((kind) => kind === "memory" || kind === "decision")) {
    return "high";
  }

  if (kinds.some((kind) => kind === "guide" || kind === "state")) {
    return "medium";
  }

  return "low";
}
