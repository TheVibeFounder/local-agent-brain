import fs from "node:fs";
import path from "node:path";

import { ensureDirectory, nowIso } from "./utils.js";

function appendJsonLine(filePath, payload) {
  ensureDirectory(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

export function logAction(vaultRoot, payload) {
  appendJsonLine(path.join(vaultRoot, "logs/actions.jsonl"), {
    timestamp: nowIso(),
    ...payload
  });
}

export function logConnector(vaultRoot, payload) {
  appendJsonLine(path.join(vaultRoot, "logs/connectors.jsonl"), {
    timestamp: nowIso(),
    ...payload
  });
}
