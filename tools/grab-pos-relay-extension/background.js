// background.js - MV3 service worker watchdog & idempotent order relay queue
importScripts('relay-queue.js');

const RELAY_TAB_URL = 'https://merchant.grab.com/';
const RELAY_TAB_QUERY = { url: 'https://merchant.grab.com/*' };
const WATCHDOG_ALARM = 'relay-tab-watchdog';
const QUEUE_ALARM = 'relay-queue-worker';

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

// ---------------- Order Relay Queue Implementation ----------------

async function getStorageData(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

async function setStorageData(obj) {
  return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
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

  // Attempt immediate processing
  processRelayQueue().catch(() => {});
  return {
    success: true,
    queued: true,
    retried: queueDecision.action === 'revived',
  };
}

let isProcessingQueue = false;
async function processRelayQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    const data = await getStorageData(['grabRelayQueue', 'recentOrders']);
    const queue = Array.isArray(data.grabRelayQueue) ? data.grabRelayQueue : [];
    if (queue.length === 0) {
      isProcessingQueue = false;
      return;
    }

    const now = Date.now();
    const updatedQueue = [];
    const recentOrders = Array.isArray(data.recentOrders) ? data.recentOrders : [];

    for (const item of queue) {
      if (item.isTerminal) {
        updatedQueue.push(item);
        continue;
      }

      if (now < item.nextRetryAt) {
        updatedQueue.push(item);
        continue;
      }

      item.attempts += 1;
      console.log(`[Grab POS Relay] Dispatching order ${item.displayID} (attempt ${item.attempts}/5)...`);

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (item.relaySecret) {
          headers['x-grab-relay-secret'] = item.relaySecret;
        }

        const res = await fetch(`${item.backendUrl}/api/webhooks/grabfood/relay`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            order: item.order,
            branch_id: item.branchId,
            merchant_id: item.merchantId,
          }),
        });

        if (res.ok) {
          console.log(`[Grab POS Relay] Successfully delivered order ${item.displayID} to POS backend`);

          // Record non-PII recent order entry
          recentOrders.unshift({
            orderID: item.orderID,
            displayID: item.displayID,
            items: item.order.itemInfo?.items?.map((i) => `${i.quantity}x ${i.name}`).join(', ') || '1 phần ăn',
            total: item.order.fare?.totalDisplay || item.order.fare?.subTotalDisplay || '0₫',
            time: new Date().toLocaleTimeString('vi-VN'),
            status: 'synced',
          });

          // Order resolved successfully; do not keep in active queue
          continue;
        }

        // Handle error responses
        const errJson = await res.json().catch(() => ({}));
        const errMsg = errJson.error || `HTTP ${res.status}`;
        item.lastError = errMsg;

        // Terminal errors: 400 Bad Request, 401 Auth, 403 Forbidden, 422 Unprocessable (unmapped item / total mismatch)
        if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 422) {
          console.error(`[Grab POS Relay] Terminal error for order ${item.displayID}: ${errMsg}`);
          item.isTerminal = true;

          recentOrders.unshift({
            orderID: item.orderID,
            displayID: item.displayID,
            items: item.order.itemInfo?.items?.map((i) => `${i.quantity}x ${i.name}`).join(', ') || '1 phần ăn',
            total: item.order.fare?.totalDisplay || item.order.fare?.subTotalDisplay || '0₫',
            time: new Date().toLocaleTimeString('vi-VN'),
            status: 'error',
            error: errMsg,
          });

          updatedQueue.push(item);
        } else {
          // Transient error: schedule exponential backoff retry (up to 5 attempts)
          if (item.attempts >= 5) {
            console.error(`[Grab POS Relay] Max retry attempts reached for order ${item.displayID}`);
            item.isTerminal = true;
            updatedQueue.push(item);
          } else {
            const delayMs = Math.min(60000, 5000 * Math.pow(2, item.attempts - 1));
            item.nextRetryAt = Date.now() + delayMs;
            console.warn(`[Grab POS Relay] Transient error (${errMsg}), retrying in ${delayMs / 1000}s`);
            updatedQueue.push(item);
          }
        }
      } catch (networkErr) {
        const errMsg = String(networkErr?.message || networkErr);
        item.lastError = errMsg;
        if (item.attempts >= 5) {
          item.isTerminal = true;
          updatedQueue.push(item);
        } else {
          const delayMs = Math.min(60000, 5000 * Math.pow(2, item.attempts - 1));
          item.nextRetryAt = Date.now() + delayMs;
          console.warn(`[Grab POS Relay] Network error (${errMsg}), retrying in ${delayMs / 1000}s`);
          updatedQueue.push(item);
        }
      }
    }

    await setStorageData({
      grabRelayQueue: updatedQueue.slice(-50), // keep bounded
      recentOrders: recentOrders.slice(0, 15),
    });
  } catch (err) {
    console.error('[Grab POS Relay] Queue processor error:', err);
  } finally {
    isProcessingQueue = false;
  }
}

// ---------------- Chrome Event Listeners ----------------

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
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 2 });
  chrome.alarms.create(QUEUE_ALARM, { periodInMinutes: 1 });
  ensureRelayTab();
  processRelayQueue();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ENQUEUE_ORDER') {
    enqueueOrder(request.payload?.order, request.payload?.merchantId).then((res) => {
      sendResponse(res);
    });
    return true; // async sendResponse
  }
  if (request.action === 'PROCESS_QUEUE') {
    processRelayQueue().then(() => sendResponse({ success: true }));
    return true;
  }
});
