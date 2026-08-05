import test from "node:test";
import assert from "node:assert/strict";

import { resolveTrustedApplicationOrigin } from "../application-origin";

// Locks the shared trusted-origin parser used by the app switcher and the
// work notification action URL resolver. Fail closed on any deviation.

test("accepts one exact HTTPS application origin", () => {
  assert.equal(
    resolveTrustedApplicationOrigin("https://work.comtammatu.com/", [
      "work.comtammatu.com",
    ]),
    "https://work.comtammatu.com",
  );
});

test("accepts an origin without trailing slash", () => {
  assert.equal(
    resolveTrustedApplicationOrigin("https://work.comtammatu.com", [
      "work.comtammatu.com",
    ]),
    "https://work.comtammatu.com",
  );
});

for (const value of [
  "http://work.comtammatu.com",
  "https://work.comtammatu.com.evil.example",
  "https://user@work.comtammatu.com",
  "https://work.comtammatu.com/path",
  "https://work.comtammatu.com/?next=1",
  "https://work.comtammatu.com/#frag",
  "https://work.comtammatu.com:8443",
  "https://web.example.com",
  "//work.comtammatu.com",
  "not-a-url",
]) {
  test(`rejects unsafe application origin ${value}`, () => {
    assert.throws(() =>
      resolveTrustedApplicationOrigin(value, ["work.comtammatu.com"]),
    );
  });
}

test("rejects when the allowlist is empty", () => {
  assert.throws(() =>
    resolveTrustedApplicationOrigin("https://work.comtammatu.com", []),
  );
});

test("localhost is accepted only outside production and only when allowed", () => {
  assert.equal(
    resolveTrustedApplicationOrigin("http://localhost:3001/", [
      "localhost",
      "work.comtammatu.com",
    ]),
    "http://localhost:3001",
  );

  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(() =>
      resolveTrustedApplicationOrigin("http://localhost:3001/", [
        "localhost",
        "work.comtammatu.com",
      ]),
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
