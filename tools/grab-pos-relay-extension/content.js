// content.js - Content script running in merchant.grab.com
(function () {
  const extVersion = chrome.runtime.getManifest()?.version || '1.1.3';
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

  // Cache to track previous status of items
  const itemStatusCache = new Map(); // grabItemId -> { status, stockSignature }
  const pendingItemSyncs = new Map(); // operation:itemId -> { requestId, signature, desiredValue }
  let grabSessionExpired = false;
  let itemStatusPollInFlight = false;
  let forceSyncQueued = false;

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
    pendingItemSyncs.set(key, { requestId, signature, desiredValue });
    sendCommandToInjected(command, { requestId, itemId, ...payload });
    return true;
  }

  function finishItemSync(operation, data) {
    const key = `${operation}:${data.itemId}`;
    const pending = pendingItemSyncs.get(key);
    if (pending && data.requestId && pending.requestId !== data.requestId) {
      return null;
    }
    pendingItemSyncs.delete(key);
    return pending || null;
  }

  // Poll POS Backend for Menu Limits / Item Status changes
  async function pollPosItemStatus(forceAll = false) {
    if (grabSessionExpired) return;
    if (itemStatusPollInFlight) {
      forceSyncQueued = forceSyncQueued || forceAll;
      return;
    }
    itemStatusPollInFlight = true;

    chrome.storage.local.get(['backendUrl', 'branchId', 'relaySecret'], async (res) => {
      const backendUrl = res.backendUrl || 'http://localhost:3000';
      const branchId = res.branchId || 1;
      const relaySecret = res.relaySecret || '';

      try {
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
          for (const item of data.items) {
            if (!item.grab_item_id || !item.grab_item_id.startsWith('VNITE')) continue;

            const grabId = item.grab_item_id;
            const currentGrabStatus =
              item.grab_status || (item.available_status === 2 ? 'UNAVAILABLE_TODAY' : 'AVAILABLE');
            const currentStock = item.available_to_sell;

            const prev = itemStatusCache.get(grabId);

            // 1. If Available Status changed (or forceAll is true)
            if (forceAll || !prev || prev.status !== currentGrabStatus) {
              console.log(`[Grab POS Relay] Status sync for ${item.name}: ${prev?.status} -> ${currentGrabStatus} (code: ${item.available_status})`);
              if (
                queueItemSync(
                  'status',
                  'SET_AVAILABLE_STATUS',
                  grabId,
                  String(item.available_status ?? currentGrabStatus),
                  currentGrabStatus,
                  { availableStatus: item.available_status ?? currentGrabStatus }
                )
              ) {
                syncedCount++;
              }
            }

            // 2. Grab stock accepts integers from 1 to 9999. Zero is represented
            // exclusively by availableStatus 2, which was queued above.
            const stockPayload = normalizeStockPayload(currentStock);
            if (stockPayload.kind === 'not-managed' || stockPayload.kind === 'status-only') continue;
            if (stockPayload.kind === 'invalid') {
              console.warn(`[Grab POS Relay] Skip invalid stock for ${item.name}: ${currentStock}`);
              continue;
            }

            if (forceAll || !prev || prev.stockSignature !== stockPayload.signature) {
              console.log(`[Grab POS Relay] Stock sync for ${item.name}: ${prev?.stockSignature} -> ${stockPayload.signature}`);
              if (
                queueItemSync(
                  'stock',
                  'SET_ITEM_STOCK',
                  grabId,
                  stockPayload.signature,
                  stockPayload.signature,
                  {
                    currentStock: stockPayload.currentStock,
                  }
                )
              ) {
                syncedCount++;
              }
            }
          }

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
    });
  }

  // Listen to messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'FORCE_FULL_SYNC') {
      itemStatusCache.clear();
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
      if (data.success) {
        const prev = itemStatusCache.get(data.itemId) || {};
        itemStatusCache.set(data.itemId, {
          ...prev,
          status: pending?.desiredValue || data.statusStr || data.availableStatus,
        });
        console.log(`[Grab POS Relay] Status sync confirmed for item ${data.itemId}`);
      } else {
        const detail = data.error ? `: ${data.error}` : '';
        console.warn(`[Grab POS Relay] Status sync failed for item ${data.itemId} (HTTP ${data.status})${detail}`);
        updateBadge(`⚠️ Grab từ chối trạng thái món (HTTP ${data.status || 0})`, false);
      }
      return;
    }

    // Confirm stock sync success before caching
    if (type === 'SYNC_STOCK_RESULT' && data?.itemId) {
      const pending = finishItemSync('stock', data);
      if (data.success) {
        const prev = itemStatusCache.get(data.itemId) || {};
        itemStatusCache.set(data.itemId, {
          ...prev,
          stockSignature: pending?.signature || data.stockSignature,
        });
        console.log(`[Grab POS Relay] Stock sync confirmed for item ${data.itemId}`);
      } else {
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
  setInterval(() => pollPosItemStatus(false), 6000);
  setTimeout(() => pollPosItemStatus(false), 2000);
})();
