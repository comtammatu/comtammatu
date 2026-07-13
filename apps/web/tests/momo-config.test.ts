import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadMomoConfig,
  MomoConfigurationError,
} from "../lib/payments/momo-config";

const credentials = {
  MOMO_PARTNER_CODE: " MOMO ",
  MOMO_ACCESS_KEY: " access-key ",
  MOMO_SECRET_KEY: " secret-key ",
};

test("MoMo config defaults to sandbox only outside production", () => {
  assert.deepEqual(loadMomoConfig({ NODE_ENV: "test", ...credentials }), {
    partnerCode: "MOMO",
    accessKey: "access-key",
    secretKey: "secret-key",
    baseUrl: "https://test-payment.momo.vn",
  });

  assert.throws(
    () => loadMomoConfig({ NODE_ENV: "production", ...credentials }),
    MomoConfigurationError,
  );
});

test("MoMo production config requires an explicit trusted gateway URL", () => {
  assert.deepEqual(
    loadMomoConfig({
      NODE_ENV: "production",
      MOMO_BASE_URL: "https://payment.momo.vn",
      ...credentials,
    }),
    {
      partnerCode: "MOMO",
      accessKey: "access-key",
      secretKey: "secret-key",
      baseUrl: "https://payment.momo.vn",
    },
  );

  for (const MOMO_BASE_URL of [
    "http://payment.momo.vn",
    "https://example.com",
    "https://payment.momo.vn/path",
  ]) {
    assert.throws(
      () =>
        loadMomoConfig({
          NODE_ENV: "production",
          MOMO_BASE_URL,
          ...credentials,
        }),
      MomoConfigurationError,
    );
  }
});
