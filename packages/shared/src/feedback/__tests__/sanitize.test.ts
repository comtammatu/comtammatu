import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeComment, isCommentLengthValid } from "../sanitize";

test("sanitizeComment strips script tags", () => {
  assert.equal(sanitizeComment("<script>alert(1)</script>"), "alert(1)");
});

test("sanitizeComment preserves Vietnamese diacritics and emoji", () => {
  const input = "Cảm ơn quán nhé! 😊";
  assert.equal(sanitizeComment(input), "Cảm ơn quán nhé! 😊");
});

test("sanitizeComment empty string → empty string", () => {
  assert.equal(sanitizeComment(""), "");
});

test("sanitizeComment whitespace-only → empty string", () => {
  assert.equal(sanitizeComment("   \t  "), "");
});

test("isCommentLengthValid 9 chars → false", () => {
  assert.equal(isCommentLengthValid("a".repeat(9)), false);
});

test("isCommentLengthValid 10 chars → true", () => {
  assert.equal(isCommentLengthValid("a".repeat(10)), true);
});

test("isCommentLengthValid 2000 chars → true", () => {
  assert.equal(isCommentLengthValid("a".repeat(2000)), true);
});

test("isCommentLengthValid 2001 chars → false", () => {
  assert.equal(isCommentLengthValid("a".repeat(2001)), false);
});
