export const SCHEMA_VERSION = 1;

export const VALID_PROFILES = ["research", "creator", "operator"];
export const VALID_MODES = ["local-only", "hybrid", "cloud-assisted"];
export const VALID_RISK_CLASSES = [
  "read",
  "compile",
  "draft",
  "organize",
  "execute_low_risk",
  "execute_high_risk"
];
export const VALID_CONNECTOR_TYPES = ["snapshot", "evidence_only", "state_only"];

export const REQUIRED_DIRECTORIES = [
  "sources",
  "guides",
  "memory",
  "memory/claims",
  "memory/entities",
  "memory/relations",
  "memory/syntheses",
  "state",
  "decisions",
  "protocols",
  "connectors",
  "tools",
  "automations",
  "staging",
  "staging/memory",
  "staging/decisions",
  "staging/views",
  "views",
  "outputs",
  "logs",
  ".brain"
];

export const REQUIRED_FILES = [
  "brain.config.yaml",
  "protocols/BRAIN.md",
  "CLAUDE.md",
  "AGENTS.md",
  "logs/actions.jsonl",
  "logs/connectors.jsonl"
];

export const V1_COMMANDS = [
  "init",
  "doctor",
  "ingest",
  "compile",
  "query",
  "health-check",
  "promote",
  "decision new"
];

export const SUPPORTED_TEXT_EXTENSIONS = new Set([
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".log"
]);

export const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "what",
  "when",
  "where",
  "who",
  "why",
  "with"
]);
