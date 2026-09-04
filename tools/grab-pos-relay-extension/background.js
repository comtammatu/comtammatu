// background.js - MV3 service worker watchdog & idempotent order relay queue
importScripts('relay-queue.js');

const RELAY_TAB_URL = 'https://merchant.grab.com/';
const RELAY_TAB_QUERY = { url: 'https://merchant.grab.com/*' };
const WATCHDOG_ALARM = 'relay-tab-watchdog';
const QUEUE_ALARM = 'relay-queue-worker';
const RELAY_VERSION = chrome.runtime.getManifest().version;
const RELAY_POST_TIMEOUT_MS = 15000;
const inFlightOrderIds = new Set();

function formatVndAmount(value) {
  return `${Math.round(value).toLocaleString('vi-VN')}₫`;
}

async function ensureRelayTab() {
  try {
    const tabs = await chrome.tabs.query(RELAY_TAB_QUERY);

    if (tabs.length === 0) {
      console.log('[Grab POS Relay] No merchant tab found, opening one...');
      await chrome.tabs.create({ url: RELAY_TAB_URL });
      return;
    }

    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      // Discarded (Memory Saver) or crashed tabs run no content script; reload
      // restores the page and re-injects the relay.
      if (tab.discarded || tab.status === 'crashed') {
        console.log(`[Grab POS Relay] Relay tab ${tab.id} is ${tab.discarded ? 'discarded' : 'crashed'}, reloading...`);
        await chrome.tabs.reload(tab.id);
      }
    }
  } catch (err) {
    console.warn('[Grab POS Relay] Tab watchdog check failed:', err);
  }
}

async function getStorageData(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

async function setStorageData(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

async function refreshToolbarBadge() {
  const data = await getStorageData(['grabRelayQueue', 'grabItemSyncHealth']);
  const queue = Array.isArray(data.grabRelayQueue) ? data.grabRelayQueue : [];
  const text = self.GrabRelayQueue.toolbarBadgeText(queue, data.grabItemSyncHealth);
  await chrome.action.setBadgeBackgroundColor({ color: text ? '#b45309' : '#16a34a' });
  await chrome.action.setBadgeText({ text });
}

function recordRelayedOrder(relayed, item) {
  const next = Array.isArray(relayed) ? relayed.filter((entry) => entry?.orderID !== item.orderID) : [];
  next.unshift({
    orderID: item.orderID,
    displayID: item.displayID,
    contentFingerprint: item.contentFingerprint || null,
    relayedAt: Date.now(),
  });
  return next.slice(0, 200);
}

async function enqueueOrder(order, merchantId) {
  if (!order || !order.orderID) return { success: false, error: 'Invalid order' };

  const data = await getStorageData(['grabRelayQueue', 'backendUrl', 'branchId', 'relaySecret', 'recentOrders']);
  const branchId = Number(data.branchId);
  if (!Number.isInteger(branchId) || branchId <= 0) {
    return { success: false, error: 'Missing branch configuration' };
  }
  const queue = Array.isArray(data.grabRelayQueue) ? data.grabRelayQueue : [];
  const queueDecision = self.GrabRelayQueue.enqueueOrRevive(queue, order, {
    merchantId,
    branchId,
    backendUrl: data.backendUrl || 'http://localhost:3000',
    relaySecret: data.relaySecret || '',
  });

  if (!queueDecision.ok) {
    return { success: false, error: queueDecision.error || 'Invalid order' };
  }
  if (queueDecision.action === 'existing') {
    console.log(`[Grab POS Relay] Order ${order.displayID} is already in relay queue`);
    return { success: true, queued: true };
  }

  await setStorageData({ grabRelayQueue: queueDecision.queue });
  if (queueDecision.action === 'revived') {
    console.log(`[Grab POS Relay] Reopened terminal order ${order.displayID} with fresh Grab data`);
  }
  if (queueDecision.action === 'updated') {
    console.log(`[Grab POS Relay] Replaced queued order ${order.displayID} after Grab revision`);
  }

  processRelayQueue().catch(() => {});
  return {
    success: true,
    queued: true,
    retried: queueDecision.action === 'revived' || queueDecision.action === 'updated',
  };
}

async function postRelayOrder(item) {
  const headers = { 'Content-Type': 'application/json' };
  if (item.relaySecret) {
    headers['x-grab-relay-secret'] = item.relaySecret;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), RELAY_POST_TIMEOUT_MS);
  try {
    const res = await fetch(`${item.backendUrl}/api/webhooks/grabfood/relay`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        order: item.order,
        branch_id: item.branchId,
        merchant_id: item.merchantId,
        relay_version: RELAY_VERSION,
        action: item.action || item.order?.action || 'create',
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
  console.log(`[Grab POS Relay] Dispatching order ${item.displayID} (attempt ${(item.attempts || 0) + 1}/5)...`);
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
          items: item.order.itemInfo?.items?.map((i) => `${i.quantity}x ${i.name}`).join(', ') || '1 phần ăn',
          total: Number.isFinite(responseJson.total_amount)
            ? formatVndAmount(responseJson.total_amount)
            : item.order.fare?.subTotalDisplay || '0₫',
          time: new Date().toLocaleTimeString('vi-VN'),
          status: 'synced',
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
            items: item.order.itemInfo?.items?.map((i) => `${i.quantity}x ${i.name}`).join(', ') || '1 phần ăn',
            total: item.order.fare?.subTotalDisplay || '0₫',
            time: new Date().toLocaleTimeString('vi-VN'),
            status: 'error',
            error: errMsg,
          }
        : null,
      relayed: false,
    };
  } catch (networkErr) {
    const errMsg = String(networkErr?.name === 'AbortError' ? 'timeout' : networkErr?.message || networkErr);
    const outcome = self.GrabRelayQueue.applyDispatchOutcome(item, {
      ok: false,
      error: errMsg,
      now: Date.now(),
    });
    return { keep: outcome.keep, item: outcome.item, recentEntry: null, relayed: false };
  }
}

async function processRelayQueue() {
  const data = await getStorageData(['grabRelayQueue', 'recentOrders', 'grabRelayedOrders']);
  const persisted = Array.isArray(data.grabRelayQueue) ? data.grabRelayQueue : [];
  if (persisted.length === 0) return;

  const now = Date.now();
  const jobs = self.GrabRelayQueue.selectDispatchJobs(persisted, now, inFlightOrderIds);
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

  const settled = await Promise.allSettled(started.map((item) => dispatchQueueItem(item)));

  const latest = await getStorageData(['grabRelayQueue', 'recentOrders', 'grabRelayedOrders']);
  let nextQueue = Array.isArray(latest.grabRelayQueue) ? latest.grabRelayQueue : persisted;
  let recentOrders = Array.isArray(latest.recentOrders) ? latest.recentOrders : [];
  let relayedOrders = Array.isArray(latest.grabRelayedOrders) ? latest.grabRelayedOrders : [];

  settled.forEach((result, index) => {
    const startedItem = started[index];
    if (!startedItem) return;
    inFlightOrderIds.delete(startedItem.orderID);
    if (result.status !== 'fulfilled') {
      const outcome = self.GrabRelayQueue.applyDispatchOutcome(startedItem, {
        ok: false,
        error: String(result.reason || 'dispatch failed'),
        now: Date.now(),
      });
      nextQueue = self.GrabRelayQueue.mergeQueueByOrderId(nextQueue, [outcome.item]);
      return;
    }
    if (result.value.recentEntry) {
      recentOrders = [result.value.recentEntry, ...recentOrders];
    }
    if (result.value.relayed) {
      relayedOrders = recordRelayedOrder(relayedOrders, startedItem);
    }
    if (result.value.keep) {
      nextQueue = self.GrabRelayQueue.mergeQueueByOrderId(nextQueue, [result.value.item]);
    } else {
      nextQueue = nextQueue.filter((item) => item.orderID !== startedItem.orderID);
    }
  });

  await setStorageData({
    grabRelayQueue: nextQueue.slice(-50),
    recentOrders: recentOrders.slice(0, 15),
    grabRelayedOrders: relayedOrders.slice(0, 200),
  });
}

async function recoverGrabTabs(options = {}) {
  processRelayQueue().catch(() => {});
  try {
    const tabs = await chrome.tabs.query(RELAY_TAB_QUERY);
    const message = {
      action: 'RECOVER_MISSED_ORDERS',
      force: options.force === true,
    };
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      chrome.tabs.sendMessage(tab.id, message, () => {
        void chrome.runtime.lastError;
      });
    }
  } catch (err) {
    console.warn('[Grab POS Relay] Wake recover failed:', err);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHDOG_ALARM) {
    ensureRelayTab();
  } else if (alarm.name === QUEUE_ALARM) {
    processRelayQueue();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
  refreshToolbarBadge().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
  ensureRelayTab();
  processRelayQueue();
  refreshToolbarBadge().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.grabRelayQueue || changes.grabItemSyncHealth) {
    refreshToolbarBadge().catch(() => {});
  }
});

if (chrome.idle?.onStateChanged) {
  chrome.idle.onStateChanged.addListener((state) => {
    if (state === 'active') {
      recoverGrabTabs();
    }
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_TAB_ID') {
    sendResponse({ tabId: sender.tab?.id ?? null });
    return false;
  }
  if (request.action === 'ENQUEUE_ORDER') {
    enqueueOrder(request.payload?.order, request.payload?.merchantId).then((res) => {
      sendResponse(res);
    });
    return true;
  }
  if (request.action === 'PROCESS_QUEUE') {
    processRelayQueue().then(() => sendResponse({ success: true }));
    return true;
  }
  if (request.action === 'RETRY_QUEUE_ITEM') {
    enqueueOrder(request.payload?.order, request.payload?.merchantId).then((res) => {
      sendResponse(res);
    });
    return true;
  }
  if (request.action === 'RECOVER_MISSED_ORDERS') {
    recoverGrabTabs({ force: request.force === true }).then(() => sendResponse({ success: true }));
    return true;
  }
});
