// content.js - Content script running in merchant.grab.com
(function () {
  console.log('[Grab POS Relay] Content script active');

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
    bottom: 16px;
    right: 16px;
    z-index: 999999;
    background: #0f172a;
    color: #f8fafc;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 8px 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    display: flex;
    align-items: center;
    gap: 8px;
    transition: all 0.3s ease;
  `;
  badge.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;"></span> <strong>Cơm Tấm Má Tư POS Relay</strong>: Đang trực đơn...`;

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
    badge.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${isSuccess ? '#22c55e' : '#ef4444'};"></span> <strong>POS Relay</strong>: ${message}`;
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
  const itemStatusCache = new Map(); // grabItemId -> { status, stock }

  // Poll POS Backend for Menu Limits / Item Status changes
  async function pollPosItemStatus(forceAll = false) {
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
        if (!response.ok) return;

        const data = await response.json();
        if (data.success && Array.isArray(data.items)) {
          let syncedCount = 0;
          for (const item of data.items) {
            if (!item.grab_item_id) continue;

            const grabId = item.grab_item_id;
            const currentStatus = item.available_status; // 1 or 2
            const currentStock = item.available_to_sell;

            const prev = itemStatusCache.get(grabId);

            // 1. If Available Status changed (or forceAll is true)
            if (forceAll || !prev || prev.status !== currentStatus) {
              console.log(`[Grab POS Relay] Status sync for ${item.name}: ${prev?.status} -> ${currentStatus}`);
              sendCommandToInjected('SET_AVAILABLE_STATUS', {
                itemId: grabId,
                availableStatus: currentStatus,
              });
              syncedCount++;
            }

            // 2. If Stock changed and item has finite quota
            if (typeof currentStock === 'number' && (forceAll || !prev || prev.stock !== currentStock)) {
              console.log(`[Grab POS Relay] Stock sync for ${item.name}: ${prev?.stock} -> ${currentStock}`);
              sendCommandToInjected('SET_ITEM_STOCK', {
                itemId: grabId,
                currentStock: currentStock,
              });
              syncedCount++;
            }

            itemStatusCache.set(grabId, { status: currentStatus, stock: currentStock });
          }

          if (forceAll) {
            updateBadge(`✅ Đã đồng bộ toàn bộ ${data.items.length} món sang Grab!`);
          }
        }
      } catch (err) {
        console.warn('[Grab POS Relay] Failed polling item status:', err);
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

    if (type === 'ORDER_DETAIL' && data?.order) {
      const order = data.order;
      console.log(`[Grab POS Relay] Relaying order ${order.displayID} to POS backend...`);
      updateBadge(`Đang chuyển đơn ${order.displayID} sang KDS...`);

      chrome.storage.local.get(['backendUrl', 'branchId', 'relaySecret', 'recentOrders'], async (result) => {
        const backendUrl = result.backendUrl || 'http://localhost:3000';
        const branchId = result.branchId || 1;
        const relaySecret = result.relaySecret || '';

        try {
          const headers = { 'Content-Type': 'application/json' };
          if (relaySecret) {
            headers['x-grab-relay-secret'] = relaySecret;
          }

          const res = await fetch(`${backendUrl}/api/webhooks/grabfood/relay`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              order: order,
              branch_id: branchId,
              merchant_id: data.merchantId || order.merchant?.ID,
            }),
          });

          if (res.ok) {
            updateBadge(`✅ Đã đẩy ${order.displayID} vào Bếp & Máy in!`);

            // Save to recent orders
            const recent = result.recentOrders || [];
            recent.unshift({
              orderID: order.orderID,
              displayID: order.displayID,
              eater: order.eater?.name || 'Khách Grab',
              items: order.itemInfo?.items?.map((i) => `${i.quantity}x ${i.name}`).join(', '),
              total: order.fare?.totalDisplay || order.fare?.subTotalDisplay || '0₫',
              time: new Date().toLocaleTimeString('vi-VN'),
            });
            chrome.storage.local.set({ recentOrders: recent.slice(0, 10), lastSyncTime: Date.now() });
          } else {
            const errJson = await res.json().catch(() => ({}));
            const errMsg = errJson.error || `Mã ${res.status}`;
            console.error('[Grab POS Relay] Backend rejected order:', errMsg);
            updateBadge(`⚠️ Lỗi gửi ${order.displayID}: ${errMsg}`, false);
          }
        } catch (err) {
          console.error('[Grab POS Relay] Failed to reach POS backend:', err);
          updateBadge(`⚠️ Không kết nối được POS (${backendUrl})`, false);
        }
      });
    }
  });

  // Start polling POS backend for menu limit & availability changes
  setInterval(() => pollPosItemStatus(false), 6000);
  setTimeout(() => pollPosItemStatus(false), 2000);
})();
