import assert from "node:assert/strict";
import { test } from "node:test";
import {
  COMPANY_TAX_CODE_REGEX,
  checkHddtConfig,
} from "../lib/hddt-config-guard";

const FULL_ENV: NodeJS.ProcessEnv = {
  COMPANY_TAX_CODE: "0123456789",
  SINVOICE_USERNAME: "u",
  SINVOICE_PASSWORD: "p",
  SINVOICE_TEMPLATE_CODE: "2/001",
  SINVOICE_INVOICE_SERIES: "C26MAA",
};

test("MST regex accepts 10-digit and 10-3 forms, rejects others", () => {
  assert.ok(COMPANY_TAX_CODE_REGEX.test("0123456789"));
  assert.ok(COMPANY_TAX_CODE_REGEX.test("0123456789-001"));
  assert.ok(!COMPANY_TAX_CODE_REGEX.test("123"));
  assert.ok(!COMPANY_TAX_CODE_REGEX.test("0123456789-1")); // suffix must be 3 digits
  assert.ok(!COMPANY_TAX_CODE_REGEX.test("abcdefghij"));
  assert.ok(!COMPANY_TAX_CODE_REGEX.test(""));
});

test("checkHddtConfig OK when tax code valid and all SINVOICE_* present", () => {
  const res = checkHddtConfig(FULL_ENV);
  assert.equal(res.ok, true);
  assert.deepEqual(res.problems, []);
});

test("checkHddtConfig flags missing tax code", () => {
  const env = { ...FULL_ENV };
  delete env.COMPANY_TAX_CODE;
  const res = checkHddtConfig(env);
  assert.equal(res.ok, false);
  assert.ok(res.problems.includes("company_tax_code_missing"));
});

test("checkHddtConfig flags malformed tax code", () => {
  const res = checkHddtConfig({ ...FULL_ENV, COMPANY_TAX_CODE: "12-34" });
  assert.equal(res.ok, false);
  assert.ok(res.problems.includes("company_tax_code_invalid_format"));
});

test("checkHddtConfig flags each missing SINVOICE_* credential", () => {
  const env = { ...FULL_ENV };
  delete env.SINVOICE_USERNAME;
  delete env.SINVOICE_INVOICE_SERIES;
  const res = checkHddtConfig(env);
  assert.equal(res.ok, false);
  assert.ok(res.problems.includes("sinvoice_username_missing"));
  assert.ok(res.problems.includes("sinvoice_invoice_series_missing"));
  // present creds must NOT be flagged
  assert.ok(!res.problems.includes("sinvoice_password_missing"));
});

test("checkHddtConfig never returns secrets, only problem codes", () => {
  const secret = "SUPER_SECRET_PASSWORD_VALUE";
  const res = checkHddtConfig({
    COMPANY_TAX_CODE: "not-a-valid-mst",
    SINVOICE_PASSWORD: secret,
    SINVOICE_USERNAME: secret,
  });
  for (const p of res.problems) {
    // problem codes are lowercase snake_case identifiers only
    assert.match(p, /^[a-z0-9_]+$/);
    assert.ok(!p.includes(secret), "problem code must not leak a secret value");
  }
});
