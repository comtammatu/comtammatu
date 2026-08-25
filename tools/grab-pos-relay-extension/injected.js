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
        timestamp: Date.now()
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
        clone.json().then(data => {
          if (url.includes('/orders-pagination') && data.orders) {
            console.log(`[Grab POS Relay] Caught ${data.orders.length} orders from pagination`);
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
        }).catch(() => {});
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
          'accept': 'application/json',
          'requestsource': 'troyPortal',
          'merchantid': merchantId
        }
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
          'accept': 'application/json',
          'requestsource': 'troyPortal',
          'merchantid': merchantId
        }
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

  // Start poll loop
  setInterval(pollOrders, 6000);
  setTimeout(pollOrders, 1500);
})();
