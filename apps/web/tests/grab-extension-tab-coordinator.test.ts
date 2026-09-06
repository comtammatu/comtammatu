import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

function readExtensionFile(name: string): string {
  return readFileSync(
    new URL(`../../../tools/grab-pos-relay-extension/${name}`, import.meta.url),
    "utf8",
  );
}

const backgroundSource = readExtensionFile("background.js");
const contentSource = readExtensionFile("content.js");
const popupSource = readExtensionFile("popup.js");
const injectedSource = readExtensionFile("injected.js");
const tabsContext: {
  GrabRelayTabs?: {
    upsertTab(
      state: TabState,
      tabId: number,
      payload: Partial<TabHealth>,
      now: number,
    ): TabState;
    markUnavailable(state: TabState, tabId: number): TabState;
    removeTab(state: TabState, tabId: number): TabState;
    reconcile(
      state: TabState,
      now: number,
      staleMs?: number,
    ): { state: TabState };
    diagnostics(
      state: TabState,
      now: number,
      staleMs?: number,
    ): RelayDiagnostics;
  };
} = {};
runInNewContext(readExtensionFile("relay-tabs.js"), tabsContext);
const tabsApi = tabsContext.GrabRelayTabs;
assert.ok(tabsApi);
const logContext: {
  GrabRelayLog?: {
    append(
      existing: unknown[],
      event: Record<string, unknown>,
      now: number,
    ): Array<Record<string, unknown>>;
  };
} = {};
runInNewContext(readExtensionFile("relay-log.js"), logContext);
const logApi = logContext.GrabRelayLog;
assert.ok(logApi);

interface TabHealth {
  tabId: number;
  pageReady: boolean;
  merchantId: string;
  authState: "unknown" | "ready" | "expired";
  visible: boolean;
  lastHeartbeatAt: number;
  lastGrabActivityAt: number | null;
  lastPollSuccessAt: number | null;
  registeredAt: number;
}

interface TabState {
  tabs: TabHealth[];
  leaderTabId: number | null;
  generation: number;
}

interface RelayDiagnostics {
  status: "no_tab" | "starting" | "auth_required" | "ready";
  leaderTabId: number | null;
  generation: number;
  tabCount: number;
  followerCount: number;
}

const emptyState = (): TabState => ({
  tabs: [],
  leaderTabId: null,
  generation: 0,
});
const readyPayload = (visible = true): Partial<TabHealth> => ({
  pageReady: true,
  merchantId: "merchant-1",
  authState: "ready",
  visible,
  lastGrabActivityAt: 900,
});

test("Grab watchdog never opens a Merchant tab without an operator action", () => {
  assert.doesNotMatch(backgroundSource, /function ensureRelayTab/);
  assert.match(backgroundSource, /OPEN_OR_FOCUS_GRAB_TAB/);
});

test("Grab leadership is coordinated by the background instead of a local storage lease", () => {
  assert.doesNotMatch(
    contentSource,
    /grabRelayLeader|beatLeaderLock|LEADER_STEAL_MS/,
  );
  assert.match(backgroundSource, /TAB_HEALTH/);
  assert.match(backgroundSource, /GET_RELAY_DIAGNOSTICS/);
  assert.doesNotMatch(contentSource, /!isLeaderTab && !forceAll/);
  assert.match(
    contentSource,
    /function flushPendingStockUpdates\(\) \{[\s\S]*?if \(!isLeaderTab \|\| grabSessionExpired\) return;/,
  );
  assert.match(contentSource, /generation: tabGeneration/);
  assert.match(injectedSource, /commandGeneration !== leaderGeneration/);
  assert.match(injectedSource, /leaderGeneration !== pollGeneration/);
});

test("Grab popup renders coordinator health instead of treating any matching tab as ready", () => {
  assert.match(popupSource, /GET_RELAY_DIAGNOSTICS/);
  assert.doesNotMatch(popupSource, /function queryGrabTabs/);
});

test("an unauthenticated new tab cannot become leader", () => {
  const state = tabsApi.upsertTab(
    emptyState(),
    22,
    {
      pageReady: true,
      merchantId: "merchant-1",
      authState: "unknown",
      visible: true,
    },
    1000,
  );
  const reconciled = tabsApi.reconcile(state, 1000).state;
  assert.equal(reconciled.leaderTabId, null);
  assert.equal(tabsApi.diagnostics(reconciled, 1000).status, "starting");
});

test("a healthy leader stays sticky when another ready tab opens", () => {
  let state = tabsApi.upsertTab(emptyState(), 11, readyPayload(false), 1000);
  state = tabsApi.reconcile(state, 1000).state;
  assert.equal(state.leaderTabId, 11);

  state = tabsApi.upsertTab(
    state,
    22,
    { ...readyPayload(true), lastGrabActivityAt: 1100 },
    1100,
  );
  state = tabsApi.reconcile(state, 1100).state;
  assert.equal(state.leaderTabId, 11);
  assert.equal(tabsApi.diagnostics(state, 1100).followerCount, 1);
});

test("a healthy follower takes over immediately after the leader closes", () => {
  let state = tabsApi.upsertTab(emptyState(), 11, readyPayload(true), 1000);
  state = tabsApi.upsertTab(state, 22, readyPayload(false), 1000);
  state = tabsApi.reconcile(state, 1000).state;
  assert.equal(state.leaderTabId, 11);

  state = tabsApi.removeTab(state, 11);
  state = tabsApi.reconcile(state, 1001).state;
  assert.equal(state.leaderTabId, 22);
  assert.equal(state.generation, 2);
});

test("expired, loading, and stale tabs lose leadership", () => {
  let state = tabsApi.upsertTab(emptyState(), 11, readyPayload(true), 1000);
  state = tabsApi.reconcile(state, 1000).state;
  state = tabsApi.markUnavailable(state, 11);
  state = tabsApi.reconcile(state, 1001).state;
  assert.equal(state.leaderTabId, null);

  state = tabsApi.upsertTab(
    state,
    11,
    { ...readyPayload(true), authState: "expired" },
    1002,
  );
  state = tabsApi.reconcile(state, 1002).state;
  assert.equal(state.leaderTabId, null);
  assert.equal(tabsApi.diagnostics(state, 1002).status, "auth_required");

  state = tabsApi.upsertTab(state, 11, readyPayload(true), 2000);
  state = tabsApi.reconcile(state, 2000).state;
  state = tabsApi.reconcile(state, 2000 + 45_001, 45_000).state;
  assert.equal(state.leaderTabId, null);
});

test("local diagnostics redact secrets and expire after seven days", () => {
  const now = 8 * 24 * 60 * 60 * 1000;
  const logs = logApi.append(
    [{ occurredAt: 1, message: "expired" }],
    {
      level: "warning",
      area: "grab_session",
      code: "leader_lost",
      message: "Không còn tab trực",
      context: {
        tabId: 11,
        merchantId: "merchant-1",
        relaySecret: "must-not-leak",
        authorization: "Bearer secret",
      },
    },
    now,
  );

  assert.equal(logs.length, 1);
  assert.deepEqual(Object.keys(logs[0]?.context as object).sort(), [
    "merchantId",
    "tabId",
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /must-not-leak|Bearer secret/);
});
