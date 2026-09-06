// background.js - MV3 service worker tab coordinator & idempotent order relay queue
importScripts("relay-queue.js", "relay-tabs.js", "relay-log.js");

const RELAY_TAB_URL = "https://merchant.grab.com/";
const RELAY_TAB_QUERY = { url: "https://merchant.grab.com/*" };
const WATCHDOG_ALARM = "relay-tab-watchdog";
const QUEUE_ALARM = "relay-queue-worker";
const RELAY_VERSION = chrome.runtime.getManifest().version;
const RELAY_POST_TIMEOUT_MS = 15000;
const TAB_STATE_SESSION_KEY = "grabRelayTabCoordinatorV1";
const LOCAL_LOG_STORAGE_KEY = "grabRelayLogsV1";
const inFlightOrderIds = new Set();
let coordinatorState = { tabs: [], leaderTabId: null, generation: 0 };
let coordinatorTail = Promise.resolve();
let logTail = Promise.resolve();
let openOrFocusPromise = null;

function formatVndAmount(value) {
  return `${Math.round(value).toLocaleString("vi-VN")}₫`;
}

async function getStorageData(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

async function setStorageData(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

async function getSessionData(key) {
  if (!chrome.storage.session) return null;
  return new Promise((resolve) => {
    chrome.storage.session.get([key], (result) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(result?.[key] || null);
    });
  });
}

async function setSessionData(key, value) {
  if (!chrome.storage.session) return;
  await new Promise((resolve) => {
    chrome.storage.session.set({ [key]: value }, () => resolve());
  });
}

async function loadCoordinatorState() {
  const saved = await getSessionData(TAB_STATE_SESSION_KEY);
  if (saved && Array.isArray(saved.tabs)) {
    coordinatorState = {
      tabs: saved.tabs,
      leaderTabId: Number.isInteger(saved.leaderTabId)
        ? saved.leaderTabId
        : null,
      generation: Number.isInteger(saved.generation) ? saved.generation : 0,
    };
  }
  const result = self.GrabRelayTabs.reconcile(coordinatorState, Date.now());
  coordinatorState = result.state;
  await setSessionData(TAB_STATE_SESSION_KEY, coordinatorState);
}

const coordinatorReady = loadCoordinatorState().catch((error) => {
  console.warn("[Grab POS Relay] Cannot restore tab coordinator:", error);
});

function writeLocalLog(event) {
  logTail = logTail
    .then(async () => {
      const data = await getStorageData([LOCAL_LOG_STORAGE_KEY]);
      const next = self.GrabRelayLog.append(
        data[LOCAL_LOG_STORAGE_KEY],
        event,
        Date.now(),
      );
      await setStorageData({ [LOCAL_LOG_STORAGE_KEY]: next });
    })
    .catch((error) => {
      console.warn("[Grab POS Relay] Cannot persist diagnostic log:", error);
    });
  return logTail;
}

async function sendTabRole(tabId, role, generation) {
  if (!Number.isInteger(tabId)) return;
  await new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { action: "SET_TAB_ROLE", role, generation },
      () => {
        void chrome.runtime.lastError;
        resolve();
      },
    );
  });
}

async function publishTabRoles() {
  await Promise.all(
    coordinatorState.tabs.map((tab) =>
      sendTabRole(
        tab.tabId,
        tab.tabId === coordinatorState.leaderTabId ? "leader" : "follower",
        coordinatorState.generation,
      ),
    ),
  );
}

async function mutateCoordinator(mutator, reason) {
  await coordinatorReady;
  const mutated = mutator(coordinatorState);
  const result = self.GrabRelayTabs.reconcile(mutated, Date.now());
  coordinatorState = result.state;
  await setSessionData(TAB_STATE_SESSION_KEY, coordinatorState);
  if (result.changed) {
    const lostWithoutReplacement =
      result.previousLeaderTabId !== null && result.leaderTabId === null;
    await writeLocalLog({
      level: lostWithoutReplacement ? "warning" : "info",
      area: "grab_session",
      code: result.leaderTabId === null ? "leader_lost" : "leader_changed",
      message:
        result.leaderTabId === null
          ? "Không còn tab Grab đủ điều kiện trực đơn."
          : `Tab ${result.leaderTabId} đang trực đơn Grab.`,
      context: {
        previousTabId: result.previousLeaderTabId,
        leaderTabId: result.leaderTabId,
        generation: coordinatorState.generation,
        reason,
      },
    });
    await publishTabRoles();
  }
  if (result.changed) {
    refreshToolbarBadge().catch(() => {});
  }
  return self.GrabRelayTabs.diagnostics(coordinatorState, Date.now());
}

function queueCoordinatorMutation(mutator, reason) {
  const operation = coordinatorTail.then(() =>
    mutateCoordinator(mutator, reason),
  );
  coordinatorTail = operation.catch(() => {});
  return operation;
}

async function getRelayDiagnostics() {
  await coordinatorReady;
  return self.GrabRelayTabs.diagnostics(coordinatorState, Date.now());
}

async function watchRelayTabs() {
  const diagnostics = await queueCoordinatorMutation(
    (state) => state,
    "watchdog",
  );
  if (!diagnostics.leaderTabId) return diagnostics;
  try {
    const tab = await chrome.tabs.get(diagnostics.leaderTabId);
    if (tab.discarded) {
      await writeLocalLog({
        level: "warning",
        area: "grab_session",
        code: "leader_discarded",
        message: "Tab đang trực bị Chrome tạm ngưng và đang được tải lại.",
        context: { tabId: diagnostics.leaderTabId },
      });
      await chrome.tabs.reload(diagnostics.leaderTabId);
    }
  } catch {
    await queueCoordinatorMutation(
      (state) => self.GrabRelayTabs.removeTab(state, diagnostics.leaderTabId),
      "leader_missing",
    );
  }
  return diagnostics;
}

async function refreshToolbarBadge() {
  const data = await getStorageData(["grabRelayQueue", "grabItemSyncHealth"]);
  const queue = Array.isArray(data.grabRelayQueue) ? data.grabRelayQueue : [];
  const queueText = self.GrabRelayQueue.toolbarBadgeText(
    queue,
    data.grabItemSyncHealth,
  );
  const diagnostics = await getRelayDiagnostics();
  const text = queueText || (diagnostics.status === "ready" ? "" : "!");
  await chrome.action.setBadgeBackgroundColor({
    color: text ? "#b45309" : "#16a34a",
  });
  await chrome.action.setBadgeText({ text });
}

function recordRelayedOrder(relayed, item) {
  const next = Array.isArray(relayed)
    ? relayed.filter((entry) => entry?.orderID !== item.orderID)
    : [];
  next.unshift({
    orderID: item.orderID,
    displayID: item.displayID,
    contentFingerprint: item.contentFingerprint || null,
    relayedAt: Date.now(),
  });
  return next.slice(0, 200);
}

async function enqueueOrder(order, merchantId) {
  if (!order || !order.orderID)
    return { success: false, error: "Invalid order" };

  const data = await getStorageData([
    "grabRelayQueue",
    "backendUrl",
    "branchId",
    "relaySecret",
    "recentOrders",
  ]);
  const branchId = Number(data.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return { success: false, error: "Missing branch configuration" };
  }
  const queue = Array.isArray(data.grabRelayQueue) ? data.grabRelayQueue : [];
  const queueDecision = self.GrabRelayQueue.enqueueOrRevive(queue, order, {
    merchantId,
    branchId,
    backendUrl: data.backendUrl || "http://localhost:3000",
    relaySecret: data.relaySecret || "",
  });

  if (!queueDecision.ok) {
    return { success: false, error: queueDecision.error || "Invalid order" };
  }
  if (queueDecision.action === "existing") {
    console.log(
      `[Grab POS Relay] Order ${order.displayID} is already in relay queue`,
    );
    return { success: true, queued: true };
  }

  await setStorageData({ grabRelayQueue: queueDecision.queue });
  if (queueDecision.action === "revived") {
    console.log(
      `[Grab POS Relay] Reopened terminal order ${order.displayID} with fresh Grab data`,
    );
  }
  if (queueDecision.action === "updated") {
    console.log(
      `[Grab POS Relay] Replaced queued order ${order.displayID} after Grab revision`,
    );
  }

  processRelayQueue().catch(() => {});
  return {
    success: true,
    queued: true,
    retried:
      queueDecision.action === "revived" || queueDecision.action === "updated",
  };
}

async function postRelayOrder(item) {
  const headers = { "Content-Type": "application/json" };
  if (item.relaySecret) {
    headers["x-grab-relay-secret"] = item.relaySecret;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RELAY_POST_TIMEOUT_MS);
  try {
    const res = await fetch(`${item.backendUrl}/api/webhooks/grabfood/relay`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        order: item.order,
        branch_id: item.branchId,
        merchant_id: item.merchantId,
        relay_version: RELAY_VERSION,
        action: item.action || item.order?.action || "create",
        content_fingerprint: item.contentFingerprint || undefined,
      }),
    });
    const responseJson = await res.json().catch(() => ({}));
    return { res, responseJson };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function dispatchQueueItem(item) {
  console.log(
    `[Grab POS Relay] Dispatching order ${item.displayID} (attempt ${(item.attempts || 0) + 1}/5)...`,
  );
  try {
    const { res, responseJson } = await postRelayOrder(item);
    if (res.ok) {
      const outcome = self.GrabRelayQueue.applyDispatchOutcome(item, {
        ok: true,
        status: res.status,
        now: Date.now(),
      });
      return {
        keep: outcome.keep,
        item: outcome.item,
        recentEntry: {
          orderID: item.orderID,
          displayID: item.displayID,
          items:
            item.order.itemInfo?.items
              ?.map((i) => `${i.quantity}x ${i.name}`)
              .join(", ") || "1 phần ăn",
          total: Number.isFinite(responseJson.total_amount)
            ? formatVndAmount(responseJson.total_amount)
            : item.order.fare?.subTotalDisplay || "0₫",
          time: new Date().toLocaleTimeString("vi-VN"),
          status: "synced",
        },
        relayed: true,
      };
    }

    const errMsg = responseJson.error || `HTTP ${res.status}`;
    const outcome = self.GrabRelayQueue.applyDispatchOutcome(item, {
      ok: false,
      status: res.status,
      error: errMsg,
      now: Date.now(),
    });
    return {
      keep: outcome.keep,
      item: outcome.item,
      recentEntry: outcome.item.isTerminal
        ? {
            orderID: item.orderID,
            displayID: item.displayID,
            items:
              item.order.itemInfo?.items
                ?.map((i) => `${i.quantity}x ${i.name}`)
                .join(", ") || "1 phần ăn",
            total: item.order.fare?.subTotalDisplay || "0₫",
            time: new Date().toLocaleTimeString("vi-VN"),
            status: "error",
            error: errMsg,
          }
        : null,
      relayed: false,
    };
  } catch (networkErr) {
    const errMsg = String(
      networkErr?.name === "AbortError"
        ? "timeout"
        : networkErr?.message || networkErr,
    );
    const outcome = self.GrabRelayQueue.applyDispatchOutcome(item, {
      ok: false,
      error: errMsg,
      now: Date.now(),
    });
    return {
      keep: outcome.keep,
      item: outcome.item,
      recentEntry: null,
      relayed: false,
    };
  }
}

async function processRelayQueue() {
  const data = await getStorageData([
    "grabRelayQueue",
    "recentOrders",
    "grabRelayedOrders",
  ]);
  const persisted = Array.isArray(data.grabRelayQueue)
    ? data.grabRelayQueue
    : [];
  if (persisted.length === 0) return;

  const now = Date.now();
  const jobs = self.GrabRelayQueue.selectDispatchJobs(
    persisted,
    now,
    inFlightOrderIds,
  );
  if (jobs.length === 0) return;

  const byId = new Map(persisted.map((item) => [String(item.orderID), item]));
  const started = [];
  for (const job of jobs) {
    const item = byId.get(job.orderID);
    if (!item || inFlightOrderIds.has(item.orderID)) continue;
    inFlightOrderIds.add(item.orderID);
    started.push(item);
  }
  if (started.length === 0) return;

  const settled = await Promise.allSettled(
    started.map((item) => dispatchQueueItem(item)),
  );

  const latest = await getStorageData([
    "grabRelayQueue",
    "recentOrders",
    "grabRelayedOrders",
  ]);
  let nextQueue = Array.isArray(latest.grabRelayQueue)
    ? latest.grabRelayQueue
    : persisted;
  let recentOrders = Array.isArray(latest.recentOrders)
    ? latest.recentOrders
    : [];
  let relayedOrders = Array.isArray(latest.grabRelayedOrders)
    ? latest.grabRelayedOrders
    : [];

  settled.forEach((result, index) => {
    const startedItem = started[index];
    if (!startedItem) return;
    inFlightOrderIds.delete(startedItem.orderID);
    if (result.status !== "fulfilled") {
      const outcome = self.GrabRelayQueue.applyDispatchOutcome(startedItem, {
        ok: false,
        error: String(result.reason || "dispatch failed"),
        now: Date.now(),
      });
      nextQueue = self.GrabRelayQueue.mergeQueueByOrderId(nextQueue, [
        outcome.item,
      ]);
      return;
    }
    if (result.value.recentEntry) {
      recentOrders = [result.value.recentEntry, ...recentOrders];
    }
    if (result.value.relayed) {
      relayedOrders = recordRelayedOrder(relayedOrders, startedItem);
    }
    if (result.value.keep) {
      nextQueue = self.GrabRelayQueue.mergeQueueByOrderId(nextQueue, [
        result.value.item,
      ]);
    } else {
      nextQueue = nextQueue.filter(
        (item) => item.orderID !== startedItem.orderID,
      );
    }
  });

  await setStorageData({
    grabRelayQueue: nextQueue.slice(-50),
    recentOrders: recentOrders.slice(0, 15),
    grabRelayedOrders: relayedOrders.slice(0, 200),
  });
}

async function routeToLeader(action, payload = {}) {
  processRelayQueue().catch(() => {});
  const attemptedTabIds = new Set();

  while (true) {
    const diagnostics = await queueCoordinatorMutation(
      (state) => state,
      `route_${action}`,
    );
    const leaderTabId = diagnostics.leaderTabId;
    if (!leaderTabId || attemptedTabIds.has(leaderTabId)) {
      const reason =
        attemptedTabIds.size > 0 ? "leader_unreachable" : "no_ready_tab";
      await writeLocalLog({
        level: "warning",
        area: "grab_session",
        code:
          reason === "leader_unreachable"
            ? "command_failed_all_leaders"
            : "command_rejected_no_leader",
        message:
          reason === "leader_unreachable"
            ? "Không thể gửi lệnh đến các tab Grab sẵn sàng."
            : "Không thể gửi lệnh vì chưa có tab Grab sẵn sàng.",
        context: {
          action,
          status: diagnostics.status,
          tabCount: diagnostics.tabCount,
        },
      });
      return { success: false, reason, diagnostics };
    }

    attemptedTabIds.add(leaderTabId);
    const delivery = await new Promise((resolve) => {
      chrome.tabs.sendMessage(
        leaderTabId,
        { action, ...payload },
        (response) => {
          resolve({
            reachable: !chrome.runtime.lastError,
            response,
          });
        },
      );
    });
    if (delivery.reachable) {
      return delivery.response?.success === false
        ? { ...delivery.response, diagnostics }
        : { success: true, diagnostics };
    }

    await writeLocalLog({
      level: "warning",
      area: "grab_session",
      code: "leader_unreachable",
      message: "Tab chính không phản hồi; đang chuyển sang tab phụ.",
      context: { action, tabId: leaderTabId },
    });
    await queueCoordinatorMutation(
      (state) => self.GrabRelayTabs.markUnavailable(state, leaderTabId),
      "leader_unreachable",
    );
  }
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true });
  if (Number.isInteger(tab.windowId) && chrome.windows?.update) {
    await chrome.windows
      .update(tab.windowId, { focused: true })
      .catch(() => {});
  }
  return { success: true, created: false, tabId: tab.id };
}

async function openOrFocusGrabTab() {
  if (openOrFocusPromise) return openOrFocusPromise;
  openOrFocusPromise = (async () => {
    await coordinatorReady;
    const diagnostics = await getRelayDiagnostics();
    const candidateIds = [
      diagnostics.leaderTabId,
      ...coordinatorState.tabs.map((tab) => tab.tabId),
    ].filter(
      (value, index, all) =>
        Number.isInteger(value) && all.indexOf(value) === index,
    );

    for (const tabId of candidateIds) {
      try {
        return await focusTab(await chrome.tabs.get(tabId));
      } catch {
        // The registry is reconciled by tabs.onRemoved or the next heartbeat.
      }
    }

    const existing = await chrome.tabs.query(RELAY_TAB_QUERY);
    const usable = existing.find((tab) => Number.isInteger(tab.id));
    if (usable) return focusTab(usable);

    const created = await chrome.tabs.create({
      url: RELAY_TAB_URL,
      active: true,
    });
    await writeLocalLog({
      level: "info",
      area: "grab_session",
      code: "manual_tab_opened",
      message: "Đã mở Grab Merchant theo yêu cầu của nhân viên.",
      context: { tabId: created.id },
    });
    return { success: true, created: true, tabId: created.id ?? null };
  })().finally(() => {
    openOrFocusPromise = null;
  });
  return openOrFocusPromise;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHDOG_ALARM) {
    watchRelayTabs().catch(() => {});
  } else if (alarm.name === QUEUE_ALARM) {
    processRelayQueue();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
  chrome.storage.local.remove("grabRelayLeader");
  refreshToolbarBadge().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
  watchRelayTabs().catch(() => {});
  processRelayQueue();
  refreshToolbarBadge().catch(() => {});
});

chrome.tabs.onRemoved.addListener((tabId) => {
  queueCoordinatorMutation(
    (state) => self.GrabRelayTabs.removeTab(state, tabId),
    "tab_removed",
  ).catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== "loading") return;
  queueCoordinatorMutation(
    (state) => self.GrabRelayTabs.markUnavailable(state, tabId),
    "tab_loading",
  ).catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.grabRelayQueue || changes.grabItemSyncHealth) {
    refreshToolbarBadge().catch(() => {});
  }
});

if (chrome.idle?.onStateChanged) {
  chrome.idle.onStateChanged.addListener((state) => {
    if (state === "active") {
      routeToLeader("RECOVER_MISSED_ORDERS").catch(() => {});
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TAB_HEALTH") {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId)) {
      sendResponse({ success: false, reason: "missing_tab_id" });
      return false;
    }
    queueCoordinatorMutation(
      (state) =>
        self.GrabRelayTabs.upsertTab(state, tabId, request.payload, Date.now()),
      request.payload?.reason || "heartbeat",
    )
      .then((diagnostics) => {
        sendResponse({
          success: true,
          role: diagnostics.leaderTabId === tabId ? "leader" : "follower",
          generation: diagnostics.generation,
          diagnostics,
        });
      })
      .catch(() =>
        sendResponse({ success: false, reason: "coordinator_error" }),
      );
    return true;
  }
  if (request.action === "TAB_UNAVAILABLE") {
    const tabId = sender.tab?.id;
    if (Number.isInteger(tabId)) {
      queueCoordinatorMutation(
        (state) => self.GrabRelayTabs.markUnavailable(state, tabId),
        request.reason || "tab_unavailable",
      ).catch(() => {});
    }
    return false;
  }
  if (request.action === "GET_RELAY_DIAGNOSTICS") {
    getRelayDiagnostics().then((diagnostics) =>
      sendResponse({ success: true, diagnostics }),
    );
    return true;
  }
  if (request.action === "OPEN_OR_FOCUS_GRAB_TAB") {
    openOrFocusGrabTab()
      .then(sendResponse)
      .catch(() => {
        sendResponse({ success: false, reason: "cannot_open_tab" });
      });
    return true;
  }
  if (request.action === "GET_LOCAL_LOGS") {
    getStorageData([LOCAL_LOG_STORAGE_KEY]).then((data) => {
      const logs = self.GrabRelayLog.prune(
        data[LOCAL_LOG_STORAGE_KEY],
        Date.now(),
      );
      sendResponse({ success: true, logs });
    });
    return true;
  }
  if (request.action === "LOG_EVENT") {
    writeLocalLog({
      ...request.payload,
      context: {
        ...request.payload?.context,
        tabId: sender.tab?.id ?? null,
      },
    }).then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === "CLEAR_LOCAL_LOGS") {
    setStorageData({ [LOCAL_LOG_STORAGE_KEY]: [] }).then(() =>
      sendResponse({ success: true }),
    );
    return true;
  }
  if (request.action === "ENQUEUE_ORDER") {
    enqueueOrder(request.payload?.order, request.payload?.merchantId).then(
      (res) => {
        sendResponse(res);
      },
    );
    return true;
  }
  if (request.action === "PROCESS_QUEUE") {
    processRelayQueue().then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === "RETRY_QUEUE_ITEM") {
    enqueueOrder(request.payload?.order, request.payload?.merchantId).then(
      (res) => {
        sendResponse(res);
      },
    );
    return true;
  }
  if (request.action === "RECOVER_MISSED_ORDERS") {
    routeToLeader("RECOVER_MISSED_ORDERS", {
      force: request.force === true,
    }).then(sendResponse);
    return true;
  }
  if (request.action === "FORCE_FULL_SYNC") {
    routeToLeader("FORCE_FULL_SYNC", { force: true }).then(sendResponse);
    return true;
  }
});
