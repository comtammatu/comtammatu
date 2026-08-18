import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveSinvoiceIssuedAt } from "../issue-date";

test("same Vietnam calendar day keeps the sale invoice time", () => {
  assert.equal(
    resolveSinvoiceIssuedAt("2026-08-17T15:10:00.000Z", {
      submittedAt: new Date("2026-08-17T16:00:00.000Z"),
    }),
    "2026-08-17T15:10:00.000Z",
  );
});

test("a later Vietnam calendar day fail-closes unless backlog is opted in", () => {
  assert.equal(
    resolveSinvoiceIssuedAt("2026-08-17T15:10:00.000Z", {
      submittedAt: new Date("2026-08-18T03:05:00.000Z"),
    }),
    null,
  );
  assert.equal(
    resolveSinvoiceIssuedAt("2026-08-17T15:10:00.000Z", {
      submittedAt: new Date("2026-08-18T03:05:00.000Z"),
      allowBacklogSubmitDate: true,
    }),
    "2026-08-18T03:05:00.000Z",
  );
});

test("Vietnam midnight is the calendar-day boundary", () => {
  assert.equal(
    resolveSinvoiceIssuedAt("2026-08-17T16:59:59.000Z", {
      submittedAt: new Date("2026-08-17T16:59:59.000Z"),
    }),
    "2026-08-17T16:59:59.000Z",
  );
  assert.equal(
    resolveSinvoiceIssuedAt("2026-08-17T16:59:59.000Z", {
      submittedAt: new Date("2026-08-17T17:00:00.000Z"),
    }),
    null,
  );
});
