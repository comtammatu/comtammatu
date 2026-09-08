(function attachShopeeRelayState(root) {
  const MAX_PENDING = 300;
  const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

  function identity(value) {
    if (typeof value === 'number' && !Number.isSafeInteger(value)) return '';
    if (typeof value !== 'string' && typeof value !== 'number') return '';
    const text = String(value).trim();
    return text && text.length <= 100 && !['undefined', 'null'].includes(text) ? text : '';
  }

  function configuration(values) {
    try {
      const url = new URL(values.backendUrl);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
      if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) return null;
      const branchId = Number(values.branchId);
      if (!Number.isSafeInteger(branchId) || branchId <= 0) return null;
      return { backendUrl: url.origin, branchId };
    } catch { return null; }
  }

  function isMerchantUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && (
        ['partner.shopee.vn', 'partner.shopeefood.vn', 'merchant.shopeefood.vn'].includes(url.hostname)
        || url.hostname.endsWith('.foodypos.com')
      );
    } catch { return false; }
  }

  function validOrder(order) {
    return Boolean(order && identity(order.orderId) && identity(order.displayId || order.orderCode || order.orderId)
      && Array.isArray(order.items) && order.items.length > 0 && order.items.length <= 100
      && order.items.every((item) => item && typeof item.name === 'string' && item.name.trim()
        && item.name.length <= 200 && Number.isSafeInteger(item.quantity) && item.quantity > 0));
  }

  function key(target, order) {
    return JSON.stringify([target.backendUrl, target.branchId, 'shopee', identity(order.restaurantId), identity(order.orderId)]);
  }

  function prune(state, now) {
    return {
      pending: Array.isArray(state?.pending) ? state.pending : [],
      sent: (Array.isArray(state?.sent) ? state.sent : []).filter((row) => now - row.sentAt < RETENTION_MS).slice(-500),
    };
  }

  function enqueue(state, target, order, now) {
    const next = prune(state, now);
    const orderKey = key(target, order);
    if (next.sent.some((row) => row.key === orderKey)) return { state: next, status: 'sent' };
    if (next.pending.some((row) => row.key === orderKey)) return { state: next, status: 'queued' };
    if (next.pending.length >= MAX_PENDING) return { state: next, status: 'full' };
    next.pending = [...next.pending, { key: orderKey, target, order, createdAt: now, attempts: 0, nextAttemptAt: now }];
    return { state: next, status: 'queued' };
  }

  function sameTarget(left, right) {
    return Boolean(left && right && left.backendUrl === right.backendUrl && left.branchId === right.branchId);
  }

  root.ShopeeRelayState = Object.freeze({ identity, configuration, isMerchantUrl, validOrder, key, prune, enqueue, sameTarget });
})(globalThis);
