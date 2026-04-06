export function describeOpenAICompatibleAdapter(config = {}) {
  return {
    provider: config.provider ?? "openai-compatible",
    endpoint: config.endpoint ?? "http://localhost:11434/v1",
    status: "placeholder"
  };
}
