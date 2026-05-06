import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhone } from "../phone";

test('normalizePhone "0901234567" → "+84901234567"', () => {
  assert.equal(normalizePhone("0901234567"), "+84901234567");
});

test('normalizePhone "+84901234567" → "+84901234567"', () => {
  assert.equal(normalizePhone("+84901234567"), "+84901234567");
});

test('normalizePhone "84901234567" → "+84901234567"', () => {
  assert.equal(normalizePhone("84901234567"), "+84901234567");
});

test('normalizePhone "+1 415 555 1234" → "+14155551234"', () => {
  assert.equal(normalizePhone("+1 415 555 1234"), "+14155551234");
});

test('normalizePhone "" → null', () => {
  assert.equal(normalizePhone(""), null);
});

test('normalizePhone "abc" → null', () => {
  assert.equal(normalizePhone("abc"), null);
});

test('normalizePhone "0901-234-567" → "+84901234567"', () => {
  assert.equal(normalizePhone("0901-234-567"), "+84901234567");
});

test("normalizePhone null → null", () => {
  assert.equal(normalizePhone(null), null);
});

test("normalizePhone undefined → null", () => {
  assert.equal(normalizePhone(undefined), null);
});
