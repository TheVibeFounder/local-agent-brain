const PRESETS = {
  research: {
    name: "research",
    label: "Research",
    summary: "Prioritize sources, memory promotion, grounded retrieval, and durable decisions.",
    defaultMode: "local-only",
    focusAreas: ["sources", "guides", "memory", "staging", "views"]
  },
  creator: {
    name: "creator",
    label: "Creator",
    summary: "Prioritize drafts, editorial context, and reusable knowledge without live-state automation in V1.",
    defaultMode: "local-only",
    focusAreas: ["sources", "memory", "outputs", "views", "staging"]
  },
  operator: {
    name: "operator",
    label: "Operator",
    summary: "Prioritize decision records, stakeholder context, and operating protocols without live connectors in V1.",
    defaultMode: "local-only",
    focusAreas: ["sources", "decisions", "protocols", "memory", "logs"]
  }
};

export function listProfileNames() {
  return Object.keys(PRESETS);
}

export function getProfilePreset(name) {
  const preset = PRESETS[name];

  if (!preset) {
    throw new Error(`Unknown profile: ${name}`);
  }

  return preset;
}

export function renderBrainProtocol(profileName) {
  const preset = getProfilePreset(profileName);

  return `# BRAIN Protocol

## Identity
- Profile: ${preset.label}
- Mode: ${preset.defaultMode}

## Core Rules
- Treat vault files as the source of truth.
- Never treat .brain runtime files as authoritative.
- Prefer grounded answers with provenance over speculation.
- Only promote durable knowledge after explicit review.
- Default to local-first behavior and avoid remote dependencies.

## Profile Focus
${preset.focusAreas.map((area) => `- ${area}`).join("\n")}

## Query Behavior
- Use memory, decisions, guides, fresh state, and source evidence in that order.
- Report confidence and provenance in every non-trivial answer.
- If evidence is weak, say so directly.
`;
}

export function renderClaudeAdapter(profileName) {
  const preset = getProfilePreset(profileName);

  return `# CLAUDE.md

This vault uses the ${preset.label} profile.

Working rules:
- Read local vault files first.
- Ground responses in durable memory, decisions, and source evidence.
- Keep pending ideas in staging until reviewed.
- Do not rely on hidden runtime state for durable facts.
`;
}

export function renderAgentsAdapter(profileName) {
  const preset = getProfilePreset(profileName);

  return `# AGENTS.md

Profile: ${preset.label}

Agent expectations:
- Query local files before answering.
- Promote only reviewed durable knowledge.
- Preserve provenance when summarizing.
- Treat .brain as rebuildable cache, not durable truth.
`;
}
