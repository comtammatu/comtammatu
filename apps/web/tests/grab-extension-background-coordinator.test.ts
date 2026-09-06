import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { test } from "node:test";

function extensionSource(name: string): string {
  return readFileSync(
    new URL(`../../../tools/grab-pos-relay-extension/${name}`, import.meta.url),
    "utf8",
  );
}

interface SentMessage {
  tabId: number;
  message: Record<string, unknown>;
}

interface RuntimeResponse {
  success?: boolean;
  role?: string;
  reason?: string;
  tabId?: number | null;
}

function createHarness() {
  const runtimeListeners: Array<
    (
      request: Record<string, unknown>,
      sender: { tab?: { id: number } },
      sendResponse: (response: unknown) => void,
    ) => boolean | undefined
  > = [];
  const tabRemovedListeners: Array<(tabId: number) => void> = [];
  const tabUpdatedListeners: Array<
    (tabId: number, change: { status?: string }) => void
  > = [];
  const localStorage: Record<string, unknown> = {};
  const sessionStorage: Record<string, unknown> = {};
  const browserTabs = new Map<
    number,
    { id: number; windowId: number; discarded?: boolean }
  >();
  const sentMessages: SentMessage[] = [];
  const unreachableTabs = new Set<number>();
  let createdTabs = 0;

  const context = createContext({
    console,
    setTimeout,
    clearTimeout,
    Promise,
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  }) as Record<string, unknown>;
  context.self = context;

  const chrome = {
    runtime: {
      lastError: null,
      getManifest: () => ({ version: "1.3.0" }),
      onInstalled: { addListener: () => undefined },
      onStartup: { addListener: () => undefined },
      onMessage: {
        addListener: (listener: (typeof runtimeListeners)[number]) =>
          runtimeListeners.push(listener),
      },
    },
    storage: {
      local: {
        get: (
          keys: string[],
          callback: (value: Record<string, unknown>) => void,
        ) => {
          callback(
            Object.fromEntries(keys.map((key) => [key, localStorage[key]])),
          );
        },
        set: (values: Record<string, unknown>, callback?: () => void) => {
          Object.assign(localStorage, values);
          callback?.();
        },
        remove: (key: string) => delete localStorage[key],
      },
      session: {
        get: (
          keys: string[],
          callback: (value: Record<string, unknown>) => void,
        ) => {
          callback(
            Object.fromEntries(keys.map((key) => [key, sessionStorage[key]])),
          );
        },
        set: (values: Record<string, unknown>, callback?: () => void) => {
          Object.assign(sessionStorage, values);
          callback?.();
        },
      },
      onChanged: { addListener: () => undefined },
    },
    action: {
      setBadgeBackgroundColor: async () => undefined,
      setBadgeText: async () => undefined,
    },
    alarms: {
      create: () => undefined,
      onAlarm: { addListener: () => undefined },
    },
    idle: { onStateChanged: { addListener: () => undefined } },
    windows: { update: async () => undefined },
    tabs: {
      query: async () => Array.from(browserTabs.values()),
      get: async (tabId: number) => {
        const tab = browserTabs.get(tabId);
        if (!tab) throw new Error("missing tab");
        return tab;
      },
      update: async (tabId: number) => browserTabs.get(tabId),
      reload: async () => undefined,
      create: async () => {
        createdTabs += 1;
        const tab = { id: 100 + createdTabs, windowId: 1 };
        browserTabs.set(tab.id, tab);
        return tab;
      },
      sendMessage: (
        tabId: number,
        message: Record<string, unknown>,
        callback?: (response: unknown) => void,
      ) => {
        sentMessages.push({ tabId, message });
        if (unreachableTabs.has(tabId)) {
          chrome.runtime.lastError = {
            message: "Receiving end does not exist",
          };
          callback?.(undefined);
          chrome.runtime.lastError = null;
          return;
        }
        callback?.({ success: true });
      },
      onRemoved: {
        addListener: (listener: (tabId: number) => void) =>
          tabRemovedListeners.push(listener),
      },
      onUpdated: {
        addListener: (
          listener: (tabId: number, change: { status?: string }) => void,
        ) => tabUpdatedListeners.push(listener),
      },
    },
  };
  context.chrome = chrome;
  context.importScripts = (...names: string[]) => {
    for (const name of names) runInContext(extensionSource(name), context);
  };
  runInContext(extensionSource("background.js"), context);

  async function send(
    request: Record<string, unknown>,
    tabId?: number,
  ): Promise<RuntimeResponse> {
    const listener = runtimeListeners[0];
    assert.ok(listener);
    return new Promise((resolve) => {
      const keepChannel = listener(
        request,
        tabId ? { tab: { id: tabId } } : {},
        (response) => resolve((response ?? {}) as RuntimeResponse),
      );
      if (keepChannel !== true) resolve({});
    });
  }

  return {
    send,
    browserTabs,
    sentMessages,
    unreachableTabs,
    tabRemovedListeners,
    tabUpdatedListeners,
    get createdTabs() {
      return createdTabs;
    },
  };
}

const readyHealth = {
  reason: "session_ready",
  pageReady: true,
  merchantId: "merchant-1",
  authState: "ready",
  visible: true,
  lastGrabActivityAt: Date.now(),
};

test("background rejects an unready tab and routes commands only to the sticky healthy leader", async () => {
  const harness = createHarness();
  harness.browserTabs.set(11, { id: 11, windowId: 1 });
  harness.browserTabs.set(22, { id: 22, windowId: 1 });

  const unready = await harness.send(
    {
      action: "TAB_HEALTH",
      payload: { ...readyHealth, authState: "unknown" },
    },
    11,
  );
  assert.equal(unready.role, "follower");

  const leader = await harness.send(
    { action: "TAB_HEALTH", payload: readyHealth },
    22,
  );
  assert.equal(leader.role, "leader");
  const sticky = await harness.send(
    {
      action: "TAB_HEALTH",
      payload: { ...readyHealth, lastGrabActivityAt: Date.now() + 1000 },
    },
    11,
  );
  assert.equal(sticky.role, "follower");

  harness.sentMessages.length = 0;
  const routed = await harness.send({ action: "FORCE_FULL_SYNC" });
  assert.equal(routed.success, true);
  assert.deepEqual(
    harness.sentMessages
      .filter((entry) => entry.message.action === "FORCE_FULL_SYNC")
      .map((entry) => entry.tabId),
    [22],
  );
});

test("operator open action coalesces concurrent requests into one new Merchant tab", async () => {
  const harness = createHarness();
  const [first, second] = await Promise.all([
    harness.send({ action: "OPEN_OR_FOCUS_GRAB_TAB" }),
    harness.send({ action: "OPEN_OR_FOCUS_GRAB_TAB" }),
  ]);
  assert.equal(first.success, true);
  assert.equal(second.success, true);
  assert.equal(harness.createdTabs, 1);
  assert.equal(first.tabId, second.tabId);
});

test("closing or reloading the leader promotes a healthy follower before the next command", async () => {
  const harness = createHarness();
  harness.browserTabs.set(11, { id: 11, windowId: 1 });
  harness.browserTabs.set(22, { id: 22, windowId: 1 });
  await harness.send({ action: "TAB_HEALTH", payload: readyHealth }, 11);
  await harness.send(
    { action: "TAB_HEALTH", payload: { ...readyHealth, visible: false } },
    22,
  );

  harness.tabUpdatedListeners[0]?.(11, { status: "loading" });
  harness.sentMessages.length = 0;
  const afterReload = await harness.send({
    action: "RECOVER_MISSED_ORDERS",
    force: true,
  });
  assert.equal(afterReload.success, true);
  assert.deepEqual(
    harness.sentMessages
      .filter((entry) => entry.message.action === "RECOVER_MISSED_ORDERS")
      .map((entry) => entry.tabId),
    [22],
  );

  harness.tabRemovedListeners[0]?.(22);
  const withoutLeader = await harness.send({
    action: "RECOVER_MISSED_ORDERS",
    force: true,
  });
  assert.equal(withoutLeader.success, false);
  assert.equal(withoutLeader.reason, "no_ready_tab");
});

test("an unreachable leader is demoted and the same command retries on a healthy follower", async () => {
  const harness = createHarness();
  harness.browserTabs.set(11, { id: 11, windowId: 1 });
  harness.browserTabs.set(22, { id: 22, windowId: 1 });
  await harness.send({ action: "TAB_HEALTH", payload: readyHealth }, 11);
  await harness.send(
    { action: "TAB_HEALTH", payload: { ...readyHealth, visible: false } },
    22,
  );

  harness.sentMessages.length = 0;
  harness.unreachableTabs.add(11);
  const routed = await harness.send({ action: "FORCE_FULL_SYNC" });

  assert.equal(routed.success, true);
  assert.deepEqual(
    harness.sentMessages
      .filter((entry) => entry.message.action === "FORCE_FULL_SYNC")
      .map((entry) => entry.tabId),
    [11, 22],
  );
});
