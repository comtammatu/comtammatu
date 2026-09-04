// injected.js - Runs in page context of merchant.grab.com
(function () {
  console.log('[Grab POS Relay] Injected script loaded into page context');

  const queuedOrderFingerprints = new Map();
  const dispatchedOrderFingerprints = new Map();
  const fetchingOrderIds = new Set();
  let merchantId = null;
  let lastSuccessfulPollAt = Date.now();
  let isLeaderTab = true;

  function resolveMerchantIdFromLocation(urlLike) {
    const targetUrl = urlLike || (typeof window !== 'undefined' ? window.location?.href : '');
    if (!targetUrl || typeof targetUrl !== 'string') return null;
    try {
      const parsed = new URL(targetUrl, 'https://merchant.grab.com');
      const KNOWN_NON_MERCHANT_SEGMENTS = new Set([
        'dashboard',
        'order',
        'orders',
        'food',
        'menu',
        'inventory',
        'preparing',
        'history',
        'cancelled',
        'scheduled',
        'completed',
        'active',
      ]);
      const pathMatch = parsed.pathname.match(/\/(?:food\/(?:menu|inventory)|merchants?|order)\/([A-Za-z0-9\-_]+)/i);
      if (pathMatch && pathMatch[1] && !KNOWN_NON_MERCHANT_SEGMENTS.has(pathMatch[1].toLowerCase())) {
        return pathMatch[1];
      }
      const queryId =
        parsed.searchParams.get('merchantID') ||
        parsed.searchParams.get('merchant_id') ||
        parsed.searchParams.get('merchantId');
      if (queryId && !KNOWN_NON_MERCHANT_SEGMENTS.has(queryId.toLowerCase())) {
        return queryId;
      }
    } catch (e) {
      const fallbackPath = targetUrl.match(/\/(?:food\/(?:menu|inventory)|merchants?|order)\/([A-Za-z0-9\-_]+)/i);
      if (fallbackPath && fallbackPath[1] && !['preparing', 'history', 'cancelled', 'scheduled', 'completed', 'active'].includes(fallbackPath[1].toLowerCase())) {
        return fallbackPath[1];
      }
      const fallbackQuery = targetUrl.match(/(?:merchantID|merchant_id|merchantId)=([^&]+)/i);
      if (fallbackQuery && fallbackQuery[1]) return fallbackQuery[1];
    }
    return null;
  }

  function setMerchantId(newId) {
    if (!newId || newId === merchantId) return;
    merchantId = newId;
    console.log(`[Grab POS Relay] Detected active Grab merchant ID: ${merchantId}`);
    dispatchOrderEvent('MERCHANT_ID_DETECTED', { merchantId });
  }

  // Active resolution from URL
  const initialMerchantId = resolveMerchantIdFromLocation();
  if (initialMerchantId) {
    setMerchantId(initialMerchantId);
  }

  try {
    window.addEventListener('popstate', () => {
      const locId = resolveMerchantIdFromLocation();
      if (locId) setMerchantId(locId);
    });

    const wrapHistory = (method) => {
      const original = history[method];
      if (typeof original === 'function') {
        history[method] = function (...args) {
          const result = original.apply(this, args);
          const nextId = resolveMerchantIdFromLocation();
          if (nextId) setMerchantId(nextId);
          return result;
        };
      }
    };
    wrapHistory('pushState');
    wrapHistory('replaceState');
  } catch (e) {}

  // 1. Keep-Alive: Override visibilityState so Grab portal never pauses background timers / WebSockets
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    window.addEventListener('visibilitychange', (e) => e.stopImmediatePropagation(), true);
  } catch (e) {}

  // 2. Keep-Alive: Silent AudioContext oscillator prevents Chrome from freezing background tab
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.00001; // Inaudible
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      // AudioContext created before any user gesture starts suspended per autoplay
      // policy; a suspended context plays nothing, so Chrome does not treat the tab
      // as active media. Resume on the first gesture.
      const resumeAudio = () => {
        if (ctx.state !== 'running') {
          ctx.resume().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', resumeAudio, { once: false, capture: true });
      window.addEventListener('keydown', resumeAudio, { once: false, capture: true });
      resumeAudio();
    }
  } catch (e) {}

  // 4. Auto-Recovery: Reload if stuck or disconnected for > 5 minutes
  setInterval(() => {
    if (Date.now() - lastSuccessfulPollAt > 5 * 60 * 1000) {
      console.log('[Grab POS Relay] Inactive for >5m, auto-reloading to restore connection...');
      window.location.reload();
    }
  }, 60000);

  // Grab APIs reuse authentication context observed on the portal's own
  // requests: bearer auth for order reads and cookie-session CSRF for mutations.
  let capturedAuthHeaders = null;
  let consecutiveAuthFailures = 0;
  let authExpired = false;

  const CAPTURED_HEADER_ALLOWLIST = [
    'authorization',
    'x-csrf-token',
    'x-client-id',
    'x-grabkit-clientid',
  ];

  const AUTH_FAILURE_THRESHOLD = 2;
  const POLL_INTERVAL_MS = 6000;
  const AUTH_RETRY_INTERVAL_MS = 60000;
  const ITEM_SYNC_GAP_MS = 400;
  const MAX_MUTATION_ATTEMPTS = 3;
  const MUTATION_TIMEOUT_MS = 15000;
  const MAX_ITEM_MUTATION_SLOTS = 2;
  let itemSyncActive = 0;
  const itemSyncWaiters = [];

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

  // Cache only the authentication context used by Grab Portal requests. Merge
  // cookie-session CSRF headers with bearer auth observed on other API calls.
  function captureAuthHeaders(headers) {
    const obj = headersToObject(headers);
    const nextHeaders = {};
    for (const name of CAPTURED_HEADER_ALLOWLIST) {
      if (obj[name]) nextHeaders[name] = obj[name];
    }
    if (nextHeaders.authorization || nextHeaders['x-csrf-token']) {
      capturedAuthHeaders = {
        ...(capturedAuthHeaders || {}),
        ...nextHeaders,
      };
    }
  }

  function buildGrabHeaders() {
    return {
      accept: 'application/json',
      requestsource: 'troyPortal',
      merchantid: merchantId,
      'x-client-id': 'GrabMerchant-Portal',
      'x-grabkit-clientid': 'grabmerchant-portal',
      ...(capturedAuthHeaders || {}),
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
    lastSuccessfulPollAt = Date.now();
    consecutiveAuthFailures = 0;
    if (authExpired) {
      authExpired = false;
      dispatchOrderEvent('AUTH_RECOVERED', {});
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function enqueueItemSync(operation) {
    const run = async () => {
      while (itemSyncActive >= MAX_ITEM_MUTATION_SLOTS) {
        await new Promise((resolve) => itemSyncWaiters.push(resolve));
      }
      itemSyncActive += 1;
      try {
        await operation();
        await delay(ITEM_SYNC_GAP_MS);
      } finally {
        itemSyncActive -= 1;
        const next = itemSyncWaiters.shift();
        if (next) next();
      }
    };
    void run();
  }

  function retryDelayMs(response, attempt) {
    const retryAfter = response.headers.get('retry-after');
    const retryAfterSeconds = retryAfter ? Number(retryAfter) : NaN;
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
      return Math.min(retryAfterSeconds * 1000, 30000);
    }
    return Math.min(1000 * 2 ** attempt, 10000);
  }

  async function responseError(response) {
    try {
      const text = (await response.text()).trim();
      return text ? text.slice(0, 500) : `HTTP ${response.status}`;
    } catch (error) {
      return `HTTP ${response.status}`;
    }
  }

  async function sendGrabMutation(url, init) {
    let response = null;
    for (let attempt = 0; attempt < MAX_MUTATION_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MUTATION_TIMEOUT_MS);
      try {
        response = await originalFetch(url, { ...init, signal: controller.signal });
      } catch (error) {
        if (attempt === MAX_MUTATION_ATTEMPTS - 1) throw error;
        await delay(Math.min(1000 * 2 ** attempt, 10000));
        continue;
      } finally {
        clearTimeout(timeoutId);
      }
      if (response.ok) {
        noteAuthSuccess();
        return { response, error: null };
      }

      noteAuthFailure(response.status, url);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_MUTATION_ATTEMPTS - 1) {
        return { response, error: await responseError(response) };
      }
      await delay(retryDelayMs(response, attempt));
    }

    return { response, error: 'Grab request failed' };
  }

  function isOrderEligibleForRelay(order, url = '') {
    const urlStr = String(url || '');
    if (
      urlStr.includes('PageType=History') ||
      urlStr.includes('PageType=Cancelled') ||
      urlStr.includes('PageType=Completed')
    ) {
      return false;
    }

    if (!order) return true; // URL-only check

    const rawState = String(order.orderState || order.state || order.status || '').toUpperCase();
    const terminalStates = ['COMPLETED', 'CANCELLED', 'DELIVERED', 'FAILED', 'EXPIRED', 'HISTORY'];
    if (terminalStates.includes(rawState)) {
      return false;
    }

    return true;
  }

  function optionalString(value) {
    return value == null ? undefined : String(value);
  }

  function optionalNonnegativeNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
  }

  function projectDiscountInfoEntry(rawDiscount) {
    if (!rawDiscount || typeof rawDiscount !== 'object' || Array.isArray(rawDiscount)) return null;
    return {
      discountName: optionalString(rawDiscount.discountName),
      discountType: optionalString(rawDiscount.discountType),
      itemDiscountPriceDisplay: optionalString(rawDiscount.itemDiscountPriceDisplay),
      itemDiscountPriceFloat: optionalNonnegativeNumber(rawDiscount.itemDiscountPriceFloat),
      itemDiscountPriceInMin: optionalNonnegativeNumber(rawDiscount.itemDiscountPriceInMin),
      discountAmountDisplay: optionalString(rawDiscount.discountAmountDisplay),
      discountAmountFloat: optionalNonnegativeNumber(rawDiscount.discountAmountFloat),
    };
  }

  function projectDiscountInfo(rawDiscount) {
    const discounts = Array.isArray(rawDiscount) ? rawDiscount : [rawDiscount];
    const projected = discounts.map(projectDiscountInfoEntry).filter(Boolean);
    return projected.length > 0 ? projected : undefined;
  }

  function projectOrderDiscount(rawDiscount) {
    if (!rawDiscount || typeof rawDiscount !== 'object') return null;
    return {
      discountType: optionalString(rawDiscount.discountType),
      discountAmountDisplay: optionalString(rawDiscount.discountAmountDisplay),
      discountAmountFloat: optionalNonnegativeNumber(rawDiscount.discountAmountFloat),
      description: optionalString(rawDiscount.description),
      code: optionalString(rawDiscount.code),
      itemID: optionalString(rawDiscount.itemID),
    };
  }

  function projectOrderDiscounts(rawDiscounts) {
    return Array.isArray(rawDiscounts) ? rawDiscounts.map(projectOrderDiscount).filter(Boolean) : undefined;
  }

  function projectAllowlistedOrder(rawOrder) {
    if (!rawOrder) return null;
    const rawOrderLevelDiscounts = Array.isArray(rawOrder.fare?.orderLevelDiscounts)
      ? rawOrder.fare.orderLevelDiscounts
      : Array.isArray(rawOrder.orderLevelDiscounts)
        ? rawOrder.orderLevelDiscounts
        : Array.isArray(rawOrder.promotions)
          ? rawOrder.promotions
          : undefined;
    return {
      orderID: String(rawOrder.orderID || ''),
      displayID: String(rawOrder.displayID || ''),
      orderState: String(rawOrder.orderState || rawOrder.state || rawOrder.status || ''),
      merchant: {
        ID: String(rawOrder.merchant?.ID || merchantId || ''),
      },
      itemInfo: {
        items: Array.isArray(rawOrder.itemInfo?.items)
          ? rawOrder.itemInfo.items.map((i) => ({
              itemID: optionalString(i.itemID),
              name: String(i.name || ''),
              quantity: Number(i.quantity) || 1,
              comment: i.comment ? String(i.comment).slice(0, 200) : null,
              fare: i.fare
                ? {
                    priceDisplay: optionalString(i.fare.priceDisplay),
                    originalItemPriceDisplay: optionalString(i.fare.originalItemPriceDisplay),
                    priceFloat: optionalNonnegativeNumber(i.fare.priceFloat),
                    priceInMin: optionalNonnegativeNumber(i.fare.priceInMin),
                    discountInfo: projectDiscountInfo(i.fare.discountInfo),
                  }
                : undefined,
              discountInfo: projectDiscountInfo(i.discountInfo),
              modifierGroups: Array.isArray(i.modifierGroups)
                ? i.modifierGroups.map((g) => ({
                    modifierGroupID: optionalString(g.modifierGroupID),
                    modifierGroupName: optionalString(g.modifierGroupName),
                    modifiers: Array.isArray(g.modifiers)
                      ? g.modifiers.map((m) => ({
                          modifierID: optionalString(m.modifierID),
                          modifierName: optionalString(m.modifierName),
                          priceDisplay: optionalString(m.priceDisplay),
                          quantity: Number.isInteger(m.quantity) && m.quantity > 0 ? m.quantity : 1,
                        }))
                      : [],
                  }))
                : [],
            }))
          : [],
      },
      fare: rawOrder.fare
        ? {
            subTotalDisplay: optionalString(rawOrder.fare.subTotalDisplay),
            totalDisplay: optionalString(rawOrder.fare.totalDisplay),
            discountDisplay: optionalString(rawOrder.fare.discountDisplay),
            orderLevelDiscounts: projectOrderDiscounts(rawOrderLevelDiscounts),
          }
        : undefined,
      cutlery: Number.isInteger(rawOrder.cutlery) ? rawOrder.cutlery : undefined,
      paymentMethod: 'platform',
    };
  }

  function contentFingerprint(order) {
    if (!order) return '';
    return JSON.stringify({
      items: Array.isArray(order.itemInfo?.items)
        ? order.itemInfo.items.map((item) => ({
            itemID: item.itemID || '',
            name: item.name || '',
            quantity: item.quantity || 1,
            comment: item.comment || null,
            fare: item.fare || null,
            discountInfo: item.discountInfo || null,
            modifierGroups: item.modifierGroups || [],
          }))
        : [],
      fare: order.fare || null,
      cutlery: Number.isInteger(order.cutlery) ? order.cutlery : null,
    });
  }

  function shouldFetchOrder(order) {
    if (!order?.orderID || !isOrderEligibleForRelay(order)) return false;
    const fingerprint = contentFingerprint(projectAllowlistedOrder(order) || order);
    if (queuedOrderFingerprints.get(order.orderID) === fingerprint) return false;
    if (dispatchedOrderFingerprints.get(order.orderID) === fingerprint) return false;
    if (fetchingOrderIds.has(order.orderID)) return false;
    return true;
  }

  function dispatchOrderDetailOnce(order) {
    if (!isOrderEligibleForRelay(order)) return;
    const cleanOrder = projectAllowlistedOrder(order);
    if (!cleanOrder) return;
    const fingerprint = contentFingerprint(cleanOrder);
    cleanOrder.contentFingerprint = fingerprint;
    if (queuedOrderFingerprints.get(cleanOrder.orderID) === fingerprint) return;
    if (dispatchedOrderFingerprints.get(cleanOrder.orderID) === fingerprint) return;
    dispatchedOrderFingerprints.set(cleanOrder.orderID, fingerprint);
    console.log(`[Grab POS Relay] Caught order detail: ${cleanOrder.displayID} (${cleanOrder.orderID})`);
    dispatchOrderEvent('ORDER_DETAIL', { order: cleanOrder, merchantId });
  }

  // Intercept fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

    if (isGrabApiUrl(url)) {
      captureAuthHeaders(args[1]?.headers || args[0]?.headers);
    }

    // Extract merchantId if present in query or path
    const extractedId = resolveMerchantIdFromLocation(url);
    if (extractedId) {
      setMerchantId(extractedId);
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

              if (isOrderEligibleForRelay(null, url)) {
                for (const order of data.orders) {
                  if (isOrderEligibleForRelay(order, url) && shouldFetchOrder(order)) {
                    fetchingOrderIds.add(order.orderID);
                    fetchOrderDetail(order.orderID).finally(() => {
                      fetchingOrderIds.delete(order.orderID);
                    });
                  }
                }
              }
            } else if (url.includes('/food/merchant/v3/orders/') && data.order) {
              if (isOrderEligibleForRelay(data.order, url)) {
                dispatchOrderDetailOnce(data.order);
              }
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
      } else {
        noteAuthFailure(res.status, url);
      }
    } catch (err) {
      console.error(`[Grab POS Relay] Failed fetching detail for order ${orderId}:`, err);
    }
  }

  // Active polling loop using native page fetch. Backs off to a slow probe
  // while the Grab session is expired so recovery is detected on its own.
  async function pollCancelledOrders() {
    if (!isLeaderTab || !merchantId) return;
    try {
      const url = `https://api.grab.com/delvplatformapi/merchant/v4/orders-pagination?AutoAcceptGroup=1&merchantID=${merchantId}&PageType=Cancelled&searchToken=&size=10`;
      const res = await originalFetch(url, {
        credentials: 'include',
        headers: buildGrabHeaders(),
      });
      if (res.ok) {
        noteAuthSuccess();
        const data = await res.json();
        if (Array.isArray(data.orders)) {
          for (const order of data.orders) {
            if (!order?.orderID) continue;
            dispatchOrderEvent('ORDER_CANCELLED', {
              orderID: order.orderID,
              displayID: order.displayID,
              merchantId,
            });
          }
        }
      } else {
        noteAuthFailure(res.status, url);
      }
    } catch (err) {
      // Network errors are not auth signals; keep polling quietly.
    }
  }

  async function pollOrders() {
    if (!isLeaderTab || !merchantId) return;
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
            if (shouldFetchOrder(o)) {
              fetchingOrderIds.add(o.orderID);
              try {
                await fetchOrderDetail(o.orderID);
              } finally {
                fetchingOrderIds.delete(o.orderID);
              }
            }
          }
        }
      } else {
        noteAuthFailure(res.status, url);
      }
    } catch (err) {
      // Network errors are not auth signals; keep polling quietly.
    }
  }

  // API Call: Sync Available Status (1: Có bán, 2: Hết hàng hôm nay, 3: Không về hàng nữa, 7: Ẩn giấu)
  async function setGrabItemAvailableStatus(requestId, itemId, availableStatus) {
    if (!itemId || !itemId.startsWith('VNITE')) {
      console.warn(`[Grab POS Relay] Skip status sync for non-item ID: ${itemId}`);
      dispatchOrderEvent('SYNC_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: null,
        statusStr: null,
        success: false,
        status: 0,
        error: 'Invalid item ID format',
      });
      return;
    }
    if (authExpired) {
      dispatchOrderEvent('SYNC_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: null,
        statusStr: null,
        success: false,
        status: 401,
        error: 'Grab session expired',
      });
      return;
    }
    if (!merchantId) {
      console.warn(`[Grab POS Relay] Skip status sync for ${itemId}: merchantId not detected yet`);
      dispatchOrderEvent('SYNC_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: null,
        statusStr: null,
        success: false,
        status: 0,
        error: 'Grab merchant ID not resolved yet',
      });
      return;
    }
    try {
      let statusCode = 1;
      let statusStr = 'AVAILABLE';

      // 1: Có bán (AVAILABLE)
      if (availableStatus === 1 || availableStatus === 'AVAILABLE') {
        statusCode = 1;
        statusStr = 'AVAILABLE';
      }
      // 2: Hết hàng hôm nay (UNAVAILABLE_TODAY - tự động mở lại 00:00 sáng mai)
      else if (availableStatus === 2 || availableStatus === 'UNAVAILABLE_TODAY' || availableStatus === 'UNAVAILABLE') {
        statusCode = 2;
        statusStr = 'UNAVAILABLE_TODAY';
      }
      // 3: Không về hàng nữa (UNAVAILABLE_INDEFINITELY / DISCONTINUED)
      else if (availableStatus === 3 || availableStatus === 'UNAVAILABLE_INDEFINITELY' || availableStatus === 'DISCONTINUED') {
        statusCode = 3;
        statusStr = 'UNAVAILABLE_INDEFINITELY';
      }
      // 7: Ẩn giấu (HIDDEN)
      else if (availableStatus === 7 || availableStatus === 'HIDDEN' || availableStatus === 'INACTIVE') {
        statusCode = 7;
        statusStr = 'HIDDEN';
      } else {
        dispatchOrderEvent('SYNC_STATUS_RESULT', {
          requestId,
          itemId,
          availableStatus: null,
          statusStr: null,
          success: false,
          status: 0,
          error: 'Invalid available status',
        });
        return;
      }

      const url = 'https://api.grab.com/food/merchant/v1/items/available-status';
      const { response: res, error } = await sendGrabMutation(url, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          ...buildGrabHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          itemIDs: [itemId],
          availableStatus: statusCode,
        }),
      });

      console.log(`[Grab POS Relay] Updated status for item ${itemId} -> code: ${statusCode} (${statusStr}) (HTTP ${res.status})`);
      dispatchOrderEvent('SYNC_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: statusCode,
        statusStr,
        success: res.ok,
        status: res.status,
        error,
      });
    } catch (err) {
      console.error(`[Grab POS Relay] Failed to update item status for ${itemId}:`, err);
      dispatchOrderEvent('SYNC_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: null,
        statusStr: null,
        success: false,
        status: 0,
        error: String(err),
      });
    }
  }

  // API Call: Sync Modifier Available Status (1: Có bán, 2: Hết hàng hôm nay)
  async function setGrabModifierAvailableStatus(requestId, itemId, availableStatus) {
    if (!itemId || !itemId.startsWith('VNMOD')) {
      console.warn(`[Grab POS Relay] Skip modifier status sync for invalid ID: ${itemId}`);
      dispatchOrderEvent('SYNC_MODIFIER_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: null,
        statusStr: null,
        success: false,
        status: 0,
        error: 'Invalid modifier ID format',
      });
      return;
    }
    if (authExpired) {
      dispatchOrderEvent('SYNC_MODIFIER_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: null,
        statusStr: null,
        success: false,
        status: 401,
        error: 'Grab session expired',
      });
      return;
    }
    if (!merchantId) {
      console.warn(`[Grab POS Relay] Skip modifier status sync for ${itemId}: merchantId not detected yet`);
      dispatchOrderEvent('SYNC_MODIFIER_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: null,
        statusStr: null,
        success: false,
        status: 0,
        error: 'Grab merchant ID not resolved yet',
      });
      return;
    }

    let statusCode;
    let statusStr;
    if (availableStatus === 1 || availableStatus === 'AVAILABLE') {
      statusCode = 1;
      statusStr = 'AVAILABLE';
    } else if (
      availableStatus === 2 ||
      availableStatus === 'UNAVAILABLE_TODAY' ||
      availableStatus === 'UNAVAILABLE'
    ) {
      statusCode = 2;
      statusStr = 'UNAVAILABLE_TODAY';
    } else {
      dispatchOrderEvent('SYNC_MODIFIER_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: null,
        statusStr: null,
        success: false,
        status: 0,
        error: 'Invalid modifier available status',
      });
      return;
    }

    try {
      const url = 'https://api.grab.com/food/merchant/v2/modifiers/available';
      const { response: res, error } = await sendGrabMutation(url, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          ...buildGrabHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          availableStatus: statusCode,
          modifierIDs: [itemId],
        }),
      });

      console.log(`[Grab POS Relay] Updated modifier ${itemId} -> code: ${statusCode} (${statusStr}) (HTTP ${res.status})`);
      dispatchOrderEvent('SYNC_MODIFIER_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: statusCode,
        statusStr,
        success: res.ok,
        status: res.status,
        error,
      });
    } catch (err) {
      console.error(`[Grab POS Relay] Failed to update modifier status for ${itemId}:`, err);
      dispatchOrderEvent('SYNC_MODIFIER_STATUS_RESULT', {
        requestId,
        itemId,
        availableStatus: null,
        statusStr: null,
        success: false,
        status: 0,
        error: String(err),
      });
    }
  }

  // API Call: Sync Stock / Daily Limit (IMS)
  async function setGrabItemStock(requestId, itemId, currentStock) {
    if (!itemId || !itemId.startsWith('VNITE')) {
      console.warn(`[Grab POS Relay] Skip stock sync for non-item ID: ${itemId}`);
      dispatchOrderEvent('SYNC_STOCK_RESULT', {
        requestId,
        itemId,
        currentStock,
        enableIms: false,
        success: false,
        status: 0,
        error: 'Invalid item ID format',
      });
      return;
    }
    if (!Number.isInteger(currentStock) || currentStock < 1 || currentStock > 9999) {
      dispatchOrderEvent('SYNC_STOCK_RESULT', {
        requestId,
        itemId,
        currentStock,
        enableIms: false,
        success: false,
        status: 0,
        error: 'Stock must be an integer from 1 to 9999',
      });
      return;
    }
    if (authExpired) {
      dispatchOrderEvent('SYNC_STOCK_RESULT', {
        requestId,
        itemId,
        currentStock,
        enableIms: false,
        success: false,
        status: 401,
        error: 'Grab session expired',
      });
      return;
    }
    if (!merchantId) {
      console.warn(`[Grab POS Relay] Skip stock sync for ${itemId}: merchantId not detected yet`);
      dispatchOrderEvent('SYNC_STOCK_RESULT', {
        requestId,
        itemId,
        currentStock,
        enableIms: false,
        success: false,
        status: 0,
        error: 'Grab merchant ID not resolved yet',
      });
      return;
    }
    try {
      const stockVal = currentStock;
      const stockSignature = `enabled:${stockVal}`;

      const url = `https://api.grab.com/food/merchant/v1/items/${itemId}/upsert-item-stock`;
      const { response: res, error } = await sendGrabMutation(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...buildGrabHeaders(),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          enableIms: true,
          currentStock: stockVal,
          enableRestock: false,
          restockSetting: null,
        }),
      });

      console.log(`[Grab POS Relay] Updated stock for item ${itemId} -> current: ${stockVal} (HTTP ${res.status})`);
      dispatchOrderEvent('SYNC_STOCK_RESULT', {
        requestId,
        itemId,
        currentStock: stockVal,
        enableIms: true,
        stockSignature,
        success: res.ok,
        status: res.status,
        error,
      });
    } catch (err) {
      console.error(`[Grab POS Relay] Failed to update stock for ${itemId}:`, err);
      dispatchOrderEvent('SYNC_STOCK_RESULT', {
        requestId,
        itemId,
        currentStock,
        enableIms: false,
        success: false,
        status: 0,
        error: String(err),
      });
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

      const extractedId = resolveMerchantIdFromLocation(this._relayUrl || '');
      if (extractedId) {
        setMerchantId(extractedId);
      }

      this.addEventListener('load', function () {
        if (this.status >= 200 && this.status < 300) noteAuthSuccess();
        else noteAuthFailure(this.status, this._relayUrl);

        try {
          const url = this._relayUrl || '';
          const data = JSON.parse(this.responseText);
          if (url.includes('/orders-pagination') && Array.isArray(data.orders)) {
            dispatchOrderEvent('ORDERS_PAGINATION', { url, data, merchantId });
            if (isOrderEligibleForRelay(null, url)) {
              for (const order of data.orders) {
                if (isOrderEligibleForRelay(order, url) && shouldFetchOrder(order)) {
                  fetchingOrderIds.add(order.orderID);
                  fetchOrderDetail(order.orderID).finally(() => {
                    fetchingOrderIds.delete(order.orderID);
                  });
                }
              }
            }
          } else if (url.includes('/food/merchant/v3/orders/') && data.order) {
            if (isOrderEligibleForRelay(data.order, url)) {
              dispatchOrderDetailOnce(data.order);
            }
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
      enqueueItemSync(() =>
        setGrabItemAvailableStatus(payload?.requestId, payload?.itemId, payload?.availableStatus)
      );
    } else if (command === 'SET_MODIFIER_AVAILABLE_STATUS') {
      enqueueItemSync(() =>
        setGrabModifierAvailableStatus(payload?.requestId, payload?.itemId, payload?.availableStatus)
      );
    } else if (command === 'SET_ITEM_STOCK') {
      enqueueItemSync(() =>
        setGrabItemStock(payload?.requestId, payload?.itemId, payload?.currentStock)
      );
    } else if (command === 'SET_LEADER') {
      isLeaderTab = Boolean(payload?.isLeader);
    } else if (command === 'MARK_ORDER_QUEUED') {
      if (payload?.orderID && payload?.contentFingerprint) {
        queuedOrderFingerprints.set(payload.orderID, payload.contentFingerprint);
      }
    } else if (command === 'MARK_ORDER_QUEUE_FAILED') {
      if (
        payload?.orderID &&
        dispatchedOrderFingerprints.get(payload.orderID) === payload.contentFingerprint
      ) {
        dispatchedOrderFingerprints.delete(payload.orderID);
      }
    } else if (command === 'RECOVER_MISSED_ORDERS') {
      pollOrders();
      pollCancelledOrders();
    }
  });

  // Self-scheduling poll loop: slows to a probe while the session is expired.
  function schedulePoll() {
    setTimeout(async () => {
      await pollOrders();
      await pollCancelledOrders();
      schedulePoll();
    }, authExpired ? AUTH_RETRY_INTERVAL_MS : POLL_INTERVAL_MS);
  }

  setTimeout(async () => {
    await pollOrders();
    await pollCancelledOrders();
    schedulePoll();
  }, 1500);
})();
