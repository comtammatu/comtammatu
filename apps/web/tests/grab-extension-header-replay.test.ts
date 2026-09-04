import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const injectedSource = readFileSync(
  `${repositoryRoot}/tools/grab-pos-relay-extension/injected.js`,
  "utf8",
);

function sourceBlock(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `${start} must exist`);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, `${end} must exist after ${start}`);
  return source.slice(startIndex, endIndex);
}

function loadHeaderReplayHelpers(): {
  isReplayablePortalHeader: (name: string) => boolean;
  selectReplayablePortalHeaders: (
    headerMap: Record<string, unknown>,
  ) => Record<string, string>;
  shouldAdoptPortalHeaders: (selected: Record<string, string>) => boolean;
  hasReplayableSession: (captured: Record<string, string> | null) => boolean;
  mergeCapturedPortalHeaders: (
    current: Record<string, string> | null,
    incoming: Record<string, string>,
  ) => Record<string, string> | null;
  buildGrabHeadersFromCaptured: (
    captured: Record<string, string> | null,
    activeMerchantId: string | null,
    overrides?: Record<string, string>,
  ) => Record<string, string>;
  applyFreshRequestIds: (
    headers: Record<string, string>,
    shouldSend: boolean,
    createId: () => string,
  ) => Record<string, string>;
} {
  const headerConstants = sourceBlock(
    injectedSource,
    "const HEADER_REPLAY_ALLOWLIST",
    "const AUTH_FAILURE_THRESHOLD",
  );
  const headerHelpers = sourceBlock(
    injectedSource,
    "function isReplayablePortalHeader",
    "function captureAuthHeaders",
  );
  return Function(
    `"use strict"; ${headerConstants} ${headerHelpers}; return { isReplayablePortalHeader, selectReplayablePortalHeaders, shouldAdoptPortalHeaders, hasReplayableSession, mergeCapturedPortalHeaders, buildGrabHeadersFromCaptured, applyFreshRequestIds };`,
  )() as ReturnType<typeof loadHeaderReplayHelpers>;
}

test("Grab relay replays portal identity headers and drops tracing, body, and forbidden headers", () => {
  const {
    isReplayablePortalHeader,
    selectReplayablePortalHeaders,
    shouldAdoptPortalHeaders,
    hasReplayableSession,
    mergeCapturedPortalHeaders,
  } = loadHeaderReplayHelpers();

  assert.equal(isReplayablePortalHeader("x-gid-session-id"), true);
  assert.equal(isReplayablePortalHeader("x-mfe-version"), true);
  assert.equal(isReplayablePortalHeader("x-csrf-token"), true);
  assert.equal(isReplayablePortalHeader("requestsource"), true);
  assert.equal(isReplayablePortalHeader("x-request-id"), false);
  assert.equal(isReplayablePortalHeader("x-trace-id"), false);
  assert.equal(isReplayablePortalHeader("cookie"), false);
  assert.equal(isReplayablePortalHeader("referer"), false);
  assert.equal(isReplayablePortalHeader("sec-fetch-site"), false);
  assert.equal(isReplayablePortalHeader("content-type"), false);
  assert.equal(isReplayablePortalHeader("user-agent"), false);

  assert.deepEqual(
    selectReplayablePortalHeaders({
      Authorization: "Bearer live-token",
      "X-Csrf-Token": "csrf-1",
      "x-gid-session-id": "gid-session",
      "x-mfe-version": "9.9.9",
      "x-request-id": "same-id-every-time",
      "sec-fetch-site": "cross-site",
      referer: "https://merchant.grab.com/order/preparing",
      cookie: "session=abc",
      "content-type": "application/json",
    }),
    {
      authorization: "Bearer live-token",
      "x-csrf-token": "csrf-1",
      "x-gid-session-id": "gid-session",
      "x-mfe-version": "9.9.9",
    },
  );

  assert.equal(shouldAdoptPortalHeaders({}), false);
  assert.equal(shouldAdoptPortalHeaders({ "x-mfe-version": "1" }), true);
  assert.equal(hasReplayableSession(null), false);
  assert.equal(hasReplayableSession({ "x-mfe-version": "1" }), false);
  assert.equal(hasReplayableSession({ "x-gid-session-id": "gid-session" }), true);

  assert.deepEqual(
    mergeCapturedPortalHeaders({ authorization: "Bearer a" }, { "x-csrf-token": "csrf-2" }),
    { authorization: "Bearer a", "x-csrf-token": "csrf-2" },
  );
});

test("Grab relay keeps live merchant id and issues a fresh request id instead of replaying one", () => {
  const { buildGrabHeadersFromCaptured, applyFreshRequestIds } =
    loadHeaderReplayHelpers();

  const built = buildGrabHeadersFromCaptured(
    {
      "x-client-id": "GrabMerchant-Portal",
      "x-grabkit-clientid": "grabmerchant-portal",
      merchantid: "stale-merchant",
      "x-gid-session-id": "gid-session",
    },
    "5-C8DTE75GUGJ3JT",
    { "content-type": "application/json" },
  );
  assert.equal(built.merchantid, "5-C8DTE75GUGJ3JT");
  assert.equal(built["x-gid-session-id"], "gid-session");
  assert.equal(built["content-type"], "application/json");
  assert.equal(built["x-client-id"], "GrabMerchant-Portal");

  assert.deepEqual(
    applyFreshRequestIds({ accept: "application/json", "x-request-id": "old" }, false, () => "new-id"),
    { accept: "application/json" },
  );
  assert.deepEqual(
    applyFreshRequestIds({ accept: "application/json" }, true, () => "new-id"),
    { accept: "application/json", "x-request-id": "new-id" },
  );
});
