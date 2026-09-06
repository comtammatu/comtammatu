// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const backendUrlInput = document.getElementById("backendUrl");
  const branchIdInput = document.getElementById("branchId");
  const relaySecretInput = document.getElementById("relaySecret");
  const configForm = document.getElementById("configForm");
  const configPanel = document.getElementById("configPanel");
  const configSummary = document.getElementById("configSummary");
  const btnSave = document.getElementById("btnSave");
  const btnPing = document.getElementById("btnPing");
  const btnSyncMenu = document.getElementById("btnSyncMenu");
  const btnToggleSecret = document.getElementById("btnToggleSecret");
  const toast = document.getElementById("toast");
  const orderList = document.getElementById("orderList");
  const recentOrderCount = document.getElementById("recentOrderCount");
  const extVersionEl = document.getElementById("extVersion");
  const relayStatus = document.getElementById("relayStatus");
  const relayStatusTitle = document.getElementById("relayStatusTitle");
  const relayStatusMessage = document.getElementById("relayStatusMessage");
  const liveStatusLabel = document.getElementById("liveStatusLabel");
  const branchMetric = document.getElementById("branchMetric");
  const stockQueueMetric = document.getElementById("stockQueueMetric");
  const queueMetric = document.getElementById("queueMetric");
  const itemSyncHealthMetric = document.getElementById("itemSyncHealthMetric");
  const btnRecoverOrders = document.getElementById("btnRecoverOrders");
  const btnGrabTab = document.getElementById("btnGrabTab");
  const tabMetric = document.getElementById("tabMetric");
  const grabRoutePoint = document.getElementById("grabRoutePoint");
  const posRoutePoint = document.getElementById("posRoutePoint");
  const kitchenRoutePoint = document.getElementById("kitchenRoutePoint");
  const logList = document.getElementById("logList");
  const logSummary = document.getElementById("logSummary");
  const btnExportLogs = document.getElementById("btnExportLogs");
  const btnClearLogs = document.getElementById("btnClearLogs");
  let toastTimer = null;
  let currentSettings = {};
  let currentDiagnostics = null;
  let currentLogs = [];

  try {
    const manifest = chrome.runtime.getManifest();
    if (extVersionEl && manifest?.version) {
      extVersionEl.textContent = `v${manifest.version}`;
    }
  } catch (error) {
    console.warn("[Grab POS Relay] Cannot read extension version:", error);
  }

  function showToast(message, tone = "success") {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.hidden = false;
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      toastTimer = null;
    }, 3800);
  }

  function setButtonBusy(button, busy, busyLabel) {
    const label = button.querySelector(".button-label");
    if (!button.dataset.defaultLabel && label) {
      button.dataset.defaultLabel = label.textContent;
    }
    button.disabled = busy;
    button.dataset.busy = String(busy);
    button.setAttribute("aria-busy", String(busy));
    if (label) {
      label.textContent = busy ? busyLabel : button.dataset.defaultLabel;
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response || null);
      });
    });
  }

  function cleanUrlAndExtractBranch(rawUrl) {
    const url = rawUrl.trim().replace(/\/+$/, "");
    // A pasted POS route carries the trusted branch choice in its URL.
    const match = url.match(/^(https?:\/\/[^\/]+)(?:\/br\/(\d+)(?:\/.*)?)?$/i);
    if (match && match[1]) {
      return {
        origin: match[1],
        extractedBranchId: match[2] ? parseInt(match[2], 10) : null,
      };
    }
    return { origin: url, extractedBranchId: null };
  }

  function normalizeBranchId(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  function formatBackendHost(backendUrl) {
    try {
      return new URL(backendUrl).host;
    } catch {
      return backendUrl || "Chưa có máy chủ";
    }
  }

  function getPendingStockCount(syncState) {
    if (!syncState?.pendingStock || typeof syncState.pendingStock !== "object")
      return 0;
    return Object.keys(syncState.pendingStock).length;
  }

  function summarizeQueue(queue) {
    const items = Array.isArray(queue) ? queue : [];
    return {
      pending: items.filter(
        (item) => !item?.isTerminal && (item?.attempts || 0) === 0,
      ).length,
      retry: items.filter(
        (item) => !item?.isTerminal && (item?.attempts || 0) > 0,
      ).length,
      error: items.filter((item) => item?.isTerminal).length,
    };
  }

  async function requestBackendOrigin(backendUrl) {
    if (!chrome.permissions?.request) return true;
    try {
      const origin = `${new URL(backendUrl).origin}/*`;
      return await chrome.permissions.request({ origins: [origin] });
    } catch {
      return false;
    }
  }

  function updateOperationalStatus({
    isConfigured,
    diagnostics,
    branchId,
    backendUrl,
    pendingStockCount,
    queueSummary,
    itemSyncHealth,
    grabMerchantId,
  }) {
    currentDiagnostics = diagnostics || null;
    const merchantSuffix = grabMerchantId ? ` · Quán: ${grabMerchantId}` : "";
    configSummary.textContent = isConfigured
      ? `CN ${branchId}${merchantSuffix} · ${formatBackendHost(backendUrl)}`
      : "Chưa thiết lập máy chủ và chi nhánh";
    branchMetric.textContent = branchId
      ? `CN ${branchId}${grabMerchantId ? ` (${grabMerchantId})` : ""}`
      : "Chưa chọn chi nhánh";
    stockQueueMetric.textContent =
      pendingStockCount > 0 ? `Tồn: ${pendingStockCount} chờ` : "Tồn kho: OK";
    const summary = queueSummary || { pending: 0, retry: 0, error: 0 };
    queueMetric.textContent =
      summary.error > 0 || summary.retry > 0 || summary.pending > 0
        ? `Hàng đợi: ${summary.pending} mới · ${summary.retry} thử lại · ${summary.error} lỗi`
        : "Hàng đợi: 0";
    const failedCount = Array.isArray(itemSyncHealth?.failedIds)
      ? itemSyncHealth.failedIds.length
      : 0;
    const unmappedCount = Number(itemSyncHealth?.unmappedCount) || 0;
    if (failedCount > 0 || unmappedCount > 0) {
      itemSyncHealthMetric.textContent = `Món: ${failedCount} lỗi · ${unmappedCount} chưa ánh xạ`;
    } else if (itemSyncHealth?.lastOkAt) {
      itemSyncHealthMetric.textContent = "Đồng bộ món: OK";
    } else {
      itemSyncHealthMetric.textContent = "Đồng bộ món: Chưa chạy";
    }
    const tabCount = diagnostics?.tabCount || 0;
    const followerCount = diagnostics?.followerCount || 0;
    tabMetric.textContent =
      diagnostics?.status === "ready"
        ? `Tab: 1 chính · ${followerCount} phụ`
        : `Tab: ${tabCount} mở · chưa có tab trực`;
    posRoutePoint.dataset.state = isConfigured ? "ready" : "error";
    kitchenRoutePoint.dataset.state = isConfigured ? "ready" : "warning";
    btnGrabTab.hidden = false;

    if (!isConfigured) {
      grabRoutePoint.dataset.state =
        diagnostics?.status === "ready" ? "ready" : "warning";
      relayStatus.dataset.tone = "setup";
      relayStatusTitle.textContent = "Cần cấu hình POS";
      liveStatusLabel.textContent = "Cần xử lý";
      relayStatusMessage.textContent =
        "Lưu máy chủ và mã chi nhánh để bắt đầu chuyển đơn.";
      btnGrabTab.hidden = true;
      return;
    }

    if (!diagnostics || diagnostics.status === "no_tab") {
      grabRoutePoint.dataset.state = "error";
      relayStatus.dataset.tone = "waiting";
      relayStatusTitle.textContent = "Chưa mở Grab Merchant";
      liveStatusLabel.textContent = "Cần xử lý";
      relayStatusMessage.textContent =
        "Tiện ích không tự mở thêm tab. Hãy mở Grab để bắt đầu trực đơn.";
      btnGrabTab.querySelector(".button-label").textContent =
        "Mở Grab Merchant";
      return;
    }

    if (diagnostics.status === "auth_required") {
      grabRoutePoint.dataset.state = "error";
      relayStatus.dataset.tone = "setup";
      relayStatusTitle.textContent = "Cần đăng nhập lại Grab";
      liveStatusLabel.textContent = "Cần xử lý";
      relayStatusMessage.textContent =
        "Các tab Grab hiện tại chưa có phiên đăng nhập hợp lệ.";
      btnGrabTab.querySelector(".button-label").textContent = "Đến tab Grab";
      return;
    }

    if (diagnostics.status !== "ready") {
      grabRoutePoint.dataset.state = "warning";
      relayStatus.dataset.tone = "waiting";
      relayStatusTitle.textContent = "Grab chưa sẵn sàng";
      liveStatusLabel.textContent = "Đang kết nối";
      relayStatusMessage.textContent =
        "Đang chờ Merchant Portal cung cấp quán và phiên làm việc hợp lệ.";
      btnGrabTab.querySelector(".button-label").textContent = "Đến tab Grab";
      return;
    }

    grabRoutePoint.dataset.state = "ready";
    relayStatus.dataset.tone = "ready";
    relayStatusTitle.textContent = "Đang trực đơn";
    liveStatusLabel.textContent = "Hoạt động";
    relayStatusMessage.textContent = `Tab chính đang trực${followerCount > 0 ? `; ${followerCount} tab phụ vẫn lắng nghe` : ""}.`;
    btnGrabTab.querySelector(".button-label").textContent =
      "Chuyển đến Tab đang trực";
  }

  function createEmptyOrderState() {
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";

    const dot = document.createElement("span");
    dot.className = "empty-state-dot";
    dot.setAttribute("aria-hidden", "true");

    const copy = document.createElement("span");
    copy.textContent =
      "Chưa có đơn gần đây. Đơn đã chuyển về POS sẽ xuất hiện tại đây.";
    emptyState.append(dot, copy);
    return emptyState;
  }

  function retryQueuedOrder(order) {
    if (!order?.orderID) return;
    chrome.runtime.sendMessage(
      {
        action: "RETRY_QUEUE_ITEM",
        payload: {
          order: order.order || order,
          merchantId: order.merchantId || order.order?.merchant?.ID,
        },
      },
      () => {
        if (chrome.runtime.lastError) {
          showToast("Không thử lại được. Mở lại popup.", "error");
          return;
        }
        showToast(
          `Đã đưa đơn ${order.displayID || ""} vào hàng đợi lại.`,
          "success",
        );
      },
    );
  }

  function renderOrders(orders, queue) {
    const recentOrders = Array.isArray(orders) ? orders.slice(0, 8) : [];
    const queued = Array.isArray(queue)
      ? queue.filter((item) => item?.isTerminal || (item?.attempts || 0) > 0)
      : [];
    const rows = [
      ...queued.map((item) => ({
        ...item,
        status: item.isTerminal ? "error" : "retry",
        error: item.lastError,
        items: item.order?.itemInfo?.items
          ?.map((entry) => `${entry.quantity}x ${entry.name}`)
          .join(", "),
        canRetry: true,
      })),
      ...recentOrders,
    ].slice(0, 8);
    recentOrderCount.textContent = `${rows.length} đơn`;
    orderList.replaceChildren();

    if (rows.length === 0) {
      orderList.appendChild(createEmptyOrderState());
      return;
    }

    for (const order of rows) {
      const isError = order?.status === "error" || order?.status === "retry";
      const item = document.createElement("article");
      item.className = "order-item";
      item.dataset.tone = isError ? "error" : "success";

      const top = document.createElement("div");
      top.className = "order-top";
      const displayID = document.createElement("span");
      displayID.className = "order-code";
      displayID.textContent = String(order?.displayID || "Đơn Grab");
      const total = document.createElement("span");
      total.className = "order-total";
      total.textContent = String(order?.total || "0₫");
      top.append(displayID, total);

      const description = document.createElement("p");
      description.className = "order-description";
      description.textContent = isError
        ? String(order?.error || "Không chuyển được đơn về POS")
        : String(order?.items || "1 phần ăn");

      const meta = document.createElement("div");
      meta.className = "order-meta";
      const status = document.createElement("span");
      status.className = "order-status";
      status.textContent =
        order?.status === "retry"
          ? "Đang chờ thử lại"
          : isError
            ? "Cần xử lý"
            : "Đã chuyển POS";
      meta.appendChild(status);
      if (order?.canRetry || order?.status === "error") {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "order-retry";
        retry.textContent = "Thử lại";
        retry.addEventListener("click", () => retryQueuedOrder(order));
        meta.appendChild(retry);
      }
      if (order?.time) {
        const separator = document.createElement("span");
        separator.setAttribute("aria-hidden", "true");
        separator.textContent = "·";
        const time = document.createElement("span");
        time.textContent = String(order.time);
        meta.append(separator, time);
      }

      item.append(top, description, meta);
      orderList.appendChild(item);
    }
  }

  function renderLogs(logs) {
    currentLogs = Array.isArray(logs) ? logs : [];
    const issues = currentLogs.filter(
      (entry) => entry?.level === "warning" || entry?.level === "error",
    );
    logSummary.textContent =
      issues.length > 0
        ? `${issues.length} cảnh báo trong 7 ngày`
        : "Chưa có cảnh báo";
    logList.replaceChildren();
    if (issues.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "Chưa có sự cố gần đây.";
      logList.appendChild(empty);
      return;
    }
    for (const entry of issues.slice(0, 20)) {
      const row = document.createElement("article");
      row.className = "log-entry";
      row.dataset.level = entry.level;
      const time = document.createElement("time");
      time.className = "log-time";
      time.dateTime = new Date(entry.occurredAt).toISOString();
      time.textContent = new Date(entry.occurredAt).toLocaleTimeString(
        "vi-VN",
        {
          hour: "2-digit",
          minute: "2-digit",
        },
      );
      const message = document.createElement("span");
      message.className = "log-message";
      message.textContent = String(entry.message || "Sự cố Grab POS Relay");
      const code = document.createElement("span");
      code.className = "log-code";
      code.textContent = String(entry.code || "unknown");
      row.append(time, message, code);
      logList.appendChild(row);
    }
  }

  async function refreshLogs() {
    const response = await sendRuntimeMessage({ action: "GET_LOCAL_LOGS" });
    renderLogs(response?.success ? response.logs : []);
  }

  async function refreshOperationalStatus(settings) {
    const response = await sendRuntimeMessage({
      action: "GET_RELAY_DIAGNOSTICS",
    });
    const diagnostics = response?.success ? response.diagnostics : null;
    const branchId = normalizeBranchId(settings.branchId);
    const backendUrl = settings.backendUrl || "http://localhost:3000";
    updateOperationalStatus({
      isConfigured: branchId !== null && isHttpUrl(backendUrl),
      diagnostics,
      branchId,
      backendUrl,
      pendingStockCount: getPendingStockCount(settings.grabItemSyncStateV1),
      queueSummary: summarizeQueue(settings.grabRelayQueue),
      itemSyncHealth: settings.grabItemSyncHealth,
      grabMerchantId: diagnostics?.merchantId || settings.grabMerchantId,
    });
  }

  chrome.storage.local.get(
    [
      "backendUrl",
      "branchId",
      "relaySecret",
      "recentOrders",
      "grabItemSyncStateV1",
      "grabRelayQueue",
      "grabItemSyncHealth",
      "grabMerchantId",
    ],
    async (settings) => {
      currentSettings = settings;
      const backendUrl = settings.backendUrl || "http://localhost:3000";
      const branchId = normalizeBranchId(settings.branchId);
      const isConfigured = branchId !== null && isHttpUrl(backendUrl);

      backendUrlInput.value = backendUrl;
      branchIdInput.value = branchId ?? "";
      relaySecretInput.value = settings.relaySecret || "";
      configPanel.open = !isConfigured;
      renderOrders(settings.recentOrders, settings.grabRelayQueue);
      await Promise.all([refreshOperationalStatus(settings), refreshLogs()]);
    },
  );

  configForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const parsed = cleanUrlAndExtractBranch(backendUrlInput.value);
    const backendUrl = parsed.origin;
    const branchId =
      normalizeBranchId(branchIdInput.value) ?? parsed.extractedBranchId;
    if (!isHttpUrl(backendUrl)) {
      backendUrlInput.focus();
      showToast(
        "Nhập địa chỉ máy chủ bắt đầu bằng http:// hoặc https://.",
        "error",
      );
      return;
    }
    if (branchId === null) {
      branchIdInput.focus();
      showToast(
        "Nhập mã chi nhánh hợp lệ hoặc dán URL POS có /br/{id}.",
        "error",
      );
      return;
    }

    backendUrlInput.value = backendUrl;
    branchIdInput.value = branchId;
    const relaySecret = relaySecretInput.value.trim();
    setButtonBusy(btnSave, true, "Đang lưu");

    chrome.storage.local.set(
      { backendUrl, branchId, relaySecret },
      async () => {
        setButtonBusy(btnSave, false, "Đang lưu");
        if (chrome.runtime.lastError) {
          showToast("Không lưu được cấu hình. Hãy thử lại.", "error");
          return;
        }
        const granted = await requestBackendOrigin(backendUrl);
        if (!granted) {
          showToast(
            "Cần cấp quyền máy chủ POS. Bấm Kiểm tra rồi cho phép origin.",
            "error",
          );
        } else {
          showToast(`Đã lưu cấu hình cho chi nhánh ${branchId}.`, "success");
        }
        configPanel.open = false;
        currentSettings = {
          ...currentSettings,
          backendUrl,
          branchId,
          relaySecret,
        };
        await refreshOperationalStatus(currentSettings);
      },
    );
  });

  btnPing.addEventListener("click", async () => {
    const parsed = cleanUrlAndExtractBranch(backendUrlInput.value);
    const backendUrl = parsed.origin;
    if (!isHttpUrl(backendUrl)) {
      backendUrlInput.focus();
      showToast("Nhập địa chỉ máy chủ hợp lệ trước khi kiểm tra.", "error");
      return;
    }

    const relaySecret = relaySecretInput.value.trim();
    setButtonBusy(btnPing, true, "Đang kiểm tra");
    try {
      const granted = await requestBackendOrigin(backendUrl);
      if (!granted) {
        showToast(
          "Chrome chưa cho phép gọi máy chủ POS. Hãy cấp quyền origin.",
          "error",
        );
        return;
      }
      const headers = { "Content-Type": "application/json" };
      if (relaySecret) headers["x-grab-relay-secret"] = relaySecret;
      const response = await fetch(
        `${backendUrl}/api/webhooks/grabfood/relay`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ ping: true }),
        },
      );

      if (response.ok) {
        showToast("Kết nối POS thành công.", "success");
      } else if (response.status === 401) {
        showToast(
          "Khóa kết nối không đúng. Kiểm tra lại khóa bảo mật.",
          "error",
        );
      } else {
        showToast(`Máy chủ POS phản hồi HTTP ${response.status}.`, "error");
      }
    } catch {
      showToast(
        `Không thể kết nối tới ${formatBackendHost(backendUrl)}.`,
        "error",
      );
    } finally {
      setButtonBusy(btnPing, false, "Đang kiểm tra");
    }
  });

  btnToggleSecret.addEventListener("click", () => {
    const isVisible = relaySecretInput.type === "text";
    relaySecretInput.type = isVisible ? "password" : "text";
    btnToggleSecret.textContent = isVisible ? "Hiện" : "Ẩn";
    btnToggleSecret.setAttribute("aria-pressed", String(!isVisible));
    btnToggleSecret.setAttribute(
      "aria-label",
      isVisible ? "Hiện khóa kết nối" : "Ẩn khóa kết nối",
    );
    relaySecretInput.focus();
  });

  btnSyncMenu.addEventListener("click", async () => {
    setButtonBusy(btnSyncMenu, true, "Đang gửi lệnh");
    const response = await sendRuntimeMessage({ action: "FORCE_FULL_SYNC" });
    setButtonBusy(btnSyncMenu, false, "Đang gửi lệnh");
    if (response?.success) {
      showToast("Đã bắt đầu đồng bộ toàn bộ trạng thái và tồn kho.", "success");
    } else {
      showToast("Chưa có tab Grab sẵn sàng để đồng bộ.", "error");
    }
  });

  btnRecoverOrders.addEventListener("click", async () => {
    setButtonBusy(btnRecoverOrders, true, "Đang khôi phục");
    const response = await sendRuntimeMessage({
      action: "RECOVER_MISSED_ORDERS",
      force: true,
    });
    setButtonBusy(btnRecoverOrders, false, "Đang khôi phục");
    if (response?.success) {
      showToast("Đã yêu cầu khôi phục đơn đang mở trên Grab.", "success");
    } else {
      showToast("Chưa có tab Grab sẵn sàng để khôi phục đơn.", "error");
    }
  });

  btnGrabTab.addEventListener("click", async () => {
    setButtonBusy(btnGrabTab, true, "Đang mở");
    const response = await sendRuntimeMessage({
      action: "OPEN_OR_FOCUS_GRAB_TAB",
    });
    setButtonBusy(btnGrabTab, false, "Đang mở");
    if (!response?.success) showToast("Không mở được Grab Merchant.", "error");
    else if (response.created)
      showToast(
        "Đã mở Grab Merchant. Hãy đăng nhập nếu được yêu cầu.",
        "success",
      );
  });

  btnExportLogs.addEventListener("click", () => {
    const report = {
      exportedAt: new Date().toISOString(),
      extensionVersion: chrome.runtime.getManifest()?.version || null,
      branchId: normalizeBranchId(currentSettings.branchId),
      backendHost: formatBackendHost(currentSettings.backendUrl || ""),
      diagnostics: currentDiagnostics,
      logs: currentLogs,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `grab-pos-relay-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });

  btnClearLogs.addEventListener("click", async () => {
    if (!window.confirm("Xóa toàn bộ nhật ký Grab POS Relay trên máy này?"))
      return;
    const response = await sendRuntimeMessage({ action: "CLEAR_LOCAL_LOGS" });
    if (response?.success) {
      renderLogs([]);
      showToast("Đã xóa nhật ký trên máy.", "success");
    } else {
      showToast("Không xóa được nhật ký.", "error");
    }
  });

  setInterval(() => {
    refreshOperationalStatus(currentSettings).catch(() => {});
  }, 3000);
});
