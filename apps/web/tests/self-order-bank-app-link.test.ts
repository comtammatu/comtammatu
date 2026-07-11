import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildVietQrBankAppUrl,
  parseVietQrBankApps,
} from "../lib/self-order/bank-app-link";

test("VietQR bank app links keep the exact payment facts", () => {
  const href = buildVietQrBankAppUrl({
    appId: "mb",
    accountNo: "0123456789",
    bankCode: "MB",
    amount: 167_000,
    paymentCode: "QAJZRU5550 MBBMS01382716 1 ABC123XYZ789",
    accountName: "COM TAM MA TU",
  });

  assert.ok(href);
  const url = new URL(href);
  assert.equal(url.origin, "https://dl.vietqr.io");
  assert.equal(url.pathname, "/pay");
  assert.equal(url.searchParams.get("app"), "mb");
  assert.equal(url.searchParams.get("ba"), "0123456789@mb");
  assert.equal(url.searchParams.get("am"), "167000");
  assert.equal(
    url.searchParams.get("tn"),
    "QAJZRU5550 MBBMS01382716 1 ABC123XYZ789",
  );
  assert.equal(url.searchParams.get("bn"), "COM TAM MA TU");
});

test("VietQR bank app catalog rejects unsafe and duplicate app ids", () => {
  assert.deepEqual(
    parseVietQrBankApps({
      apps: [
        {
          appId: "mb",
          appName: "MB Bank",
          appLogo: "https://play-lh.googleusercontent.com/mb-logo",
        },
        { appId: "mb", appName: "Duplicate" },
        { appId: "../../bad", appName: "Unsafe" },
        {
          appId: "vcb",
          appName: "Vietcombank",
          appLogo: "https://example.com/untrusted-logo",
        },
      ],
    }),
    [
      {
        id: "mb",
        name: "MB Bank",
        logoUrl: "https://play-lh.googleusercontent.com/mb-logo",
      },
      { id: "vcb", name: "Vietcombank", logoUrl: null },
    ],
  );

  assert.equal(
    buildVietQrBankAppUrl({
      appId: "../../bad",
      accountNo: "0123456789",
      bankCode: "MB",
      amount: 167_000,
      paymentCode: "MATU",
    }),
    null,
  );
});

test("Self-Order allows only the official VietQR catalog and logo hosts in CSP", () => {
  const config = readFileSync(
    new URL("../next.config.ts", import.meta.url),
    "utf8",
  );
  assert.match(config, /connect-src[^\n]+https:\/\/api\.vietqr\.io/);
  assert.match(
    config,
    /img-src[^\n]+https:\/\/play-lh\.googleusercontent\.com/,
  );
});
