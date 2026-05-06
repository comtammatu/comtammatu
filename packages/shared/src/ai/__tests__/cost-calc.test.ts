import test from "node:test";
import assert from "node:assert/strict";
import { calcLlmCostUsd, MODEL_PRICING } from "../anthropic-client";

test("calcLlmCostUsd: claude-sonnet-4-6 input-only cost", () => {
  // 1M input tokens at $3/M = $3.00
  const cost = calcLlmCostUsd("claude-sonnet-4-6", 1_000_000, 0);
  assert.equal(cost, 3.0);
});

test("calcLlmCostUsd: claude-sonnet-4-6 output-only cost", () => {
  // 1M output tokens at $15/M = $15.00
  const cost = calcLlmCostUsd("claude-sonnet-4-6", 0, 1_000_000);
  assert.equal(cost, 15.0);
});

test("calcLlmCostUsd: mixed tokens", () => {
  // 500k input at $3/M + 100k output at $15/M = $1.50 + $1.50 = $3.00
  const cost = calcLlmCostUsd("claude-sonnet-4-6", 500_000, 100_000);
  assert.ok(Math.abs(cost - 3.0) < 0.0001);
});

test("calcLlmCostUsd: unknown model falls back to sonnet pricing", () => {
  const sonnetCost = calcLlmCostUsd("claude-sonnet-4-6", 1_000, 500);
  const unknownCost = calcLlmCostUsd("unknown-model-xyz", 1_000, 500);
  assert.equal(sonnetCost, unknownCost);
});

test("calcLlmCostUsd: zero tokens = zero cost", () => {
  assert.equal(calcLlmCostUsd("claude-sonnet-4-6", 0, 0), 0);
});

test("MODEL_PRICING contains all expected models", () => {
  const expectedModels = [
    "claude-sonnet-4-6",
    "claude-opus-4-6",
    "claude-haiku-4-5",
  ];
  for (const model of expectedModels) {
    assert.ok(
      MODEL_PRICING[model] !== undefined,
      `Missing pricing for ${model}`,
    );
  }
});

test("MODEL_PRICING: opus costs more than sonnet", () => {
  const opus = MODEL_PRICING["claude-opus-4-6"]!;
  const sonnet = MODEL_PRICING["claude-sonnet-4-6"]!;
  assert.ok(opus.input > sonnet.input);
  assert.ok(opus.output > sonnet.output);
});
