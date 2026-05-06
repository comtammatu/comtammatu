import test from "node:test";
import assert from "node:assert/strict";
import {
  formatFeedbackTelegramMessage,
  escapeMarkdownV2,
} from "../format-feedback";
import { redactTelegramToken } from "../client";

const BASE_ARGS = {
  feedback_id: 42,
  rating: 2,
  comment: "Thức ăn nguội, phục vụ chậm quá!",
  branch_name: "Cơm Tấm Má Tư Q1",
  qr_label: "Cơm Tấm Má Tư Q1 — Bàn 5",
  has_phone: false,
  admin_url: "https://app.example.com/admin/feedback?id=42",
  created_at: "2026-05-05T10:00:00Z",
};

test("formatFeedbackTelegramMessage includes admin deep link", () => {
  const msg = formatFeedbackTelegramMessage(BASE_ARGS);
  assert.ok(msg.includes("https://app.example.com/admin/feedback?id=42"));
});

test("formatFeedbackTelegramMessage includes rating emoji for rating 2", () => {
  const msg = formatFeedbackTelegramMessage(BASE_ARGS);
  assert.ok(msg.includes("😞"));
});

test("formatFeedbackTelegramMessage truncates comment > 500 chars", () => {
  const long = "x".repeat(600);
  const msg = formatFeedbackTelegramMessage({ ...BASE_ARGS, comment: long });
  assert.ok(msg.includes("…"));
  // The truncated portion should be ≤ 500 + 1 (ellipsis)
  const commentLine = msg.split("\n").find((l) => l.startsWith("💬"));
  assert.ok(commentLine !== undefined);
  // 500 x's escaped (none need escaping) + …
  assert.ok(commentLine!.length <= 510);
});

test("formatFeedbackTelegramMessage does not truncate short comment", () => {
  const msg = formatFeedbackTelegramMessage(BASE_ARGS);
  assert.ok(!msg.includes("…"));
});

test("formatFeedbackTelegramMessage shows phone notice when has_phone=true", () => {
  const msg = formatFeedbackTelegramMessage({ ...BASE_ARGS, has_phone: true });
  assert.ok(msg.includes("📞"));
});

test("escapeMarkdownV2 escapes special chars", () => {
  assert.equal(escapeMarkdownV2("hello.world"), "hello\\.world");
  assert.equal(escapeMarkdownV2("a-b"), "a\\-b");
  assert.equal(escapeMarkdownV2("(test)"), "\\(test\\)");
});

test("redactTelegramToken replaces token in string", () => {
  const token = "secret123token";
  const input = `bot${token}/sendMessage`;
  const result = redactTelegramToken(input, token);
  assert.ok(!result.includes(token));
  assert.ok(result.includes("***REDACTED***"));
});

test("redactTelegramToken is identity when token is empty", () => {
  assert.equal(redactTelegramToken("hello", ""), "hello");
});
