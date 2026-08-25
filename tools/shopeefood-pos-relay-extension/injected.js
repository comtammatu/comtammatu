// injected.js - Runs in page context of partner.shopee.vn / merchant.shopeefood.vn
(function () {
  console.log('[ShopeeFood POS Relay] Injected script loaded into page context');

  const processedOrderIds = new Set();
  let restaurantId = '';
  let storeId = '';
  let restaurantName = '';

  // Auth-expiry signaling: consecutive 401/403s on platform API traffic mean
  // the merchant session died; the badge must say so instead of staying green.
  let consecutiveAuthFailures = 0;
  let authExpired = false;
  const AUTH_FAILURE_THRESHOLD = 2;

  function isPlatformApiUrl(url) {
    return (
      typeof url === 'string' &&
      (url.includes('partner.shopee.vn') ||
        url.includes('merchant.shopeefood.vn') ||
        url.includes('gmerchant.deliverynow.vn'))
    );
  }

  function noteAuthFailure(status, url) {
    if (status !== 401 && status !== 403) return;
    consecutiveAuthFailures += 1;
    if (!authExpired && consecutiveAuthFailures >= AUTH_FAILURE_THRESHOLD) {
      authExpired = true;
      console.warn(`[Shopee POS Relay] Platform API returned ${status}; session appears expired (${url})`);
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

  function dispatchOrderEvent(type, data) {
    window.postMessage(
      {
        source: 'SHOPEE_POS_RELAY_INJECTED',
        type: type,
        data: data,
        timestamp: Date.now(),
      },
      '*'
    );
  }

  function normalizeShopeeItem(rawItem) {
    if (!rawItem) return null;
    return {
      itemId: rawItem.id || rawItem.itemId || rawItem.item_id || rawItem.dish_id,
      name: rawItem.name || rawItem.dish_name || rawItem.itemName || 'Món Shopee',
      quantity: rawItem.quantity || rawItem.count || rawItem.qty || 1,
      price: rawItem.price || rawItem.item_price || rawItem.unit_price || 0,
      note: rawItem.note || rawItem.item_note || rawItem.comment || null,
      options: (rawItem.options || rawItem.modifiers || rawItem.topping_list || []).map((opt) => ({
        optionId: opt.id || opt.optionId || opt.topping_id,
        name: opt.name || opt.topping_name || opt.optionName || 'Món thêm',
        price: opt.price || opt.topping_price || 0,
        quantity: opt.quantity || opt.count || 1,
      })),
    };
  }

  function normalizeShopeeOrder(rawOrder) {
    if (!rawOrder) return null;

    const orderId =
      rawOrder.order_id ||
      rawOrder.orderId ||
      rawOrder.id ||
      rawOrder.order_code ||
      rawOrder.orderCode;
    const orderCode =
      rawOrder.order_code ||
      rawOrder.orderCode ||
      rawOrder.display_id ||
      rawOrder.displayId ||
      (orderId ? String(orderId) : '');
    const displayId =
      rawOrder.display_id ||
      rawOrder.displayId ||
      rawOrder.short_code ||
      orderCode;

    const rawList =
      rawOrder.items ||
      rawOrder.dish_list ||
      rawOrder.dishList ||
      rawOrder.order_items ||
      rawOrder.orderItems ||
      rawOrder.dishes ||
      [];

    const items = rawList.map(normalizeShopeeItem).filter(Boolean);

    const customerName =
      rawOrder.customer_name ||
      rawOrder.buyer_name ||
      rawOrder.customer?.name ||
      rawOrder.buyer?.name ||
      'Khách ShopeeFood';
    const customerPhone =
      rawOrder.customer_phone ||
      rawOrder.buyer_phone ||
      rawOrder.customer?.phone ||
      rawOrder.buyer?.phone ||
      '';

    const needCutlery =
      rawOrder.need_cutlery ??
      rawOrder.needCutlery ??
      rawOrder.cutlery ??
      rawOrder.is_cutlery_needed ??
      true;

    return {
      orderId: String(orderId),
      orderCode: String(orderCode),
      displayId: String(displayId),
      restaurantId: String(rawOrder.restaurant_id || rawOrder.restaurantId || restaurantId || ''),
      storeId: String(rawOrder.store_id || rawOrder.storeId || storeId || ''),
      restaurantName: restaurantName || rawOrder.restaurant_name || rawOrder.restaurantName || '',
      customer: {
        name: customerName,
        phone: customerPhone,
        note: rawOrder.note || rawOrder.customer_note || rawOrder.remark || '',
      },
      items: items,
      subtotal: rawOrder.subtotal || rawOrder.sub_total || rawOrder.item_total || 0,
      total: rawOrder.total || rawOrder.total_price || rawOrder.total_amount || rawOrder.grand_total || 0,
      paymentMethod: rawOrder.payment_method || 'ShopeePay',
      needCutlery: needCutlery,
      note: rawOrder.note || rawOrder.customer_note || rawOrder.remark || null,
    };
  }

  function handleInterceptors(url, data) {
    if (!data) return;

    // 1. Detect store basic info (gmerchant.deliverynow.vn/api/v5/seller/store/get_basic_infos_for_partner_web)
    if (url.includes('get_basic_infos_for_partner_web') || url.includes('/seller/store/')) {
      const rest = data.data?.restaurants?.[0];
      if (rest) {
        restaurantId = String(rest.restaurant_id || '');
        storeId = String(rest.store_id || '');
        restaurantName = rest.name || '';
        console.log(`[Shopee POS Relay] Discovered store: ${restaurantName} (ID: ${restaurantId}, Store: ${storeId})`);
        dispatchOrderEvent('STORE_INFO', {
          restaurantId,
          storeId,
          restaurantName,
          deliveryId: rest.delivery_id,
        });
      }
    }

    // 2. Detect order list / report / pending orders
    if (
      url.includes('/order') ||
      url.includes('/report-restaurant') ||
      url.includes('/seller/order/') ||
      url.includes('deliverynow.vn') ||
      url.includes('shopee.vn')
    ) {
      // Pattern A: Array of orders
      const orderList =
        data.data?.orders ||
        data.data?.order_list ||
        data.data?.list ||
        data.orders ||
        data.order_list ||
        (Array.isArray(data.data) ? data.data : null);

      if (Array.isArray(orderList)) {
        for (const rawOrder of orderList) {
          const normalized = normalizeShopeeOrder(rawOrder);
          if (normalized && normalized.orderId && !processedOrderIds.has(normalized.orderId)) {
            processedOrderIds.add(normalized.orderId);
            console.log(`[Shopee POS Relay] Caught order: ${normalized.displayId} (${normalized.orderId})`);
            dispatchOrderEvent('ORDER_DETAIL', { order: normalized, restaurantId, storeId });
          }
        }
      }

      // Pattern B: Single order detail
      const singleOrder =
        data.data?.order ||
        data.data?.order_detail ||
        data.order ||
        (data.order_id || data.order_code ? data : null);

      if (singleOrder && (singleOrder.order_id || singleOrder.order_code || singleOrder.items)) {
        const normalized = normalizeShopeeOrder(singleOrder);
        if (normalized && normalized.orderId && !processedOrderIds.has(normalized.orderId)) {
          processedOrderIds.add(normalized.orderId);
          console.log(`[Shopee POS Relay] Caught single order detail: ${normalized.displayId}`);
          dispatchOrderEvent('ORDER_DETAIL', { order: normalized, restaurantId, storeId });
        }
      }
    }
  }

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    // Extract restaurantId / shopId if present
    if (url.includes('restaurant_id=') || url.includes('shop_id=') || url.includes('restaurantId=')) {
      const match = url.match(/(?:restaurant_id|shop_id|restaurantId)=([^&]+)/);
      if (match && match[1]) {
        restaurantId = match[1];
      }
    }

    const response = await originalFetch.apply(this, args);

    if (isPlatformApiUrl(url)) {
      if (response.ok) noteAuthSuccess();
      else noteAuthFailure(response.status, url);
    }

    try {
      if (
        url.includes('/order') ||
        url.includes('/store') ||
        url.includes('/report-restaurant') ||
        url.includes('/api/') ||
        url.includes('deliverynow.vn') ||
        url.includes('shopee')
      ) {
        const clone = response.clone();
        clone
          .json()
          .then((data) => {
            handleInterceptors(url, data);
          })
          .catch(() => {});
      }
    } catch (e) {
      console.error('[Shopee POS Relay] Fetch intercept error:', e);
    }

    return response;
  };

  // Intercept XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._url = url;
    return originalXhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      const url = this._url || '';
      if (isPlatformApiUrl(url)) {
        if (this.status >= 200 && this.status < 300) noteAuthSuccess();
        else noteAuthFailure(this.status, url);
      }
      try {
        if (
          url.includes('/order') ||
          url.includes('/store') ||
          url.includes('/report-restaurant') ||
          url.includes('/api/') ||
          url.includes('deliverynow.vn') ||
          url.includes('shopee')
        ) {
          const data = JSON.parse(this.responseText);
          handleInterceptors(url, data);
        }
      } catch (e) {
        // Ignore non-json responses
      }
    });

    return originalXhrSend.apply(this, args);
  };

  // API Call: Sync Available Status (1: Có bán, 2: Hết hàng hôm nay)
  async function setShopeeItemAvailableStatus(itemId, availableStatus) {
    try {
      console.log(`[Shopee POS Relay] Request to set item ${itemId} -> status ${availableStatus} (pending live merchant dish ID mapping)`);
      dispatchOrderEvent('SYNC_STATUS_RESULT', { itemId, availableStatus, success: false, pendingMapping: true });
    } catch (err) {
      console.error(`[Shopee POS Relay] Failed to update item status for ${itemId}:`, err);
    }
  }

  // API Call: Sync Stock / Daily Limit
  async function setShopeeItemStock(itemId, currentStock) {
    try {
      console.log(`[Shopee POS Relay] Request to set item ${itemId} -> stock ${currentStock} (pending live merchant dish ID mapping)`);
      dispatchOrderEvent('SYNC_STOCK_RESULT', { itemId, currentStock, success: false, pendingMapping: true });
    } catch (err) {
      console.error(`[Shopee POS Relay] Failed to update stock for ${itemId}:`, err);
    }
  }

  // Listen to commands from content.js
  window.addEventListener('message', (event) => {
    if (event.source !== window || event.data?.source !== 'SHOPEE_POS_RELAY_CONTENT') {
      return;
    }

    const { command, payload } = event.data;
    if (command === 'SET_AVAILABLE_STATUS') {
      setShopeeItemAvailableStatus(payload.itemId, payload.availableStatus);
    } else if (command === 'SET_ITEM_STOCK') {
      setShopeeItemStock(payload.itemId, payload.currentStock);
    }
  });
})();
