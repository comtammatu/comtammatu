importScripts('relay-state.js');

const queuePolicy = ShopeeRelayState;
const QUEUE_KEY = 'shopeeRelayQueueV2';
const RETRY_ALARM = 'shopee-relay-retry';
const WATCHDOG_ALARM = 'relay-tab-watchdog';
const SETTINGS = ['backendUrl', 'branchId', 'relaySecret'];
let operations = Promise.resolve();
let draining = false;

// Serialize ledger changes across tabs. Network waits stay outside this lock.
function serialize(operation) {
  const result = operations.then(operation);
  operations = result.catch(() => {});
  return result;
}

async function state() {
  const values = await chrome.storage.local.get(QUEUE_KEY);
  return queuePolicy.prune(values[QUEUE_KEY], Date.now());
}

async function save(value) {
  await chrome.storage.local.set({ [QUEUE_KEY]: value });
}

async function acceptOrder(order) {
  if (!queuePolicy.validOrder(order) || JSON.stringify(order).length > 128 * 1024) {
    return { success: false, message: 'Đơn thiếu mã hoặc món hợp lệ' };
  }
  const values = await chrome.storage.local.get(SETTINGS);
  const target = queuePolicy.configuration(values);
  if (!target) return { success: false, message: 'Chưa cấu hình địa chỉ POS và chi nhánh hợp lệ' };
  const result = queuePolicy.enqueue(await state(), target, order, Date.now());
  if (result.status === 'full') return { success: false, message: 'Hàng đợi đã đầy. Kiểm tra kết nối POS' };
  await save(result.state);
  return { success: true, status: result.status };
}

async function deliver(row, settings) {
  try {
    const response = await fetch(row.target.backendUrl + '/api/webhooks/shopeefood/relay', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', 'x-shopee-relay-secret': settings.relaySecret || '' },
      body: JSON.stringify({ order: row.order, platform: 'shopee', branch_id: row.target.branchId, restaurant_id: row.order.restaurantId }),
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.success === true && Number.isSafeInteger(data.order_id) && data.order_id > 0) {
      return { success: true, orderId: data.order_id, orderNumber: data.order_number };
    }
    const message = response.status === 401
      ? 'POS từ chối xác thực. Kiểm tra khóa bảo mật'
      : response.status === 409 || response.status === 422
        ? 'Đơn cần kiểm tra trên POS'
        : 'POS chưa xác nhận tiếp nhận đơn';
    return { success: false, message };
  } catch {
    return { success: false, message: 'Không thể kết nối POS' };
  }
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    // Bound each wake. POS idempotency covers eviction after POST but before ACK.
    for (let index = 0; index < 10; index += 1) {
      const work = await serialize(async () => {
        const settings = await chrome.storage.local.get(SETTINGS);
        const target = queuePolicy.configuration(settings);
        const ledger = await state();
        const row = ledger.pending.find((entry) => queuePolicy.sameTarget(entry.target, target) && entry.nextAttemptAt <= Date.now());
        return row ? { row, settings } : null;
      });
      if (!work) break;
      const result = await deliver(work.row, work.settings);
      await serialize(async () => {
        const ledger = await state();
        const row = ledger.pending.find((entry) => entry.key === work.row.key);
        if (!row) return;
        if (result.success) {
          ledger.pending = ledger.pending.filter((entry) => entry.key !== row.key);
          ledger.sent.push({ key: row.key, sentAt: Date.now(), orderId: result.orderId });
          await save(ledger);
          const values = await chrome.storage.local.get('recentOrders');
          const recent = Array.isArray(values.recentOrders) ? values.recentOrders : [];
          await chrome.storage.local.set({
            lastSyncTime: Date.now(),
            recentOrders: [{
              orderId: row.order.orderId, displayId: row.order.displayId || row.order.orderCode || row.order.orderId,
              eater: 'ShopeeFood', items: row.order.items.map((item) => item.quantity + 'x ' + item.name).join(', '),
              total: result.orderNumber || 'Đã nhận', time: new Date().toLocaleTimeString('vi-VN'),
            }, ...recent].slice(0, 10),
          });
        } else {
          row.attempts += 1;
          row.nextAttemptAt = Date.now() + Math.min(5 * 60 * 1000, 30000 * 2 ** Math.min(row.attempts - 1, 4));
          row.lastError = result.message;
          await save(ledger);
        }
      });
    }
  } finally { draining = false; }
}

async function ensureRelayTab() {
  const values = await chrome.storage.local.get(SETTINGS);
  if (!queuePolicy.configuration(values)) return;
  const tabs = await chrome.tabs.query({ url: [
    'https://partner.shopee.vn/*', 'https://partner.shopeefood.vn/*',
    'https://merchant.shopeefood.vn/*', 'https://*.foodypos.com/*',
  ] });
  if (!tabs.length) await chrome.tabs.create({ url: 'https://partner.shopee.vn/', active: false });
  for (const tab of tabs) {
    if (tab.id !== undefined && (tab.discarded || tab.status === 'crashed')) await chrome.tabs.reload(tab.id);
  }
}

function start() {
  chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 0.5 });
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 2 });
  void drain().catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== 'SHOPEE_RELAY_ORDER') return;
  if (sender.id !== chrome.runtime.id || !queuePolicy.isMerchantUrl(sender.url || sender.tab?.url)) {
    respond({ success: false, message: 'Nguồn đơn không hợp lệ' });
    return;
  }
  serialize(() => acceptOrder(message.order)).then((result) => {
    respond(result);
    if (result.success) void drain().catch(() => {});
  }).catch(() => respond({ success: false, message: 'Không thể lưu đơn vào hàng đợi' }));
  return true;
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RETRY_ALARM) void drain().catch(() => {});
  if (alarm.name === WATCHDOG_ALARM) void ensureRelayTab().catch(() => {});
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && SETTINGS.some((key) => changes[key])) void drain().catch(() => {});
});
chrome.runtime.onInstalled.addListener(start);
chrome.runtime.onStartup.addListener(start);
start();
