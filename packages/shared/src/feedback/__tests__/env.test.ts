import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getAllowedOriginsFeedback,
  isProductionRuntime,
} from "../env";

const previousEnv = {
  ALLOWED_ORIGINS_FEEDBACK: process.env["ALLOWED_ORIGINS_FEEDBACK"],
  NODE_ENV: process.env["NODE_ENV"],
  VERCEL_ENV: process.env["VERCEL_ENV"],
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(previousEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(restoreEnv);

test("getAllowedOriginsFeedback parses configured origins", () => {
  process.env["NODE_ENV"] = "production";
  process.env["ALLOWED_ORIGINS_FEEDBACK"] =
    "https://feedback.example.com, https://app.example.com ";

  assert.deepEqual(getAllowedOriginsFeedback(), [
    "https://feedback.example.com",
    "https://app.example.com",
  ]);
});

test("getAllowedOriginsFeedback fails closed in production when unset", () => {
  process.env["NODE_ENV"] = "production";
  delete process.env["VERCEL_ENV"];
  delete process.env["ALLOWED_ORIGINS_FEEDBACK"];

  assert.equal(isProductionRuntime(), true);
  assert.deepEqual(getAllowedOriginsFeedback(), []);
});

test("getAllowedOriginsFeedback fails closed on Vercel production when unset", () => {
  process.env["NODE_ENV"] = "test";
  process.env["VERCEL_ENV"] = "production";
  delete process.env["ALLOWED_ORIGINS_FEEDBACK"];

  assert.equal(isProductionRuntime(), true);
  assert.deepEqual(getAllowedOriginsFeedback(), []);
});

test("getAllowedOriginsFeedback keeps development fallback", () => {
  process.env["NODE_ENV"] = "development";
  delete process.env["VERCEL_ENV"];
  delete process.env["ALLOWED_ORIGINS_FEEDBACK"];

  assert.deepEqual(getAllowedOriginsFeedback(), [
    "https://comtammatu-web-comtammatu.vercel.app",
  ]);
});
