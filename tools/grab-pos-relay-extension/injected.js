// injected.js - Runs in page context of merchant.grab.com
(function () {
  console.log('[Grab POS Relay] Injected script loaded into page context');

  const processedOrderIds = new Set();
  const dispatchedOrderIds = new Set();
  let merchantId = '5-C8DTE75GUGJ3JT';

  // The Grab API requires the portal's bearer token, which the extension cannot
  // obtain itself; it reuses headers observed on the portal's own requests.
  let capturedAuthHeaders = null;
  let consecutiveAuthFailures = 0;
  let authExpired = false;

  const AUTH_FAILURE_THRESHOLD = 2;
  const POLL_INTERVAL_MS = 6000;
  const AUTH_RETRY_INTERVAL_MS = 60000;

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

  function isGrabApiUrl(url) {
    return typeof url === 'string' && url.includes('api.grab.com');
  }

  function headersToObject(headers) {
    const obj = {};
    if (!headers) return obj;
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        obj[key.toLowerCase()] = value;
      });
      return obj;
    }
    if (Array.isArray(headers)) {
      for (const [key, value] of headers) obj[String(key).toLowerCase()] = value;
      return obj;
    }
    for (const [key, value] of Object.entries(headers)) obj[key.toLowerCase()] = value;
    return obj;
  }

  // Only cache header sets carrying authorization, so a pre-login request
  // cannot poison the cache with anonymous headers.
  function captureAuthHeaders(headers) {
    const obj = headersToObject(headers);
    if (obj.authorization) {
      capturedAuthHeaders = obj;
    }
  }

  function buildGrabHeaders() {
    return {
      ...(capturedAuthHeaders || {}),
      accept: 'application/json',
      requestsource: 'troyPortal',
      merchantid: merchantId,
    };
  }

  function noteAuthFailure(status, url) {
    if (status !== 401 && status !== 403) return;
    consecutiveAuthFailures += 1;
    if (!authExpired && consecutiveAuthFailures >= AUTH_FAILURE_THRESHOLD) {
      authExpired = true;
      console.warn(`[Grab POS Relay] Grab API returned ${status}; session appears expired (${url})`);
      dispatchOrderEvent('AUTH_EXPIRED', { status });
    }
  }

  function noteAuthSuccess() {
    consecutiveAuthFailures = 0;
    if (authExpired) {
      authExpired = false;
      dispatchOrderEvent('AUTH_RECOVERED', {});
    }
  }

  function dispatchOrderDetailOnce(order) {
    const key = order && (order.orderID || order.displayID);
    if (key) {
      if (dispatchedOrderIds.has(key)) return;
      dispatchedOrderIds.add(key);
    }
    console.log(`[Grab POS Relay] Caught order detail: ${order.displayID} (${order.orderID})`);
    dispatchOrderEvent('ORDER_DETAIL', { order, merchantId });
  }

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    if (isGrabApiUrl(url)) {
      captureAuthHeaders(args[1]?.headers || args[0]?.headers);
    }

    // Extract merchantId if present
    if (url.includes('merchantID=')) {
      const match = url.match(/merchantID=([^&]+)/);
      if (match && match[1]) {
        merchantId = match[1];
      }
    }

    const response = await originalFetch.apply(this, args);

    if (isGrabApiUrl(url)) {
      if (response.ok) noteAuthSuccess();
      else noteAuthFailure(response.status, url);
    }

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
              dispatchOrderDetailOnce(data.order);
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
        credentials: 'include',
        headers: buildGrabHeaders(),
      });
      if (res.ok) {
        noteAuthSuccess();
        const data = await res.json();
        if (data.order) {
          console.log(`[Grab POS Relay] Fetched full detail for ${data.order.displayID}`);
          dispatchOrderDetailOnce(data.order);
        }
      } else if (capturedAuthHeaders) {
        noteAuthFailure(res.status, url);
      }
    } catch (err) {
      console.error(`[Grab POS Relay] Failed fetching detail for order ${orderId}:`, err);
    }
  }

  // Active polling loop using native page fetch. Backs off to a slow probe
  // while the Grab session is expired so recovery is detected on its own.
  async function pollOrders() {
    try {
      const url = `https://api.grab.com/delvplatformapi/merchant/v4/orders-pagination?AutoAcceptGroup=1&merchantID=${merchantId}&PageType=PreparingV2&searchToken=&size=50`;
      const res = await originalFetch(url, {
        credentials: 'include',
        headers: buildGrabHeaders(),
      });
      if (res.ok) {
        noteAuthSuccess();
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          for (const o of data.orders) {
            if (o.orderID && !processedOrderIds.has(o.orderID)) {
              processedOrderIds.add(o.orderID);
              await fetchOrderDetail(o.orderID);
            }
          }
        }
      } else if (capturedAuthHeaders) {
        // Only count once a session header set exists; earlier 401s just mean
        // the portal has not made an authenticated request yet.
        noteAuthFailure(res.status, url);
      }
    } catch (err) {
      // Network errors are not auth signals; keep polling quietly.
    }
  }

  // API Call: Sync Available Status (1: Có bán, 2: Hết hàng hôm nay)
  async function setGrabItemAvailableStatus(itemId, availableStatus) {
    if (!itemId || !itemId.startsWith('VNITE')) {
      console.warn(`[Grab POS Relay] Skip status sync for non-item ID: ${itemId}`);
      return;
    }
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      const availableAt = availableStatus === 2 ? tomorrow.toISOString() : '0001-01-01T00:00:00Z';

      const url = 'https://api.grab.com/food/merchant/v1/items/available-status';
      const res = await originalFetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          ...buildGrabHeaders(),
          'content-type': 'application/json',
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

      if (res.ok) noteAuthSuccess();
      else if (capturedAuthHeaders) noteAuthFailure(res.status, url);

      console.log(`[Grab POS Relay] Updated status for item ${itemId} -> ${availableStatus} (HTTP ${res.status})`);
      dispatchOrderEvent('SYNC_STATUS_RESULT', { itemId, availableStatus, success: res.ok, status: res.status });
    } catch (err) {
      console.error(`[Grab POS Relay] Failed to update item status for ${itemId}:`, err);
    }
  }

  // API Call: Sync Stock / Daily Limit (IMS)
  async function setGrabItemStock(itemId, currentStock) {
    if (!itemId || !itemId.startsWith('VNITE')) {
      console.warn(`[Grab POS Relay] Skip stock sync for non-item ID: ${itemId}`);
      return;
    }
    try {
      const url = `https://api.grab.com/food/merchant/v1/items/${itemId}/upsert-item-stock`;
      const res = await originalFetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...buildGrabHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          enableIms: true,
          currentStock: currentStock,
          enableRestock: false,
          restockSetting: null,
        }),
      });

      if (res.ok) noteAuthSuccess();
      else if (capturedAuthHeaders) noteAuthFailure(res.status, url);

      console.log(`[Grab POS Relay] Updated stock for item ${itemId} -> ${currentStock} (HTTP ${res.status})`);
      dispatchOrderEvent('SYNC_STOCK_RESULT', { itemId, currentStock, success: res.ok, status: res.status });
    } catch (err) {
      console.error(`[Grab POS Relay] Failed to update stock for ${itemId}:`, err);
    }
  }

  // Intercept XMLHttpRequest: some portal views use XHR instead of fetch, and
  // both paths feed auth-header capture, order detection, and 401 signaling.
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._relayUrl = url;
    this._relayHeaders = {};
    return originalXhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (this._relayHeaders) this._relayHeaders[String(name).toLowerCase()] = value;
    return originalXhrSetHeader.apply(this, [name, value]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    if (isGrabApiUrl(this._relayUrl)) {
      captureAuthHeaders(this._relayHeaders);

      const idMatch = (this._relayUrl || '').match(/merchantID=([^&]+)/);
      if (idMatch && idMatch[1]) {
        merchantId = idMatch[1];
      }

      this.addEventListener('load', function () {
        if (this.status >= 200 && this.status < 300) noteAuthSuccess();
        else noteAuthFailure(this.status, this._relayUrl);

        try {
          const url = this._relayUrl || '';
          const data = JSON.parse(this.responseText);
          if (url.includes('/orders-pagination') && Array.isArray(data.orders)) {
            dispatchOrderEvent('ORDERS_PAGINATION', { url, data, merchantId });
            for (const order of data.orders) {
              if (order.orderID && !processedOrderIds.has(order.orderID)) {
                processedOrderIds.add(order.orderID);
                fetchOrderDetail(order.orderID);
              }
            }
          } else if (url.includes('/food/merchant/v3/orders/') && data.order) {
            dispatchOrderDetailOnce(data.order);
          }
        } catch (e) {
          // Non-JSON responses carry no orders.
        }
      });
    }
    return originalXhrSend.apply(this, args);
  };

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

  // Self-scheduling poll loop: slows to a probe while the session is expired.
  function schedulePoll() {
    setTimeout(async () => {
      await pollOrders();
      schedulePoll();
    }, authExpired ? AUTH_RETRY_INTERVAL_MS : POLL_INTERVAL_MS);
  }

  setTimeout(async () => {
    await pollOrders();
    schedulePoll();
  }, 1500);
})();
