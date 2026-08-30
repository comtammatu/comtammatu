// content.js - Content script running in merchant.grab.com
(function () {
  const extVersion = chrome.runtime.getManifest()?.version || '1.1.11';
  console.log(`[Grab POS Relay v${extVersion}] Content script active`);

  // Inject injected.js into page context
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);

  // Floating Status Indicator on GrabMerchant Web page
  const badge = document.createElement('div');
  badge.id = 'comtammatu-pos-relay-badge';
  badge.style.cssText = `
    position: fixed;
    bottom: 12px;
    right: 12px;
    z-index: 999999;
    background: rgba(15, 23, 42, 0.94);
    backdrop-filter: blur(4px);
    color: #f8fafc;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 5px 10px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    display: flex;
    align-items: center;
    gap: 6px;
    transition: all 0.2s ease;
    user-select: none;
  `;
  badge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;"></span> <strong>POS Relay</strong> <span style="font-size:11px;color:#94a3b8;">v${extVersion}</span>`;

  function ensureBadgeAttached() {
    if (!document.getElementById('comtammatu-pos-relay-badge')) {
      if (document.body) {
        document.body.appendChild(badge);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (document.body && !document.getElementById('comtammatu-pos-relay-badge')) {
            document.body.appendChild(badge);
          }
        });
      }
    }
  }

  ensureBadgeAttached();

  function updateBadge(message, isSuccess = true) {
    ensureBadgeAttached();
    badge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isSuccess ? '#22c55e' : '#ef4444'};"></span> <strong>POS v${extVersion}</strong>: ${message}`;
    badge.style.borderColor = isSuccess ? '#22c55e' : '#ef4444';
  }

  function sendCommandToInjected(command, payload) {
    window.postMessage(
      {
        source: 'GRAB_POS_RELAY_CONTENT',
        command: command,
        payload: payload,
      },
      '*'
    );
  }

  const VIETNAM_BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  function getVietnamBusinessDateKey(value = new Date()) {
    const parts = VIETNAM_BUSINESS_DATE_FORMATTER.formatToParts(value);
    const datePart = (type) => parts.find((part) => part.type === type)?.value;
    return `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
  }

  const ITEM_SYNC_STATE_STORAGE_KEY = 'grabItemSyncStateV1';
  const ITEM_STATUS_POLL_INTERVAL_MS = 30 * 1000;
  const INITIAL_ITEM_STATUS_POLL_DELAY_MS = 2 * 1000;
  const STOCK_FLUSH_DELAY_MS = 5 * 60 * 1000;
  const STOCK_RETRY_DELAY_MS = 30 * 1000;
  const LOW_STOCK_IMMEDIATE_THRESHOLD = 3;

  // Cache item and modifier state independently. Only item entries carry stock.
  const itemStatusCache = new Map(); // entity:id -> { status, stockSignature? }
  const pendingStockUpdates = new Map(); // itemId -> { currentStock, signature, dueAt }
  const pendingItemSyncs = new Map(); // operation:itemId -> { requestId, signature, desiredValue, scopeKey }
  let grabSessionExpired = false;
  let itemStatusPollInFlight = false;
  let forceSyncQueued = false;
  let itemStatusBusinessDateKey = getVietnamBusinessDateKey();
  let itemSyncScopeKey = null;
  let pendingStockFlushTimer = null;
  let itemSyncPersistTail = Promise.resolve();

  function getStoredValues(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result) => resolve(result || {}));
    });
  }

  function setStoredValues(values) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(values, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  }

  function isConfirmedState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const validStatus = value.status === undefined || typeof value.status === 'string';
    const validStock = value.stockSignature === undefined || typeof value.stockSignature === 'string';
    return validStatus && validStock;
  }

  function isPendingStockState(value) {
    return (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Number.isInteger(value.currentStock) &&
      value.currentStock >= 1 &&
      value.currentStock <= 9999 &&
      value.signature === `enabled:${value.currentStock}` &&
      Number.isFinite(value.dueAt)
    );
  }

  async function hydrateItemSyncState() {
    try {
      const storedValues = await getStoredValues([ITEM_SYNC_STATE_STORAGE_KEY]);
      const storedState = storedValues[ITEM_SYNC_STATE_STORAGE_KEY];
      if (!storedState || typeof storedState !== 'object' || Array.isArray(storedState)) return;

      itemSyncScopeKey = typeof storedState.scopeKey === 'string' ? storedState.scopeKey : null;
      if (typeof storedState.businessDateKey === 'string') {
        itemStatusBusinessDateKey = storedState.businessDateKey;
      }

      if (storedState.confirmed && typeof storedState.confirmed === 'object') {
        for (const [cacheKey, value] of Object.entries(storedState.confirmed)) {
          if (/^(item:VNITE|modifier:VNMOD)/.test(cacheKey) && isConfirmedState(value)) {
            itemStatusCache.set(cacheKey, value);
          }
        }
      }

      if (storedState.pendingStock && typeof storedState.pendingStock === 'object') {
        for (const [itemId, value] of Object.entries(storedState.pendingStock)) {
          if (itemId.startsWith('VNITE') && isPendingStockState(value)) {
            pendingStockUpdates.set(itemId, value);
          }
        }
      }
    } catch (error) {
      console.warn('[Grab POS Relay] Failed hydrating item sync state:', error);
    }
  }

  function persistItemSyncState() {
    const confirmed = Object.fromEntries(itemStatusCache);
    const pendingStock = Object.fromEntries(pendingStockUpdates);
    const storedState = {
      scopeKey: itemSyncScopeKey,
      businessDateKey: itemStatusBusinessDateKey,
      confirmed,
      pendingStock,
    };

    itemSyncPersistTail = itemSyncPersistTail
      .then(() => setStoredValues({ [ITEM_SYNC_STATE_STORAGE_KEY]: storedState }))
      .catch((error) => {
        console.warn('[Grab POS Relay] Failed persisting item sync state:', error);
      });
    return itemSyncPersistTail;
  }

  function clearPendingStockFlushTimer() {
    if (pendingStockFlushTimer !== null) {
      clearTimeout(pendingStockFlushTimer);
      pendingStockFlushTimer = null;
    }
  }

  async function ensureItemSyncScope(backendUrl, branchId) {
    const normalizedBackendUrl = backendUrl.replace(/\/+$/, '');
    const nextScopeKey = `${normalizedBackendUrl}|branch:${branchId}`;
    if (nextScopeKey === itemSyncScopeKey) return;

    itemSyncScopeKey = nextScopeKey;
    itemStatusBusinessDateKey = getVietnamBusinessDateKey();
    itemStatusCache.clear();
    pendingStockUpdates.clear();
    pendingItemSyncs.clear();
    clearPendingStockFlushTimer();
    await persistItemSyncState();
  }

  function refreshItemStatusBusinessDate() {
    const nextBusinessDateKey = getVietnamBusinessDateKey();
    if (nextBusinessDateKey === itemStatusBusinessDateKey) return false;

    itemStatusBusinessDateKey = nextBusinessDateKey;
    for (const [cacheKey, value] of itemStatusCache) {
      if (value.status !== 'UNAVAILABLE_TODAY') continue;

      const nextValue = { ...value };
      delete nextValue.status;
      if (Object.keys(nextValue).length === 0) {
        itemStatusCache.delete(cacheKey);
      } else {
        itemStatusCache.set(cacheKey, nextValue);
      }
    }
    persistItemSyncState();
    return true;
  }

  function shouldSyncAvailabilityStatus(currentStatus, previousStatus, forceAll, reconcileTodayStatuses) {
    return (
      forceAll ||
      previousStatus !== currentStatus ||
      (reconcileTodayStatuses && currentStatus === 'UNAVAILABLE_TODAY')
    );
  }

  function shouldFlushStockImmediately(currentStock, previousStockSignature, forceAll, statusChanged) {
    return (
      forceAll ||
      previousStockSignature === undefined ||
      statusChanged ||
      currentStock <= LOW_STOCK_IMMEDIATE_THRESHOLD
    );
  }

  function normalizeStockPayload(currentStock) {
    if (currentStock == null) {
      return {
        kind: 'not-managed',
      };
    }

    if (currentStock === 0) {
      return {
        kind: 'status-only',
      };
    }

    if (!Number.isInteger(currentStock) || currentStock < 1 || currentStock > 9999) {
      return {
        kind: 'invalid',
      };
    }

    return {
      kind: 'stock',
      currentStock,
      signature: `enabled:${currentStock}`,
    };
  }

  function queueItemSync(operation, command, itemId, signature, desiredValue, payload) {
    const key = `${operation}:${itemId}`;
    if (pendingItemSyncs.has(key)) return false;

    const requestId = `${operation}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    pendingItemSyncs.set(key, {
      requestId,
      signature,
      desiredValue,
      scopeKey: itemSyncScopeKey,
    });
    sendCommandToInjected(command, { requestId, itemId, ...payload });
    return true;
  }

  function finishItemSync(operation, data) {
    const key = `${operation}:${data.itemId}`;
    const pending = pendingItemSyncs.get(key);
    if (
      !pending ||
      pending.scopeKey !== itemSyncScopeKey ||
      (data.requestId && pending.requestId !== data.requestId)
    ) {
      return null;
    }
    pendingItemSyncs.delete(key);
    return pending || null;
  }

  const itemSyncStateReady = hydrateItemSyncState();

  function normalizeGrabIds(value, fallback, prefix) {
    const candidates = Array.isArray(value) ? value : fallback ? [fallback] : [];
    return [...new Set(candidates.filter((id) => typeof id === 'string' && id.startsWith(prefix)))];
  }

  function schedulePendingStockFlush() {
    clearPendingStockFlushTimer();
    if (grabSessionExpired || pendingStockUpdates.size === 0) return;

    const nextDueAt = Math.min(...Array.from(pendingStockUpdates.values(), (entry) => entry.dueAt));
    const delay = Math.max(0, nextDueAt - Date.now());
    pendingStockFlushTimer = setTimeout(flushPendingStockUpdates, delay);
  }

  function getPendingStockUpdate(existing, stockPayload, immediate, now) {
    return {
      currentStock: stockPayload.currentStock,
      signature: stockPayload.signature,
      dueAt: immediate ? now : existing?.dueAt ?? now + STOCK_FLUSH_DELAY_MS,
    };
  }

  function stageStockUpdate(itemId, stockPayload, immediate) {
    const existing = pendingStockUpdates.get(itemId);
    const nextStockUpdate = getPendingStockUpdate(existing, stockPayload, immediate, Date.now());

    if (
      existing &&
      existing.signature === nextStockUpdate.signature &&
      existing.currentStock === nextStockUpdate.currentStock &&
      existing.dueAt === nextStockUpdate.dueAt
    ) {
      return false;
    }

    pendingStockUpdates.set(itemId, nextStockUpdate);
    persistItemSyncState();
    schedulePendingStockFlush();
    return true;
  }

  function clearPendingStockUpdate(itemId) {
    if (!pendingStockUpdates.delete(itemId)) return false;
    persistItemSyncState();
    schedulePendingStockFlush();
    return true;
  }

  function flushPendingStockUpdates() {
    pendingStockFlushTimer = null;
    if (grabSessionExpired) return;

    const now = Date.now();
    let changed = false;
    for (const [itemId, pendingStock] of pendingStockUpdates) {
      if (pendingStock.dueAt > now) continue;

      queueItemSync(
        'stock',
        'SET_ITEM_STOCK',
        itemId,
        pendingStock.signature,
        pendingStock.signature,
        { currentStock: pendingStock.currentStock }
      );
      pendingStockUpdates.set(itemId, {
        ...pendingStock,
        dueAt: now + STOCK_RETRY_DELAY_MS,
      });
      changed = true;
    }

    if (changed) persistItemSyncState();
    schedulePendingStockFlush();
  }

  // Poll POS Backend for Menu Limits / Item Status changes
  async function pollPosItemStatus(forceAll = false) {
    await itemSyncStateReady;
    if (grabSessionExpired) return;
    if (itemStatusPollInFlight) {
      forceSyncQueued = forceSyncQueued || forceAll;
      return;
    }
    itemStatusPollInFlight = true;

    try {
      const res = await getStoredValues(['backendUrl', 'branchId', 'relaySecret']);
      const backendUrl = res.backendUrl || 'http://localhost:3000';
      const branchId = Number(res.branchId);
      const relaySecret = res.relaySecret || '';

      if (!Number.isInteger(branchId) || branchId <= 0) {
        updateBadge('⚠️ Chưa cấu hình mã chi nhánh trong tiện ích', false);
        return;
      }

      await ensureItemSyncScope(backendUrl, branchId);
      const reconcileTodayStatuses = refreshItemStatusBusinessDate();

      const headers = {};
      if (relaySecret) {
        headers['x-grab-relay-secret'] = relaySecret;
      }

      const response = await fetch(`${backendUrl}/api/webhooks/grabfood/item-status?branch_id=${branchId}`, {
        headers,
      });
      if (!response.ok) {
        if (response.status === 401) {
          updateBadge('⚠️ POS từ chối xác thực (401) — kiểm tra lại Relay Secret', false);
        }
        return;
      }

      const data = await response.json();
      if (data.success && Array.isArray(data.items)) {
        let syncedCount = 0;
        const seenGrabItemIds = new Set();
        for (const item of data.items) {
          const grabItemIds = normalizeGrabIds(item.grab_item_ids, item.grab_item_id, 'VNITE');
          const grabModifierIds = normalizeGrabIds(item.grab_modifier_ids, null, 'VNMOD');
          if (grabItemIds.length === 0 && grabModifierIds.length === 0) continue;
          for (const grabId of grabItemIds) seenGrabItemIds.add(grabId);

          const itemAvailableStatus = item.item_available_status ?? item.available_status;
          const itemGrabStatus =
            item.item_grab_status ||
            item.grab_status ||
            (itemAvailableStatus === 3
              ? 'UNAVAILABLE_INDEFINITELY'
              : itemAvailableStatus === 7
                ? 'HIDDEN'
                : itemAvailableStatus === 2
                  ? 'UNAVAILABLE_TODAY'
                  : 'AVAILABLE');
          const modifierAvailableStatus =
            item.modifier_available_status ??
            (item.is_disabled || item.available_to_sell === 0 ? 2 : 1);
          const modifierGrabStatus =
            item.modifier_grab_status ||
            (modifierAvailableStatus === 2 ? 'UNAVAILABLE_TODAY' : 'AVAILABLE');
          const currentStock = item.available_to_sell;

          for (const grabId of grabItemIds) {
            const cacheKey = `item:${grabId}`;
            const prev = itemStatusCache.get(cacheKey);

            if (
              shouldSyncAvailabilityStatus(
                itemGrabStatus,
                prev?.status,
                forceAll,
                reconcileTodayStatuses
              )
            ) {
              console.log(`[Grab POS Relay] Item status sync for ${item.name}: ${prev?.status} -> ${itemGrabStatus} (code: ${itemAvailableStatus})`);
              if (
                queueItemSync(
                  'status',
                  'SET_AVAILABLE_STATUS',
                  grabId,
                  String(itemAvailableStatus ?? itemGrabStatus),
                  itemGrabStatus,
                  { availableStatus: itemAvailableStatus ?? itemGrabStatus }
                )
              ) {
                syncedCount++;
              }
            }
          }

          for (const grabId of grabModifierIds) {
            const cacheKey = `modifier:${grabId}`;
            const prev = itemStatusCache.get(cacheKey);

            if (
              shouldSyncAvailabilityStatus(
                modifierGrabStatus,
                prev?.status,
                forceAll,
                reconcileTodayStatuses
              )
            ) {
              console.log(`[Grab POS Relay] Modifier status sync for ${item.name}: ${prev?.status} -> ${modifierGrabStatus} (code: ${modifierAvailableStatus})`);
              if (
                queueItemSync(
                  'modifier-status',
                  'SET_MODIFIER_AVAILABLE_STATUS',
                  grabId,
                  String(modifierAvailableStatus),
                  modifierGrabStatus,
                  { availableStatus: modifierAvailableStatus }
                )
              ) {
                syncedCount++;
              }
            }
          }

          // Modifier availability is binary. Numeric stock is sent only to
          // standalone Grab items through the IMS endpoint.
          const stockPayload = normalizeStockPayload(currentStock);
          if (stockPayload.kind === 'not-managed' || stockPayload.kind === 'status-only') {
            for (const grabId of grabItemIds) clearPendingStockUpdate(grabId);
            continue;
          }
          if (stockPayload.kind === 'invalid') {
            for (const grabId of grabItemIds) clearPendingStockUpdate(grabId);
            console.warn(`[Grab POS Relay] Skip invalid stock for ${item.name}: ${currentStock}`);
            continue;
          }

          for (const grabId of grabItemIds) {
            const cacheKey = `item:${grabId}`;
            const prev = itemStatusCache.get(cacheKey);
            const statusChanged = prev?.status !== undefined && prev.status !== itemGrabStatus;
            const stockChanged = !prev || prev.stockSignature !== stockPayload.signature;
            const inFlightStock = pendingItemSyncs.get(`stock:${grabId}`);

            if (!forceAll && !stockChanged && !statusChanged) {
              if (inFlightStock && inFlightStock.signature !== stockPayload.signature) {
                stageStockUpdate(grabId, stockPayload, true);
              } else {
                clearPendingStockUpdate(grabId);
              }
              continue;
            }

            console.log(`[Grab POS Relay] Stock sync staged for ${item.name}: ${prev?.stockSignature} -> ${stockPayload.signature}`);
            const immediate = shouldFlushStockImmediately(
              stockPayload.currentStock,
              prev?.stockSignature,
              forceAll,
              statusChanged
            );
            if (stageStockUpdate(grabId, stockPayload, immediate)) {
              syncedCount++;
            }
          }
        }

        for (const itemId of pendingStockUpdates.keys()) {
          if (!seenGrabItemIds.has(itemId)) clearPendingStockUpdate(itemId);
        }
        schedulePendingStockFlush();

        if (forceAll) {
          updateBadge(`Đang đồng bộ ${syncedCount} thay đổi sang Grab...`);
        }
      }
    } catch (err) {
      console.warn('[Grab POS Relay] Failed polling item status:', err);
    } finally {
      itemStatusPollInFlight = false;
      if (forceSyncQueued) {
        forceSyncQueued = false;
        pollPosItemStatus(true);
      }
    }
  }

  // Listen to messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'FORCE_FULL_SYNC') {
      pollPosItemStatus(true);
      sendResponse({ success: true });
    }
  });

  // Listen to messages from injected.js
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== 'GRAB_POS_RELAY_INJECTED') {
      return;
    }

    const { type, data } = event.data;

    if (type === 'AUTH_EXPIRED') {
      grabSessionExpired = true;
      updateBadge('⚠️ Phiên Grab hết hạn — mở lại hoặc đăng nhập lại Grab Merchant', false);
      return;
    }

    if (type === 'AUTH_RECOVERED') {
      grabSessionExpired = false;
      updateBadge('✅ Đã kết nối lại Grab — tiếp tục trực đơn');
      pollPosItemStatus(false);
      return;
    }

    // Confirm status sync success before caching
    if (type === 'SYNC_STATUS_RESULT' && data?.itemId) {
      const pending = finishItemSync('status', data);
      if (!pending) return;
      if (data.success) {
        const cacheKey = `item:${data.itemId}`;
        const prev = itemStatusCache.get(cacheKey) || {};
        itemStatusCache.set(cacheKey, {
          ...prev,
          status: pending?.desiredValue || data.statusStr || data.availableStatus,
        });
        persistItemSyncState();
        console.log(`[Grab POS Relay] Status sync confirmed for item ${data.itemId}`);
      } else {
        const detail = data.error ? `: ${data.error}` : '';
        console.warn(`[Grab POS Relay] Status sync failed for item ${data.itemId} (HTTP ${data.status})${detail}`);
        updateBadge(`⚠️ Grab từ chối trạng thái món (HTTP ${data.status || 0})`, false);
      }
      return;
    }

    if (type === 'SYNC_MODIFIER_STATUS_RESULT' && data?.itemId) {
      const pending = finishItemSync('modifier-status', data);
      if (!pending) return;
      if (data.success) {
        const cacheKey = `modifier:${data.itemId}`;
        const prev = itemStatusCache.get(cacheKey) || {};
        itemStatusCache.set(cacheKey, {
          ...prev,
          status: pending?.desiredValue || data.statusStr || data.availableStatus,
        });
        persistItemSyncState();
        console.log(`[Grab POS Relay] Status sync confirmed for modifier ${data.itemId}`);
      } else {
        const detail = data.error ? `: ${data.error}` : '';
        console.warn(`[Grab POS Relay] Modifier status sync failed for ${data.itemId} (HTTP ${data.status})${detail}`);
        updateBadge(`⚠️ Grab từ chối trạng thái món kèm (HTTP ${data.status || 0})`, false);
      }
      return;
    }

    // Confirm stock sync success before caching
    if (type === 'SYNC_STOCK_RESULT' && data?.itemId) {
      const pending = finishItemSync('stock', data);
      if (!pending) return;
      if (data.success) {
        const cacheKey = `item:${data.itemId}`;
        const prev = itemStatusCache.get(cacheKey) || {};
        const confirmedSignature = pending.signature || data.stockSignature;
        itemStatusCache.set(cacheKey, {
          ...prev,
          stockSignature: pending?.signature || data.stockSignature,
        });
        const queuedStock = pendingStockUpdates.get(data.itemId);
        if (queuedStock?.signature === confirmedSignature) {
          pendingStockUpdates.delete(data.itemId);
        }
        persistItemSyncState();
        schedulePendingStockFlush();
        console.log(`[Grab POS Relay] Stock sync confirmed for item ${data.itemId}`);
      } else {
        const queuedStock = pendingStockUpdates.get(data.itemId);
        if (queuedStock) {
          pendingStockUpdates.set(data.itemId, {
            ...queuedStock,
            dueAt: Date.now() + STOCK_RETRY_DELAY_MS,
          });
          persistItemSyncState();
          schedulePendingStockFlush();
        }
        const detail = data.error ? `: ${data.error}` : '';
        console.warn(`[Grab POS Relay] Stock sync failed for item ${data.itemId} (HTTP ${data.status})${detail}`);
        updateBadge(`⚠️ Grab từ chối tồn món (HTTP ${data.status || 0})`, false);
      }
      return;
    }

    if (type === 'ORDER_DETAIL' && data?.order) {
      const order = data.order;
      console.log(`[Grab POS Relay] Received order ${order.displayID}, queuing for relay...`);
      updateBadge(`Đang tiếp nhận đơn ${order.displayID}...`);

      chrome.runtime.sendMessage(
        {
          action: 'ENQUEUE_ORDER',
          payload: {
            order: order,
            merchantId: data.merchantId || order.merchant?.ID,
          },
        },
        (res) => {
          if (chrome.runtime.lastError) {
            console.warn('[Grab POS Relay] Background communication error:', chrome.runtime.lastError);
          } else if (res?.success) {
            updateBadge(`✅ Đã tiếp nhận đơn ${order.displayID}`);
          }
        }
      );
    }
  });

  // Start polling POS backend for menu limit & availability changes
  setInterval(() => pollPosItemStatus(false), ITEM_STATUS_POLL_INTERVAL_MS);
  setTimeout(() => pollPosItemStatus(false), INITIAL_ITEM_STATUS_POLL_DELAY_MS);
})();
