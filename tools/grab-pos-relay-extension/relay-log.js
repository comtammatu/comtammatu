(function attachGrabRelayLog(root) {
  const LOG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const MAX_LOGS = 500;
  const ALLOWED_CONTEXT_KEYS = new Set([
    "tabId",
    "previousTabId",
    "leaderTabId",
    "generation",
    "reason",
    "status",
    "tabCount",
    "readyTabCount",
    "merchantId",
    "action",
  ]);

  function sanitizeContext(context) {
    const clean = {};
    if (!context || typeof context !== "object" || Array.isArray(context))
      return clean;
    for (const [key, value] of Object.entries(context)) {
      if (!ALLOWED_CONTEXT_KEYS.has(key)) continue;
      if (typeof value === "string") clean[key] = value.slice(0, 160);
      else if (typeof value === "number" && Number.isFinite(value))
        clean[key] = value;
      else if (typeof value === "boolean") clean[key] = value;
      else if (value === null) clean[key] = null;
    }
    return clean;
  }

  function append(existing, event, now = Date.now()) {
    const retained = (Array.isArray(existing) ? existing : []).filter(
      (entry) =>
        Number.isFinite(entry?.occurredAt) &&
        now - entry.occurredAt <= LOG_TTL_MS,
    );
    const level =
      event?.level === "error" || event?.level === "warning"
        ? event.level
        : "info";
    const entry = {
      id: `${now}_${Math.random().toString(36).slice(2, 9)}`,
      occurredAt: now,
      level,
      area:
        typeof event?.area === "string" ? event.area.slice(0, 48) : "runtime",
      code:
        typeof event?.code === "string" ? event.code.slice(0, 80) : "unknown",
      message:
        typeof event?.message === "string"
          ? event.message.slice(0, 240)
          : "Không có mô tả",
      context: sanitizeContext(event?.context),
    };
    return [entry, ...retained].slice(0, MAX_LOGS);
  }

  function prune(existing, now = Date.now()) {
    return (Array.isArray(existing) ? existing : [])
      .filter(
        (entry) =>
          Number.isFinite(entry?.occurredAt) &&
          now - entry.occurredAt <= LOG_TTL_MS,
      )
      .slice(0, MAX_LOGS);
  }

  root.GrabRelayLog = Object.freeze({
    LOG_TTL_MS,
    MAX_LOGS,
    append,
    prune,
    sanitizeContext,
  });
})(typeof self === "undefined" ? globalThis : self);
