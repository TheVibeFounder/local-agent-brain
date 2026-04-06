function quoteIfNeeded(value) {
  if (value === "") {
    return "\"\"";
  }

  if (/[:#[\]{}"',&*!?|<>%@`]/.test(value) || /^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }

  return value;
}

function formatScalar(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (Array.isArray(value) && value.length === 0) {
    return "[]";
  }

  return quoteIfNeeded(String(value));
}

export function stringifyYaml(value, indent = 0) {
  const pad = " ".repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${pad}[]`;
    }

    return value
      .map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const nested = stringifyYaml(item, indent + 2);
          const lines = nested.split("\n");
          return `${pad}- ${lines[0].trimStart()}\n${lines.slice(1).join("\n")}`;
        }

        return `${pad}- ${formatScalar(item)}`;
      })
      .join("\n");
  }

  return Object.entries(value)
    .map(([key, rawValue]) => {
      if (Array.isArray(rawValue)) {
        if (rawValue.length === 0) {
          return `${pad}${key}: []`;
        }

        return `${pad}${key}:\n${stringifyYaml(rawValue, indent + 2)}`;
      }

      if (rawValue && typeof rawValue === "object") {
        const nested = stringifyYaml(rawValue, indent + 2);
        return `${pad}${key}:\n${nested}`;
      }

      return `${pad}${key}: ${formatScalar(rawValue)}`;
    })
    .join("\n");
}

function parseScalar(raw) {
  if (raw === "null") {
    return null;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  if (raw === "[]") {
    return [];
  }

  if (raw === "{}") {
    return {};
  }

  if (/^-?\d+$/.test(raw)) {
    return Number(raw);
  }

  if ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'"))) {
    const normalized = raw.startsWith("'") ? `"${raw.slice(1, -1).replace(/"/g, "\\\"")}"` : raw;
    return JSON.parse(normalized);
  }

  if ((raw.startsWith("[") && raw.endsWith("]")) || (raw.startsWith("{") && raw.endsWith("}"))) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }

  return raw;
}

function nextSignificantLine(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();

    if (trimmed && !trimmed.startsWith("#")) {
      return lines[index];
    }
  }

  return null;
}

export function parseYaml(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const root = {};
  const stack = [{ indent: -1, container: root }];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const trimmed = rawLine.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const indent = rawLine.length - rawLine.trimStart().length;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1].container;

    if (trimmed.startsWith("- ")) {
      if (!Array.isArray(current)) {
        throw new Error(`Invalid YAML sequence near line ${index + 1}`);
      }

      current.push(parseScalar(trimmed.slice(2).trim()));
      continue;
    }

    const separator = trimmed.indexOf(":");

    if (separator === -1) {
      throw new Error(`Invalid YAML mapping near line ${index + 1}`);
    }

    const key = trimmed.slice(0, separator).trim();
    const rest = trimmed.slice(separator + 1).trim();

    if (!rest) {
      const upcoming = nextSignificantLine(lines, index + 1);
      const upcomingIndent = upcoming ? upcoming.length - upcoming.trimStart().length : indent;
      const child = upcoming && upcomingIndent > indent && upcoming.trim().startsWith("- ") ? [] : {};
      current[key] = child;
      stack.push({ indent, container: child });
      continue;
    }

    current[key] = parseScalar(rest);
  }

  return root;
}
