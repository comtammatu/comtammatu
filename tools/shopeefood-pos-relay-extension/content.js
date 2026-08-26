// content.js - Content script running in partner.shopee.vn / merchant.shopeefood.vn
(function () {
  const extVersion = chrome.runtime.getManifest()?.version || '1.1.0';
  console.log(`[ShopeeFood POS Relay v${extVersion}] Content script active`);

  // Inject injected.js into page context
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function () {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);

  // Floating Status Indicator on Shopee Partner Web page
  const badge = document.createElement('div');
  badge.id = 'comtammatu-shopee-pos-relay-badge';
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
  badge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ee4d2d;"></span> <strong>Shopee POS</strong> <span style="font-size:11px;color:#94a3b8;">v${extVersion}</span>`;

  function ensureBadgeAttached() {
    if (!document.getElementById('comtammatu-shopee-pos-relay-badge')) {
      if (document.body) {
        document.body.appendChild(badge);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (document.body && !document.getElementById('comtammatu-shopee-pos-relay-badge')) {
            document.body.appendChild(badge);
          }
        });
      }
    }
  }

  ensureBadgeAttached();

  function updateBadge(message, isSuccess = true) {
    ensureBadgeAttached();
    const dotColor = isSuccess ? '#22c55e' : '#ef4444';
    badge.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};"></span> <strong>Shopee v${extVersion}</strong>: ${message}`;
    badge.style.borderColor = isSuccess ? '#22c55e' : '#ef4444';
  }

  function sendCommandToInjected(command, payload) {
    window.postMessage(
      {
        source: 'SHOPEE_POS_RELAY_CONTENT',
        command: command,
        payload: payload,
      },
      '*'
    );
  }

  // Cache to track previous status of items
  const itemStatusCache = new Map(); // shopeeItemId -> { status, stock }

  // Poll POS Backend for Menu Limits / Item Status changes
  async function pollPosItemStatus() {
    chrome.storage.local.get(['backendUrl', 'branchId', 'relaySecret'], async (res) => {
      const backendUrl = res.backendUrl || 'http://localhost:3000';
      const branchId = res.branchId || 1;
      const relaySecret = res.relaySecret || '';

      try {
        const headers = {};
        if (relaySecret) {
          headers['x-shopee-relay-secret'] = relaySecret;
        }

        const response = await fetch(`${backendUrl}/api/webhooks/shopeefood/item-status?branch_id=${branchId}`, {
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
          for (const item of data.items) {
            if (!item.shopee_item_id || !item.shopee_item_id.startsWith('SPF_ITEM_')) continue;

            const shopeeId = item.shopee_item_id;
            const currentStatus = item.available_status; // 1: Có bán, 2: Hết hàng
            const currentStock = item.available_to_sell;

            const prev = itemStatusCache.get(shopeeId);

            // 1. If Available Status changed (e.g. Tắt món / Mở bán lại)
            if (!prev || prev.status !== currentStatus) {
              console.log(`[Shopee POS Relay] Status change detected for ${item.name}: ${prev?.status} -> ${currentStatus}`);
              sendCommandToInjected('SET_AVAILABLE_STATUS', {
                itemId: shopeeId,
                itemName: item.name,
                availableStatus: currentStatus,
              });
            }

            // 2. If Stock changed and item has finite quota
            if (typeof currentStock === 'number' && (!prev || prev.stock !== currentStock)) {
              console.log(`[Shopee POS Relay] Stock change detected for ${item.name}: ${prev?.stock} -> ${currentStock}`);
              sendCommandToInjected('SET_ITEM_STOCK', {
                itemId: shopeeId,
                itemName: item.name,
                currentStock: currentStock,
              });
            }

            itemStatusCache.set(shopeeId, { status: currentStatus, stock: currentStock });
          }
        }
      } catch (err) {
        // Silently retry next interval
      }
    });
  }

  // Listen to messages from injected.js
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.data?.source !== 'SHOPEE_POS_RELAY_INJECTED') {
      return;
    }

    const { type, data } = event.data;

    if (type === 'AUTH_EXPIRED') {
      updateBadge('⚠️ Phiên Shopee hết hạn — mở lại hoặc đăng nhập lại Shopee Partner', false);
      return;
    }

    if (type === 'AUTH_RECOVERED') {
      updateBadge('✅ Đã kết nối lại Shopee — tiếp tục trực đơn');
      return;
    }

    if (type === 'STORE_INFO' && data?.restaurantName) {
      updateBadge(`Đã kết nối: ${data.restaurantName}`);
      chrome.storage.local.set({
        shopeeRestaurantId: data.restaurantId,
        shopeeStoreId: data.storeId,
        shopeeRestaurantName: data.restaurantName,
      });
      return;
    }

    if (type === 'ORDER_DETAIL' && data?.order) {
      const order = data.order;
      const displayId = order.displayId || order.orderCode || String(order.orderId || 'SPF-ORDER');
      console.log(`[Shopee POS Relay] Relaying order ${displayId} to POS backend...`);
      updateBadge(`Đang chuyển đơn ${displayId} sang KDS...`);

      chrome.storage.local.get(['backendUrl', 'branchId', 'relaySecret', 'recentOrders'], async (result) => {
        const backendUrl = result.backendUrl || 'http://localhost:3000';
        const branchId = result.branchId || 1;
        const relaySecret = result.relaySecret || '';

        try {
          const headers = {
            'Content-Type': 'application/json',
          };
          if (relaySecret) {
            headers['x-shopee-relay-secret'] = relaySecret;
          }

          const res = await fetch(`${backendUrl}/api/webhooks/shopeefood/relay`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              order: order,
              branch_id: branchId,
              restaurant_id: data.restaurantId || order.restaurantId,
            }),
          });

          if (res.ok) {
            updateBadge(`✅ Đã tạo đơn ${displayId} trên POS thành công!`);

            // Save to recent orders
            const rawItems = order.items || order.dishList || order.orderItems || [];
            const recent = result.recentOrders || [];
            recent.unshift({
              orderId: order.orderId || displayId,
              displayId: displayId,
              eater: order.customer?.name || order.buyer?.name || 'Khách Shopee',
              items: rawItems.map((i) => `${i.quantity}x ${i.name}`).join(', '),
              total: typeof order.total === 'number' ? `${order.total.toLocaleString('vi-VN')}₫` : String(order.total || order.totalPrice || '0₫'),
              time: new Date().toLocaleTimeString('vi-VN'),
            });
            chrome.storage.local.set({ recentOrders: recent.slice(0, 10), lastSyncTime: Date.now() });
          } else {
            const errText = await res.text();
            console.error('[Shopee POS Relay] Backend rejected order:', errText);
            const errMsg =
              res.status === 401
                ? 'POS từ chối xác thực (401) — kiểm tra lại Relay Secret'
                : `Mã ${res.status}`;
            updateBadge(`⚠️ Lỗi gửi ${displayId} sang POS: ${errMsg}`, false);
          }
        } catch (err) {
          console.error('[Shopee POS Relay] Failed to reach POS backend:', err);
          updateBadge(`⚠️ Không kết nối được POS (${backendUrl})`, false);
        }
      });
    }
  });

  // Start polling POS backend for menu limit & availability changes
  setInterval(pollPosItemStatus, 6000);
  setTimeout(pollPosItemStatus, 2000);
})();
