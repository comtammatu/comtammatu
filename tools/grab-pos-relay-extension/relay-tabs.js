(function attachGrabRelayTabs(root) {
  const TAB_HEARTBEAT_MS = 10 * 1000;
  const TAB_STALE_MS = 45 * 1000;

  function asTimestamp(value) {
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function normalizeAuthState(value) {
    return value === "ready" || value === "expired" ? value : "unknown";
  }

  function normalizeTab(tabId, payload, now, existing) {
    return {
      tabId,
      pageReady: payload?.pageReady === true,
      merchantId:
        typeof payload?.merchantId === "string" ? payload.merchantId : "",
      authState: normalizeAuthState(payload?.authState),
      visible: payload?.visible === true,
      lastHeartbeatAt: now,
      lastGrabActivityAt:
        asTimestamp(payload?.lastGrabActivityAt) ||
        existing?.lastGrabActivityAt ||
        null,
      lastPollSuccessAt:
        asTimestamp(payload?.lastPollSuccessAt) ||
        existing?.lastPollSuccessAt ||
        null,
      registeredAt: existing?.registeredAt || now,
    };
  }

  function isFresh(tab, now, staleMs = TAB_STALE_MS) {
    return Boolean(
      tab &&
      Number.isInteger(tab.tabId) &&
      tab.tabId > 0 &&
      Number.isFinite(tab.lastHeartbeatAt) &&
      now - tab.lastHeartbeatAt <= staleMs,
    );
  }

  function isEligible(tab, now, staleMs = TAB_STALE_MS) {
    return Boolean(
      isFresh(tab, now, staleMs) &&
      tab.pageReady === true &&
      tab.authState === "ready" &&
      typeof tab.merchantId === "string" &&
      tab.merchantId.length > 0,
    );
  }

  function upsertTab(state, tabId, payload, now = Date.now()) {
    if (!Number.isInteger(tabId) || tabId <= 0) return state;
    const tabs = Array.isArray(state?.tabs) ? [...state.tabs] : [];
    const index = tabs.findIndex((tab) => tab?.tabId === tabId);
    const existing = index >= 0 ? tabs[index] : null;
    const next = normalizeTab(tabId, payload, now, existing);
    if (index >= 0) tabs[index] = next;
    else tabs.push(next);
    return {
      tabs,
      leaderTabId: Number.isInteger(state?.leaderTabId)
        ? state.leaderTabId
        : null,
      generation: Number.isInteger(state?.generation) ? state.generation : 0,
    };
  }

  function markUnavailable(state, tabId) {
    const tabs = (state?.tabs || []).map((tab) =>
      tab?.tabId === tabId
        ? { ...tab, pageReady: false, authState: "unknown" }
        : tab,
    );
    return { ...state, tabs };
  }

  function removeTab(state, tabId) {
    return {
      ...state,
      tabs: (state?.tabs || []).filter((tab) => tab?.tabId !== tabId),
    };
  }

  function compareCandidates(left, right) {
    if (left.visible !== right.visible) return left.visible ? -1 : 1;
    const leftActivity = left.lastGrabActivityAt || 0;
    const rightActivity = right.lastGrabActivityAt || 0;
    if (leftActivity !== rightActivity) return rightActivity - leftActivity;
    return left.tabId - right.tabId;
  }

  function reconcile(state, now = Date.now(), staleMs = TAB_STALE_MS) {
    const tabs = Array.isArray(state?.tabs) ? state.tabs : [];
    const previousLeaderTabId = Number.isInteger(state?.leaderTabId)
      ? state.leaderTabId
      : null;
    const current = tabs.find((tab) => tab?.tabId === previousLeaderTabId);
    let leaderTabId = isEligible(current, now, staleMs)
      ? previousLeaderTabId
      : null;

    if (leaderTabId === null) {
      const candidates = tabs
        .filter((tab) => isEligible(tab, now, staleMs))
        .sort(compareCandidates);
      leaderTabId = candidates[0]?.tabId ?? null;
    }

    const changed = leaderTabId !== previousLeaderTabId;
    return {
      state: {
        tabs,
        leaderTabId,
        generation:
          (Number.isInteger(state?.generation) ? state.generation : 0) +
          (changed ? 1 : 0),
      },
      changed,
      previousLeaderTabId,
      leaderTabId,
    };
  }

  function diagnostics(state, now = Date.now(), staleMs = TAB_STALE_MS) {
    const tabs = (state?.tabs || []).filter((tab) =>
      isFresh(tab, now, staleMs),
    );
    const leader = tabs.find((tab) => tab.tabId === state?.leaderTabId) || null;
    const ready = Boolean(leader && isEligible(leader, now, staleMs));
    let status = "starting";
    if (tabs.length === 0) status = "no_tab";
    else if (ready) status = "ready";
    else if (tabs.some((tab) => tab.authState === "expired"))
      status = "auth_required";

    return {
      status,
      leaderTabId: ready ? leader.tabId : null,
      generation: Number.isInteger(state?.generation) ? state.generation : 0,
      tabCount: tabs.length,
      readyTabCount: tabs.filter((tab) => isEligible(tab, now, staleMs)).length,
      followerCount: ready ? Math.max(0, tabs.length - 1) : tabs.length,
      merchantId: ready
        ? leader.merchantId
        : tabs.find((tab) => tab.merchantId)?.merchantId || "",
      lastGrabActivityAt: ready ? leader.lastGrabActivityAt : null,
      lastPollSuccessAt: ready ? leader.lastPollSuccessAt : null,
      tabs: tabs.map((tab) => ({
        tabId: tab.tabId,
        role: ready && tab.tabId === leader.tabId ? "leader" : "follower",
        ready: isEligible(tab, now, staleMs),
        authState: tab.authState,
        visible: tab.visible,
      })),
    };
  }

  root.GrabRelayTabs = Object.freeze({
    TAB_HEARTBEAT_MS,
    TAB_STALE_MS,
    upsertTab,
    markUnavailable,
    removeTab,
    isEligible,
    reconcile,
    diagnostics,
  });
})(typeof self === "undefined" ? globalThis : self);
