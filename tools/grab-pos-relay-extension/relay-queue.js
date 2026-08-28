(function attachGrabRelayQueue(root) {
  function buildQueueItem(order, settings, branchId, now, createdAt) {
    return {
      orderID: String(order.orderID),
      displayID: String(order.displayID || order.orderID),
      order,
      merchantId: String(settings.merchantId || order.merchant?.ID || ''),
      branchId,
      backendUrl: String(settings.backendUrl || 'http://localhost:3000'),
      relaySecret: String(settings.relaySecret || ''),
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
    if (!existing.isTerminal) {
      return { ok: true, action: 'existing', item: existing, queue };
    }

    const createdAt = Number.isFinite(existing.createdAt) ? existing.createdAt : now;
    const item = buildQueueItem(order, settings, branchId, now, createdAt);
    const nextQueue = [...queue];
    nextQueue[existingIndex] = item;
    return { ok: true, action: 'revived', item, queue: nextQueue };
  }

  root.GrabRelayQueue = Object.freeze({ enqueueOrRevive });
})(typeof self === 'undefined' ? globalThis : self);
