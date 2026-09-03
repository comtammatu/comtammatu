(function attachGrabRelayQueue(root) {
  const MAX_LIVE_SLOTS = 3;
  const LEADER_STEAL_MS = 15 * 1000;
  const TERMINAL_HTTP = new Set([400, 401, 403, 422, 426]);

  function stableStringify(value) {
    if (value == null) return '';
    if (typeof value !== 'object') return String(value);
    if (Array.isArray(value)) {
      return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
    }
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  function contentFingerprint(order) {
    if (!order || typeof order !== 'object') return '';
    if (typeof order.contentFingerprint === 'string' && order.contentFingerprint) {
      return order.contentFingerprint;
    }
    return stableStringify({
      items: Array.isArray(order.itemInfo?.items)
        ? order.itemInfo.items.map((item) => ({
            itemID: item.itemID || '',
            name: item.name || '',
            quantity: item.quantity || 1,
            comment: item.comment || null,
            fare: {
              priceDisplay: item.fare?.priceDisplay || '',
              priceFloat: item.fare?.priceFloat ?? null,
              discountInfo: item.fare?.discountInfo || [],
            },
            discountInfo: item.discountInfo || [],
            modifiers: Array.isArray(item.modifierGroups)
              ? item.modifierGroups.map((group) => ({
                  id: group.modifierGroupID || '',
                  modifiers: Array.isArray(group.modifiers)
                    ? group.modifiers.map((modifier) => ({
                        id: modifier.modifierID || '',
                        name: modifier.modifierName || '',
                        quantity: modifier.quantity || 1,
                      }))
                    : [],
                }))
              : [],
          }))
        : [],
      fare: {
        subTotalDisplay: order.fare?.subTotalDisplay || '',
        totalDisplay: order.fare?.totalDisplay || '',
        discountDisplay: order.fare?.discountDisplay || '',
        orderLevelDiscounts: order.fare?.orderLevelDiscounts || order.orderLevelDiscounts || [],
      },
      cutlery: Number.isInteger(order.cutlery) ? order.cutlery : null,
    });
  }

  function buildQueueItem(order, settings, branchId, now, createdAt) {
    return {
      orderID: String(order.orderID),
      displayID: String(order.displayID || order.orderID),
      order,
      merchantId: String(settings.merchantId || order.merchant?.ID || ''),
      branchId,
      backendUrl: String(settings.backendUrl || 'http://localhost:3000'),
      relaySecret: String(settings.relaySecret || ''),
      contentFingerprint: contentFingerprint(order),
      action: order.action === 'amend' || order.action === 'cancel' ? order.action : 'create',
      attempts: 0,
      nextRetryAt: now,
      lastError: null,
      isTerminal: false,
      createdAt,
    };
  }

  function enqueueOrRevive(queue, order, settings, now = Date.now()) {
    if (!order || !order.orderID) {
      return { ok: false, error: 'Invalid order', queue };
    }
    const branchId = Number(settings.branchId);
    if (!Number.isInteger(branchId) || branchId <= 0) {
      return { ok: false, error: 'Missing branch configuration', queue };
    }

    const fingerprint = contentFingerprint(order);
    const existingIndex = queue.findIndex((queueItem) => queueItem.orderID === String(order.orderID));
    if (existingIndex === -1) {
      const item = buildQueueItem(order, settings, branchId, now, now);
      return {
        ok: true,
        action: 'enqueued',
        item,
        queue: [...queue, item],
      };
    }

    const existing = queue[existingIndex];
    const sameFingerprint =
      !fingerprint ||
      !existing.contentFingerprint ||
      existing.contentFingerprint === fingerprint;

    if (!existing.isTerminal && sameFingerprint) {
      return { ok: true, action: 'existing', item: existing, queue };
    }

    const createdAt = Number.isFinite(existing.createdAt) ? existing.createdAt : now;
    const item = buildQueueItem(order, settings, branchId, now, createdAt);
    if (item.action !== 'cancel') {
      item.action = 'amend';
    }
    const nextQueue = [...queue];
    nextQueue[existingIndex] = item;
    return {
      ok: true,
      action: existing.isTerminal ? 'revived' : 'updated',
      item,
      queue: nextQueue,
    };
  }

  function isDue(item, now) {
    return !item.isTerminal && Number(item.nextRetryAt || 0) <= now;
  }

  function selectDispatchJobs(queue, now, inFlight, maxSlots = MAX_LIVE_SLOTS) {
    const busy = new Set(Array.from(inFlight || [], String));
    const live = [];
    const retry = [];

    for (const item of queue) {
      if (!item || busy.has(String(item.orderID)) || !isDue(item, now)) continue;
      if ((item.attempts || 0) === 0) live.push(item);
      else retry.push(item);
    }

    const selected = [];
    for (const item of live) {
      if (selected.length >= maxSlots) break;
      selected.push({ orderID: String(item.orderID), lane: 'live' });
    }
    if (selected.length === 0) {
      for (const item of retry) {
        if (selected.length >= maxSlots) break;
        selected.push({ orderID: String(item.orderID), lane: 'retry' });
      }
    }
    return selected;
  }

  function applyDispatchOutcome(item, outcome) {
    const next = { ...item };
    next.attempts = (item.attempts || 0) + 1;
    next.lastError = outcome.ok ? null : outcome.error || `HTTP ${outcome.status || 0}`;

    if (outcome.ok) {
      return { keep: false, item: next };
    }

    if (TERMINAL_HTTP.has(outcome.status)) {
      next.isTerminal = true;
      return { keep: true, item: next };
    }

    if (next.attempts >= 5) {
      next.isTerminal = true;
      return { keep: true, item: next };
    }

    const delayMs = Math.min(60000, 5000 * Math.pow(2, next.attempts - 1));
    next.nextRetryAt = outcome.now + delayMs;
    return { keep: true, item: next };
  }

  function mergeQueueByOrderId(persisted, local) {
    const merged = new Map();
    for (const item of persisted || []) {
      if (item?.orderID) merged.set(String(item.orderID), item);
    }
    for (const item of local || []) {
      if (item?.orderID) merged.set(String(item.orderID), item);
    }
    return Array.from(merged.values()).slice(-50);
  }

  function toolbarBadgeText(queue, health) {
    const terminalCount = (queue || []).filter((item) => item?.isTerminal).length;
    const failedCount = Array.isArray(health?.failedIds) ? health.failedIds.length : 0;
    const total = terminalCount + failedCount;
    if (total <= 0) return '';
    return total > 99 ? '!' : String(total);
  }

  function isLeaderTab(leader, tabId, now, stealMs = LEADER_STEAL_MS) {
    if (!Number.isInteger(tabId) || tabId <= 0) return false;
    if (!leader || !Number.isInteger(leader.tabId) || !Number.isFinite(leader.heartbeatAt)) {
      return true;
    }
    if (now - leader.heartbeatAt > stealMs) return true;
    return leader.tabId === tabId;
  }

  root.GrabRelayQueue = Object.freeze({
    MAX_LIVE_SLOTS,
    contentFingerprint,
    enqueueOrRevive,
    selectDispatchJobs,
    applyDispatchOutcome,
    mergeQueueByOrderId,
    toolbarBadgeText,
    isLeaderTab,
  });
})(typeof self === 'undefined' ? globalThis : self);
