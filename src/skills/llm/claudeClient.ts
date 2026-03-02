import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (_client) return _client;

  _client = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
  });

  return _client;
}

export function getModelId(): string {
  return process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514";
}
