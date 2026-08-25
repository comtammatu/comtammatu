// content.js - Content script running in merchant.grab.com
(function () {
  console.log('[Grab POS Relay] Content script active');

  // Inject injected.js into page context to intercept native fetch
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
  document.body.appendChild(badge);

  function updateBadge(message, isSuccess = true) {
    badge.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${isSuccess ? '#22c55e' : '#ef4444'};"></span> <strong>POS Relay</strong>: ${message}`;
    badge.style.borderColor = isSuccess ? '#22c55e' : '#ef4444';
  }

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

      // Read config from chrome.storage
      chrome.storage.local.get(['backendUrl', 'branchId', 'recentOrders'], async (result) => {
        const backendUrl = result.backendUrl || 'http://localhost:3000';
        const branchId = result.branchId || 1;

        try {
          const res = await fetch(`${backendUrl}/api/webhooks/grabfood/relay`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              order: order,
              branch_id: branchId,
              merchant_id: data.merchantId || order.merchant?.ID
            })
          });

          if (res.ok) {
            updateBadge(`✅ Đã đẩy ${order.displayID} vào Bếp & Máy in!`);
            
            // Save to recent orders
            const recent = result.recentOrders || [];
            recent.unshift({
              orderID: order.orderID,
              displayID: order.displayID,
              eater: order.eater?.name || 'Khách Grab',
              items: order.itemInfo?.items?.map(i => `${i.quantity}x ${i.name}`).join(', '),
              total: order.fare?.totalDisplay || order.fare?.subTotalDisplay || '0₫',
              time: new Date().toLocaleTimeString('vi-VN')
            });
            chrome.storage.local.set({ recentOrders: recent.slice(0, 10), lastSyncTime: Date.now() });
          } else {
            const errText = await res.text();
            console.error('[Grab POS Relay] Backend rejected order:', errText);
            updateBadge(`⚠️ Lỗi gửi ${order.displayID} sang POS: ${res.status}`, false);
          }
        } catch (err) {
          console.error('[Grab POS Relay] Failed to reach POS backend:', err);
          updateBadge(`⚠️ Không kết nối được POS (${backendUrl})`, false);
        }
      });
    }
  });
})();
