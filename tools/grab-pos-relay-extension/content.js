// content.js - Content script running in merchant.grab.com
(function () {
  const extVersion = chrome.runtime.getManifest()?.version || '1.1.0';
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
              sendCommandToInjected('SET_AVAILABLE_STATUS', {
                itemId: grabId,
                availableStatus: item.available_status ?? currentGrabStatus,
              });
              syncedCount++;
            }

            // 2. If Stock changed
            if (forceAll || !prev || prev.stock !== currentStock) {
              const maxStock =
                item.max_stock ??
                item.stock_capacity ??
                (typeof currentStock === 'number' ? Math.max(currentStock, 100) : -1);

              console.log(`[Grab POS Relay] Stock sync for ${item.name}: ${prev?.stock} -> ${currentStock} (maxStock: ${maxStock})`);
              sendCommandToInjected('SET_ITEM_STOCK', {
                itemId: grabId,
                currentStock: currentStock,
                maxStock: maxStock,
              });
              syncedCount++;
            }

            itemStatusCache.set(grabId, { status: currentGrabStatus, stock: currentStock });
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

    if (type === 'AUTH_EXPIRED') {
      updateBadge('⚠️ Phiên Grab hết hạn — mở lại hoặc đăng nhập lại Grab Merchant', false);
      return;
    }

    if (type === 'AUTH_RECOVERED') {
      updateBadge('✅ Đã kết nối lại Grab — tiếp tục trực đơn');
      return;
    }

    if (type === 'ORDER_DETAIL' && data?.order) {
      const order = data.order;
      console.log(`[Grab POS Relay] Relaying order ${order.displayID} to POS backend...`);
      updateBadge(`Đang tạo đơn ${order.displayID} trên POS chi nhánh...`);

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
            updateBadge(`✅ Đã tạo đơn ${order.displayID} trên POS thành công!`);

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
            const errMsg =
              res.status === 401
                ? 'POS từ chối xác thực (401) — kiểm tra lại Relay Secret'
                : errJson.error || `Mã ${res.status}`;
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
