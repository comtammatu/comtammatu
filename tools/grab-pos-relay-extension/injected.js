// injected.js - Runs in page context of merchant.grab.com
(function () {
  console.log('[Grab POS Relay] Injected script loaded into page context');

  const processedOrderIds = new Set();
  let merchantId = '5-C8DTE75GUGJ3JT';

  function dispatchOrderEvent(type, data) {
    window.postMessage(
      {
        source: 'GRAB_POS_RELAY_INJECTED',
        type: type,
        data: data,
        timestamp: Date.now(),
      },
      '*'
    );
  }

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    // Extract merchantId if present
    if (url.includes('merchantID=')) {
      const match = url.match(/merchantID=([^&]+)/);
      if (match && match[1]) {
        merchantId = match[1];
      }
    }

    const response = await originalFetch.apply(this, args);

    try {
      if (url.includes('/orders-pagination') || url.includes('/food/merchant/v3/orders/')) {
        const clone = response.clone();
        clone
          .json()
          .then((data) => {
            if (url.includes('/orders-pagination') && Array.isArray(data.orders)) {
              dispatchOrderEvent('ORDERS_PAGINATION', { url, data, merchantId });

              // Auto fetch details for any newly detected orders
              for (const order of data.orders) {
                if (order.orderID && !processedOrderIds.has(order.orderID)) {
                  processedOrderIds.add(order.orderID);
                  fetchOrderDetail(order.orderID);
                }
              }
            } else if (url.includes('/food/merchant/v3/orders/') && data.order) {
              console.log(`[Grab POS Relay] Caught order detail: ${data.order.displayID} (${data.order.orderID})`);
              dispatchOrderEvent('ORDER_DETAIL', { order: data.order, merchantId });
            }
          })
          .catch(() => {});
      }
    } catch (e) {
      console.error('[Grab POS Relay] Intercept error:', e);
    }

    return response;
  };

  // Helper to fetch single order detail
  async function fetchOrderDetail(orderId) {
    try {
      const url = `https://api.grab.com/food/merchant/v3/orders/${orderId}`;
      const res = await originalFetch(url, {
        headers: {
          accept: 'application/json',
          requestsource: 'troyPortal',
          merchantid: merchantId,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.order) {
          console.log(`[Grab POS Relay] Fetched full detail for ${data.order.displayID}`);
          dispatchOrderEvent('ORDER_DETAIL', { order: data.order, merchantId });
        }
      }
    } catch (err) {
      console.error(`[Grab POS Relay] Failed fetching detail for order ${orderId}:`, err);
    }
  }

  // Active polling loop (every 6s) using native page fetch
  async function pollOrders() {
    try {
      const url = `https://api.grab.com/delvplatformapi/merchant/v4/orders-pagination?AutoAcceptGroup=1&merchantID=${merchantId}&PageType=PreparingV2&searchToken=&size=50`;
      const res = await originalFetch(url, {
        headers: {
          accept: 'application/json',
          requestsource: 'troyPortal',
          merchantid: merchantId,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          for (const o of data.orders) {
            if (o.orderID && !processedOrderIds.has(o.orderID)) {
              processedOrderIds.add(o.orderID);
              await fetchOrderDetail(o.orderID);
            }
          }
        }
      }
    } catch (err) {
      // Ignore background poll errors
    }
  }

  // API Call: Sync Available Status (1: Có bán, 2: Hết hàng hôm nay)
  async function setGrabItemAvailableStatus(itemId, availableStatus) {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const availableAt = availableStatus === 2 ? tomorrow.toISOString() : '0001-01-01T00:00:00Z';

      const url = 'https://api.grab.com/food/merchant/v1/items/available-status';
      const res = await originalFetch(url, {
        method: 'PUT',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'requestsource': 'troyPortal',
          'merchantid': merchantId,
        },
        body: JSON.stringify({
          items: [
            {
              itemID: itemId,
              availableStatus: availableStatus,
              availableAt: availableAt,
            },
          ],
        }),
      });

      console.log(`[Grab POS Relay] Updated status for item ${itemId} -> ${availableStatus} (HTTP ${res.status})`);
      dispatchOrderEvent('SYNC_STATUS_RESULT', { itemId, availableStatus, success: res.ok, status: res.status });
    } catch (err) {
      console.error(`[Grab POS Relay] Failed to update item status for ${itemId}:`, err);
    }
  }

  // API Call: Sync Stock / Daily Limit (IMS)
  async function setGrabItemStock(itemId, currentStock) {
    try {
      const url = `https://api.grab.com/food/merchant/v1/items/${itemId}/upsert-item-stock`;
      const res = await originalFetch(url, {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'requestsource': 'troyPortal',
          'merchantid': merchantId,
        },
        body: JSON.stringify({
          enableIms: true,
          currentStock: currentStock,
          enableRestock: false,
          restockSetting: null,
        }),
      });

      console.log(`[Grab POS Relay] Updated stock for item ${itemId} -> ${currentStock} (HTTP ${res.status})`);
      dispatchOrderEvent('SYNC_STOCK_RESULT', { itemId, currentStock, success: res.ok, status: res.status });
    } catch (err) {
      console.error(`[Grab POS Relay] Failed to update stock for ${itemId}:`, err);
    }
  }

  // Listen to commands from content.js
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'GRAB_POS_RELAY_CONTENT') {
      return;
    }

    const { command, payload } = event.data;
    if (command === 'SET_AVAILABLE_STATUS') {
      setGrabItemAvailableStatus(payload.itemId, payload.availableStatus);
    } else if (command === 'SET_ITEM_STOCK') {
      setGrabItemStock(payload.itemId, payload.currentStock);
    }
  });

  // Start poll loop
  setInterval(pollOrders, 6000);
  setTimeout(pollOrders, 1500);
})();
