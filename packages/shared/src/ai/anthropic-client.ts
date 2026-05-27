import Anthropic from "@anthropic-ai/sdk";

/**
 * Pricing constants (USD per million tokens).
 * Update when Anthropic changes pricing.
 */
export const MODEL_PRICING: Record<string, { input: number; output: number }> =
  {
    "claude-opus-4-5": { input: 15.0, output: 75.0 },
    "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
    "claude-opus-4-6": { input: 15.0, output: 75.0 },
    "claude-sonnet-4-6": { input: 3.0, output: 15.0 },
    "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  };

/**
 * The model to use for feedback AI tasks.
 * Override via FEEDBACK_AI_MODEL env var.
 * Defaults to claude-sonnet-4-6 (cost-effective for high-volume per-feedback enrichment).
 */
export function getFeedbackAiModel(): string {
  return process.env["FEEDBACK_AI_MODEL"] ?? "claude-sonnet-4-6";
}

/**
 * Calculate LLM cost in USD from token usage.
 */
export function calcLlmCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"]!;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

let _client: Anthropic | null = null;

/**
 * Returns a singleton Anthropic client. Reads ANTHROPIC_API_KEY from env.
 */
export function createAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}
