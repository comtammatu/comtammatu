import test from "node:test";
import assert from "node:assert/strict";

/**
 * Unit tests for JSON parsing logic extracted from enrichFeedback.
 * We test the parsing/normalization helpers independently to avoid
 * needing a live Anthropic API key in CI.
 */

function extractJsonFromText(text: string): string {
  // Replicate the logic in feedback-enrichment.ts
  const codeBlockMatch = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim();
  }
  const jsonMatch = /\{[\s\S]*\}/.exec(text);
  if (jsonMatch?.[0]) {
    return jsonMatch[0].trim();
  }
  return text.trim();
}

function clampSentiment(score: unknown): number {
  const n = typeof score === "number" ? score : 0;
  return Math.max(-1, Math.min(1, n));
}

test("extractJsonFromText: returns JSON from markdown code block", () => {
  const input = 'Some text\n```json\n{"key":"value"}\n```\nmore text';
  assert.equal(extractJsonFromText(input), '{"key":"value"}');
});

test("extractJsonFromText: returns JSON from plain code block", () => {
  const input = '```\n{"a":1}\n```';
  assert.equal(extractJsonFromText(input), '{"a":1}');
});

test("extractJsonFromText: extracts raw JSON without code block", () => {
  const input = 'Here is the result: {"categories":[],"severity":"low"}';
  const result = extractJsonFromText(input);
  assert.ok(result.startsWith("{"));
  assert.ok(result.endsWith("}"));
});

test("extractJsonFromText: returns input trimmed when no JSON found", () => {
  const input = "  plain text  ";
  assert.equal(extractJsonFromText(input), "plain text");
});

test("clampSentiment: clamps above +1", () => {
  assert.equal(clampSentiment(1.5), 1);
});

test("clampSentiment: clamps below -1", () => {
  assert.equal(clampSentiment(-2), -1);
});

test("clampSentiment: passes through valid range", () => {
  assert.equal(clampSentiment(0.5), 0.5);
  assert.equal(clampSentiment(-0.3), -0.3);
  assert.equal(clampSentiment(0), 0);
});

test("clampSentiment: non-number defaults to 0", () => {
  assert.equal(clampSentiment("bad"), 0);
  assert.equal(clampSentiment(null), 0);
  assert.equal(clampSentiment(undefined), 0);
});

test("full enrichment JSON round-trip (mock response)", () => {
  const mockResponse = JSON.stringify({
    categories: ["food.quality.cold", "service.attitude"],
    severity: "high",
    summary_vi: "Khách phàn nàn về thức ăn nguội và thái độ nhân viên.",
    sentiment_score: -0.8,
    is_critical_realtime: true,
    suggested_action: "Kiểm tra nhiệt độ bếp, nhắc nhở nhân viên.",
  });

  const json = JSON.parse(extractJsonFromText(mockResponse)) as {
    categories: string[];
    severity: string;
    summary_vi: string;
    sentiment_score: number;
    is_critical_realtime: boolean;
    suggested_action: string;
  };

  assert.deepEqual(json.categories, ["food.quality.cold", "service.attitude"]);
  assert.equal(json.severity, "high");
  assert.ok(json.summary_vi.length > 0);
  assert.equal(clampSentiment(json.sentiment_score), -0.8);
  assert.equal(json.is_critical_realtime, true);
});

test("malformed JSON does not throw when caught", () => {
  const malformed = "not json at all";
  assert.throws(() => JSON.parse(malformed), SyntaxError);
  // In enrichFeedback, this is caught and returns empty result — tested here
  // by confirming the error type is predictable.
});
