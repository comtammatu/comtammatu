import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isMomoCheckoutAvailable,
  isMomoEnabled,
  isMomoRuntimeReady,
  loadMomoConfig,
  MomoConfigurationError,
} from "../lib/payments/momo-config";

const credentials = {
  MOMO_PARTNER_CODE: " MOMO ",
  MOMO_ACCESS_KEY: " access-key ",
  MOMO_SECRET_KEY: " secret-key ",
};

test("MoMo stays disabled unless the deployment flag is explicitly true", () => {
  assert.equal(isMomoEnabled({}), false);
  assert.equal(isMomoEnabled({ MOMO_ENABLED: "false" }), false);
  assert.equal(isMomoEnabled({ MOMO_ENABLED: "1" }), false);
  assert.equal(isMomoEnabled({ MOMO_ENABLED: " TRUE " }), true);
  assert.equal(isMomoRuntimeReady({}), false);
  assert.equal(isMomoRuntimeReady({ MOMO_RUNTIME_READY: " TRUE " }), true);
  assert.equal(isMomoCheckoutAvailable(credentials), false);
  assert.equal(
    isMomoCheckoutAvailable({
      NODE_ENV: "production",
      MOMO_ENABLED: "true",
      MOMO_RUNTIME_READY: "true",
      MOMO_BASE_URL: "https://payment.momo.vn",
      ...credentials,
    }),
    true,
  );
});

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
