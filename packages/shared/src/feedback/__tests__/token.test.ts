import test from "node:test";
import assert from "node:assert/strict";
import { generateFeedbackToken, isValidFeedbackToken } from "../token";
import { TOKEN_LENGTH, TOKEN_ALPHABET } from "../constants";

test("generateFeedbackToken returns correct length", () => {
  const token = generateFeedbackToken();
  assert.equal(token.length, TOKEN_LENGTH);
});

test("generateFeedbackToken uses only TOKEN_ALPHABET chars", () => {
  const token = generateFeedbackToken();
  for (const c of token) {
    assert.ok(TOKEN_ALPHABET.includes(c), `char '${c}' not in alphabet`);
  }
});

test("100 consecutive tokens are all unique", () => {
  const tokens = new Set<string>();
  for (let i = 0; i < 100; i++) {
    tokens.add(generateFeedbackToken());
  }
  assert.equal(tokens.size, 100);
});

test("isValidFeedbackToken accepts valid token", () => {
  const token = generateFeedbackToken();
  assert.ok(isValidFeedbackToken(token));
});

test("isValidFeedbackToken rejects wrong length", () => {
  assert.equal(isValidFeedbackToken("short"), false);
  assert.equal(isValidFeedbackToken("a".repeat(TOKEN_LENGTH + 1)), false);
  assert.equal(isValidFeedbackToken(""), false);
});

test("isValidFeedbackToken rejects non-alphanumeric chars", () => {
  // Replace last char with a special char
  const token = generateFeedbackToken();
  const bad = token.slice(0, -1) + "!";
  assert.equal(isValidFeedbackToken(bad), false);
});
