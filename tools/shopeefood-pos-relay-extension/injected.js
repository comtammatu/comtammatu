(function () {
  if (window.__shopeePosRelayInstalled) return;
  window.__shopeePosRelayInstalled = true;
  let authExpired = false;

  // MAIN runs without extension APIs. Validate again at the worker boundary.
  function readId(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return '';
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const text = String(value).trim();
    return text && text.length <= 100 && !['undefined', 'null'].includes(text) ? text : '';
  }

  function orderUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      if (url.protocol !== 'https:') return false;
      const allowed = ['partner.shopee.vn', 'partner.shopeefood.vn', 'merchant.shopeefood.vn', 'gmerchant.deliverynow.vn'].includes(url.hostname) || url.hostname.endsWith('.foodypos.com');
      return allowed && /(?:\/order(?:s|_|\/|$)|\/report-restaurant)/.test(url.pathname);
    } catch { return false; }
  }

  function dispatch(type, data) {
    window.postMessage({ source: 'SHOPEE_POS_RELAY_INJECTED', type, data }, window.location.origin);
  }

  function normalizeShopeeItem(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const name = rawItem.name || rawItem.dish_name || rawItem.itemName;
    const quantity = Number(rawItem.quantity ?? rawItem.count ?? rawItem.qty);
    if (typeof name !== 'string' || !name.trim() || !Number.isSafeInteger(quantity) || quantity <= 0) return null;
    const options = rawItem.options || rawItem.modifiers || rawItem.topping_list || [];
    if (!Array.isArray(options)) return null;
    return {
      itemId: rawItem.id ?? rawItem.itemId ?? rawItem.item_id ?? rawItem.dish_id,
      name, quantity,
      price: rawItem.price ?? rawItem.item_price ?? rawItem.unit_price,
      note: rawItem.note || rawItem.item_note || rawItem.comment || null,
      options: options.map((option) => ({
        optionId: option.id ?? option.optionId ?? option.topping_id,
        name: option.name || option.topping_name || option.optionName,
        price: option.price ?? option.topping_price,
        quantity: option.quantity ?? option.count ?? 1,
      })),
    };
  }

  function normalizeShopeeOrder(rawOrder) {
    if (!rawOrder || typeof rawOrder !== 'object') return null;
    const orderId = readId(rawOrder.order_id ?? rawOrder.orderId ?? rawOrder.id ?? rawOrder.order_code ?? rawOrder.orderCode);
    if (!orderId) return null;
    const rawList = rawOrder.items || rawOrder.dish_list || rawOrder.dishList || rawOrder.order_items || rawOrder.orderItems || rawOrder.dishes;
    if (!Array.isArray(rawList) || !rawList.length) return null;
    const items = rawList.map(normalizeShopeeItem);
    if (items.some((item) => !item)) return null;
    const orderCode = readId(rawOrder.order_code ?? rawOrder.orderCode ?? rawOrder.display_id ?? rawOrder.displayId) || orderId;
    const displayId = readId(rawOrder.display_id ?? rawOrder.displayId ?? rawOrder.short_code) || orderCode;
    const order = {
      orderId, orderCode, displayId, items,
      restaurantId: readId(rawOrder.restaurant_id ?? rawOrder.restaurantId),
      storeId: readId(rawOrder.store_id ?? rawOrder.storeId),
      subtotal: rawOrder.subtotal ?? rawOrder.sub_total ?? rawOrder.item_total,
      total: rawOrder.total ?? rawOrder.total_price ?? rawOrder.total_amount ?? rawOrder.grand_total,
      paymentMethod: rawOrder.payment_method,
      needCutlery: rawOrder.need_cutlery ?? rawOrder.needCutlery ?? rawOrder.cutlery ?? rawOrder.is_cutlery_needed,
      note: rawOrder.note || rawOrder.customer_note || rawOrder.remark || null,
    };
    return items.length <= 100 ? order : null;
  }

  function capture(url, data) {
    if (!orderUrl(url) || !data || typeof data !== 'object') return;
    const orders = data.data?.orders || data.data?.order_list || data.data?.list || data.orders || data.order_list || (Array.isArray(data.data) ? data.data : null);
    const detail = data.data?.order || data.data?.order_detail || data.order || (data.order_id || data.order_code ? data : null);
    for (const rawOrder of Array.isArray(orders) ? orders : detail ? [detail] : []) {
      const order = normalizeShopeeOrder(rawOrder);
      // Persistence and deduplication belong to the worker after validation.
      if (order) dispatch('ORDER_DETAIL', { order });
    }
  }

  function observeStatus(status) {
    if (status === 401 || status === 403) {
      authExpired = true;
      dispatch('AUTH_EXPIRED', {});
    } else if (authExpired && status >= 200 && status < 300) {
      authExpired = false;
      dispatch('AUTH_RECOVERED', {});
    }
  }

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' || args[0] instanceof URL ? String(args[0]) : args[0]?.url;
    const response = await originalFetch.apply(this, args);
    if (orderUrl(url)) {
      observeStatus(response.status);
      if (response.ok) response.clone().json().then((data) => capture(url, data)).catch(() => {});
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const urls = new WeakMap();
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    urls.set(this, String(url));
    return originalOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      const url = urls.get(this);
      if (!orderUrl(url)) return;
      observeStatus(this.status);
      if (this.status < 200 || this.status >= 300) return;
      try { capture(url, this.responseType === 'json' ? this.response : JSON.parse(this.responseText)); } catch {}
    }, { once: true });
    return originalSend.apply(this, args);
  };
})();
