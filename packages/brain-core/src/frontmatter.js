import { parseYaml, stringifyYaml } from "./yaml.js";

export function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");

  if (!normalized.startsWith("---\n")) {
    return { data: {}, body: normalized };
  }

  const endIndex = normalized.indexOf("\n---\n", 4);

  if (endIndex === -1) {
    return { data: {}, body: normalized };
  }

  const rawData = normalized.slice(4, endIndex);
  const body = normalized.slice(endIndex + 5);
  return { data: parseYaml(rawData), body };
}

export function serializeFrontmatter(data, body = "") {
  const serialized = stringifyYaml(data);
  const suffix = body ? `${body.replace(/^\n+/, "")}\n` : "";
  return `---\n${serialized}\n---\n${suffix}`;
}
