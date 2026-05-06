import test from "node:test";
import assert from "node:assert/strict";
import { submitFeedbackSchema } from "../schemas";

function parse(data: unknown) {
  return submitFeedbackSchema.safeParse(data);
}

const VALID_COMMENT = "Quán rất ngon, phục vụ tốt!";

test("submitFeedbackSchema rejects rating 0", () => {
  const r = parse({ rating: 0, comment: VALID_COMMENT });
  assert.equal(r.success, false);
});

test("submitFeedbackSchema rejects rating 6", () => {
  const r = parse({ rating: 6, comment: VALID_COMMENT });
  assert.equal(r.success, false);
});

test("submitFeedbackSchema rejects non-integer rating 3.5", () => {
  const r = parse({ rating: 3.5, comment: VALID_COMMENT });
  assert.equal(r.success, false);
});

test("submitFeedbackSchema accepts rating 1 through 5", () => {
  for (const rating of [1, 2, 3, 4, 5]) {
    const r = parse({ rating, comment: VALID_COMMENT });
    assert.equal(r.success, true, `rating ${rating} should be valid`);
  }
});

test("submitFeedbackSchema rejects comment shorter than 10 chars after sanitize", () => {
  const r = parse({ rating: 4, comment: "abc" });
  assert.equal(r.success, false);
});

test("submitFeedbackSchema accepts comment >= 10 chars after stripping HTML", () => {
  // raw HTML + text; stripped = "Rất ngon, cảm ơn!" (> 10)
  const r = parse({ rating: 4, comment: "<b>Rất ngon</b>, cảm ơn nhé!" });
  assert.equal(r.success, true);
});

test("submitFeedbackSchema normalizes invalid phone 'abc' to null (not rejected)", () => {
  // normalizePhone("abc") returns null → schema accepts null → success
  const r = parse({ rating: 4, comment: VALID_COMMENT, phone: "abc" });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.phone, null);
});

test("submitFeedbackSchema accepts empty phone (defaults to null)", () => {
  const r = parse({ rating: 4, comment: VALID_COMMENT, phone: "" });
  assert.equal(r.success, true);
  if (r.success) assert.equal(r.data.phone, null);
});

test("submitFeedbackSchema rejects honeypot non-empty", () => {
  const r = parse({ rating: 4, comment: VALID_COMMENT, website: "http://bot.com" });
  assert.equal(r.success, false);
});

test("submitFeedbackSchema accepts honeypot empty string", () => {
  const r = parse({ rating: 4, comment: VALID_COMMENT, website: "" });
  assert.equal(r.success, true);
});
