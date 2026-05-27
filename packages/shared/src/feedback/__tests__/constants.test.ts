import test from "node:test";
import assert from "node:assert/strict";
import {
  FEEDBACK_CATEGORIES,
  OUTBOX_BACKOFF_MINUTES,
  OUTBOX_MAX_ATTEMPTS,
  TOKEN_LENGTH,
  TOKEN_ALPHABET,
  RATING_MIN,
  RATING_MAX,
  TELEGRAM_THRESHOLD_RATING,
} from "../constants";

test("FEEDBACK_CATEGORIES has exactly 25 entries (matches DB function taxonomy)", () => {
  assert.equal(FEEDBACK_CATEGORIES.length, 25);
});

test("FEEDBACK_CATEGORIES contains expected anchor keys", () => {
  assert.ok(FEEDBACK_CATEGORIES.includes("food.quality.cold"));
  assert.ok(FEEDBACK_CATEGORIES.includes("service.attitude"));
  assert.ok(FEEDBACK_CATEGORIES.includes("hygiene.toilet"));
  assert.ok(FEEDBACK_CATEGORIES.includes("praise.food"));
  assert.ok(FEEDBACK_CATEGORIES.includes("other"));
});

test("OUTBOX_BACKOFF_MINUTES is [1,2,4,8,16] — matches OUTBOX_MAX_ATTEMPTS", () => {
  assert.deepEqual([...OUTBOX_BACKOFF_MINUTES], [1, 2, 4, 8, 16]);
  assert.equal(OUTBOX_BACKOFF_MINUTES.length, OUTBOX_MAX_ATTEMPTS);
});

test("rating bounds 1..5", () => {
  assert.equal(RATING_MIN, 1);
  assert.equal(RATING_MAX, 5);
});

test("Telegram threshold ≤3 (negative-only realtime push)", () => {
  assert.equal(TELEGRAM_THRESHOLD_RATING, 3);
});

test("token length and alphabet matches DB CHECK", () => {
  assert.equal(TOKEN_LENGTH, 14);
  assert.equal(TOKEN_ALPHABET.length, 62); // A-Z + a-z + 0-9
});
