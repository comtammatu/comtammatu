// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const backendUrlInput = document.getElementById('backendUrl');
  const branchIdInput = document.getElementById('branchId');
  const relaySecretInput = document.getElementById('relaySecret');
  const configForm = document.getElementById('configForm');
  const configPanel = document.getElementById('configPanel');
  const configSummary = document.getElementById('configSummary');
  const btnSave = document.getElementById('btnSave');
  const btnPing = document.getElementById('btnPing');
  const btnSyncMenu = document.getElementById('btnSyncMenu');
  const btnToggleSecret = document.getElementById('btnToggleSecret');
  const toast = document.getElementById('toast');
  const orderList = document.getElementById('orderList');
  const recentOrderCount = document.getElementById('recentOrderCount');
  const extVersionEl = document.getElementById('extVersion');
  const relayStatus = document.getElementById('relayStatus');
  const relayStatusTitle = document.getElementById('relayStatusTitle');
  const relayStatusMessage = document.getElementById('relayStatusMessage');
  const liveStatusLabel = document.getElementById('liveStatusLabel');
  const branchMetric = document.getElementById('branchMetric');
  const stockQueueMetric = document.getElementById('stockQueueMetric');
  const queueMetric = document.getElementById('queueMetric');
  const itemSyncHealthMetric = document.getElementById('itemSyncHealthMetric');
  const btnRecoverOrders = document.getElementById('btnRecoverOrders');
  let toastTimer = null;

  try {
    const manifest = chrome.runtime.getManifest();
    if (extVersionEl && manifest?.version) {
      extVersionEl.textContent = `v${manifest.version}`;
    }
  } catch (error) {
    console.warn('[Grab POS Relay] Cannot read extension version:', error);
  }

  function showToast(message, tone = 'success') {
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
    const label = button.querySelector('.button-label');
    if (!button.dataset.defaultLabel && label) {
      button.dataset.defaultLabel = label.textContent;
    }
    button.disabled = busy;
    button.dataset.busy = String(busy);
    button.setAttribute('aria-busy', String(busy));
    if (label) {
      label.textContent = busy ? busyLabel : button.dataset.defaultLabel;
    }
  }

  function cleanUrlAndExtractBranch(rawUrl) {
    const url = rawUrl.trim().replace(/\/+$/, '');
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
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function formatBackendHost(backendUrl) {
    try {
      return new URL(backendUrl).host;
    } catch {
      return backendUrl || 'Chưa có máy chủ';
    }
  }

  function getPendingStockCount(syncState) {
    if (!syncState?.pendingStock || typeof syncState.pendingStock !== 'object') return 0;
    return Object.keys(syncState.pendingStock).length;
  }

  function summarizeQueue(queue) {
    const items = Array.isArray(queue) ? queue : [];
    return {
      pending: items.filter((item) => !item?.isTerminal && (item?.attempts || 0) === 0).length,
      retry: items.filter((item) => !item?.isTerminal && (item?.attempts || 0) > 0).length,
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
    hasGrabTab,
    branchId,
    backendUrl,
    pendingStockCount,
    queueSummary,
    itemSyncHealth,
  }) {
    configSummary.textContent = isConfigured
      ? `CN ${branchId} · ${formatBackendHost(backendUrl)}`
      : 'Chưa thiết lập máy chủ và chi nhánh';
    branchMetric.textContent = branchId ? `Chi nhánh ${branchId}` : 'Chưa chọn chi nhánh';
    stockQueueMetric.textContent = pendingStockCount > 0
      ? `${pendingStockCount} cập nhật tồn đang chờ`
      : 'Không có tồn chờ';
    const summary = queueSummary || { pending: 0, retry: 0, error: 0 };
    queueMetric.textContent =
      summary.error > 0 || summary.retry > 0 || summary.pending > 0
        ? `Hàng đợi ${summary.pending} mới · ${summary.retry} thử lại · ${summary.error} lỗi`
        : 'Hàng đợi trống';
    const failedCount = Array.isArray(itemSyncHealth?.failedIds) ? itemSyncHealth.failedIds.length : 0;
    const unmappedCount = Number(itemSyncHealth?.unmappedCount) || 0;
    if (failedCount > 0 || unmappedCount > 0) {
      itemSyncHealthMetric.textContent = `${failedCount} món lỗi · ${unmappedCount} chưa ánh xạ`;
    } else if (itemSyncHealth?.lastOkAt) {
      itemSyncHealthMetric.textContent = 'Đồng bộ món ổn';
    } else {
      itemSyncHealthMetric.textContent = 'Chưa có đồng bộ món';
    }

    if (!isConfigured) {
      relayStatus.dataset.tone = 'setup';
      relayStatusTitle.textContent = 'Cần cấu hình POS';
      liveStatusLabel.textContent = 'Cần xử lý';
      relayStatusMessage.textContent = 'Lưu máy chủ và mã chi nhánh để bắt đầu chuyển đơn.';
      return;
    }

    if (!hasGrabTab) {
      relayStatus.dataset.tone = 'waiting';
      relayStatusTitle.textContent = 'Chưa mở Grab Merchant';
      liveStatusLabel.textContent = 'Đang chờ';
      relayStatusMessage.textContent = 'Mở merchant.grab.com để tiện ích trực đơn và đồng bộ tồn.';
      return;
    }

    relayStatus.dataset.tone = 'ready';
    relayStatusTitle.textContent = 'Đang trực đơn';
    liveStatusLabel.textContent = 'Hoạt động';
    relayStatusMessage.textContent = 'Grab Merchant đang mở. Đơn mới sẽ được chuyển về POS tự động.';
  }

  function queryGrabTabs(query = { url: 'https://merchant.grab.com/*' }) {
    return new Promise((resolve) => {
      chrome.tabs.query(query, (tabs) => {
        if (chrome.runtime.lastError) {
          resolve([]);
          return;
        }
        resolve(Array.isArray(tabs) ? tabs : []);
      });
    });
  }

  function createEmptyOrderState() {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';

    const mark = document.createElement('span');
    mark.className = 'empty-state-mark';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = 'GF';

    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = 'Chưa có đơn gần đây';
    const description = document.createElement('p');
    description.textContent = 'Đơn đã chuyển về POS sẽ xuất hiện tại đây.';
    copy.append(title, description);
    emptyState.append(mark, copy);
    return emptyState;
  }

  function retryQueuedOrder(order) {
    if (!order?.orderID) return;
    chrome.runtime.sendMessage(
      {
        action: 'RETRY_QUEUE_ITEM',
        payload: {
          order: order.order || order,
          merchantId: order.merchantId || order.order?.merchant?.ID,
        },
      },
      () => {
        if (chrome.runtime.lastError) {
          showToast('Không thử lại được. Mở lại popup.', 'error');
          return;
        }
        showToast(`Đã đưa đơn ${order.displayID || ''} vào hàng đợi lại.`, 'success');
      },
    );
  }

  function renderOrders(orders, queue) {
    const recentOrders = Array.isArray(orders) ? orders.slice(0, 8) : [];
    const queued = Array.isArray(queue) ? queue.filter((item) => item?.isTerminal || (item?.attempts || 0) > 0) : [];
    const rows = [...queued.map((item) => ({
      ...item,
      status: item.isTerminal ? 'error' : 'retry',
      error: item.lastError,
      items: item.order?.itemInfo?.items?.map((entry) => `${entry.quantity}x ${entry.name}`).join(', '),
      canRetry: true,
    })), ...recentOrders].slice(0, 8);
    recentOrderCount.textContent = `${rows.length} đơn`;
    orderList.replaceChildren();

    if (rows.length === 0) {
      orderList.appendChild(createEmptyOrderState());
      return;
    }

    for (const order of rows) {
      const isError = order?.status === 'error' || order?.status === 'retry';
      const item = document.createElement('article');
      item.className = 'order-item';
      item.dataset.tone = isError ? 'error' : 'success';

      const top = document.createElement('div');
      top.className = 'order-top';
      const displayID = document.createElement('span');
      displayID.className = 'order-code';
      displayID.textContent = String(order?.displayID || 'Đơn Grab');
      const total = document.createElement('span');
      total.className = 'order-total';
      total.textContent = String(order?.total || '0₫');
      top.append(displayID, total);

      const description = document.createElement('p');
      description.className = 'order-description';
      description.textContent = isError
        ? String(order?.error || 'Không chuyển được đơn về POS')
        : String(order?.items || '1 phần ăn');

      const meta = document.createElement('div');
      meta.className = 'order-meta';
      const status = document.createElement('span');
      status.className = 'order-status';
      status.textContent = order?.status === 'retry' ? 'Đang chờ thử lại' : isError ? 'Cần xử lý' : 'Đã chuyển POS';
      meta.appendChild(status);
      if (order?.canRetry || order?.status === 'error') {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'order-retry';
        retry.textContent = 'Thử lại';
        retry.addEventListener('click', () => retryQueuedOrder(order));
        meta.appendChild(retry);
      }
      if (order?.time) {
        const separator = document.createElement('span');
        separator.setAttribute('aria-hidden', 'true');
        separator.textContent = '·';
        const time = document.createElement('span');
        time.textContent = String(order.time);
        meta.append(separator, time);
      }

      item.append(top, description, meta);
      orderList.appendChild(item);
    }
  }

  async function refreshOperationalStatus(settings) {
    const tabs = await queryGrabTabs();
    const branchId = normalizeBranchId(settings.branchId);
    const backendUrl = settings.backendUrl || 'http://localhost:3000';
    updateOperationalStatus({
      isConfigured: branchId !== null && isHttpUrl(backendUrl),
      hasGrabTab: tabs.length > 0,
      branchId,
      backendUrl,
      pendingStockCount: getPendingStockCount(settings.grabItemSyncStateV1),
      queueSummary: summarizeQueue(settings.grabRelayQueue),
      itemSyncHealth: settings.grabItemSyncHealth,
    });
  }

  chrome.storage.local.get(
    [
      'backendUrl',
      'branchId',
      'relaySecret',
      'recentOrders',
      'grabItemSyncStateV1',
      'grabRelayQueue',
      'grabItemSyncHealth',
    ],
    async (settings) => {
      const backendUrl = settings.backendUrl || 'http://localhost:3000';
      const branchId = normalizeBranchId(settings.branchId);
      const isConfigured = branchId !== null && isHttpUrl(backendUrl);

      backendUrlInput.value = backendUrl;
      branchIdInput.value = branchId ?? '';
      relaySecretInput.value = settings.relaySecret || '';
      configPanel.open = !isConfigured;
      renderOrders(settings.recentOrders, settings.grabRelayQueue);
      await refreshOperationalStatus(settings);
    }
  );

  configForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const parsed = cleanUrlAndExtractBranch(backendUrlInput.value);
    const backendUrl = parsed.origin;
    const branchId = normalizeBranchId(branchIdInput.value) ?? parsed.extractedBranchId;
    if (!isHttpUrl(backendUrl)) {
      backendUrlInput.focus();
      showToast('Nhập địa chỉ máy chủ bắt đầu bằng http:// hoặc https://.', 'error');
      return;
    }
    if (branchId === null) {
      branchIdInput.focus();
      showToast('Nhập mã chi nhánh hợp lệ hoặc dán URL POS có /br/{id}.', 'error');
      return;
    }

    backendUrlInput.value = backendUrl;
    branchIdInput.value = branchId;
    const relaySecret = relaySecretInput.value.trim();
    setButtonBusy(btnSave, true, 'Đang lưu');

    chrome.storage.local.set({ backendUrl, branchId, relaySecret }, async () => {
      setButtonBusy(btnSave, false, 'Đang lưu');
      if (chrome.runtime.lastError) {
        showToast('Không lưu được cấu hình. Hãy thử lại.', 'error');
        return;
      }
      const granted = await requestBackendOrigin(backendUrl);
      if (!granted) {
        showToast('Cần cấp quyền máy chủ POS. Bấm Kiểm tra rồi cho phép origin.', 'error');
      } else {
        showToast(`Đã lưu cấu hình cho chi nhánh ${branchId}.`, 'success');
      }
      configPanel.open = false;
      await refreshOperationalStatus({ backendUrl, branchId, grabItemSyncStateV1: null });
    });
  });

  btnPing.addEventListener('click', async () => {
    const parsed = cleanUrlAndExtractBranch(backendUrlInput.value);
    const backendUrl = parsed.origin;
    if (!isHttpUrl(backendUrl)) {
      backendUrlInput.focus();
      showToast('Nhập địa chỉ máy chủ hợp lệ trước khi kiểm tra.', 'error');
      return;
    }

    const relaySecret = relaySecretInput.value.trim();
    setButtonBusy(btnPing, true, 'Đang kiểm tra');
    try {
      const granted = await requestBackendOrigin(backendUrl);
      if (!granted) {
        showToast('Chrome chưa cho phép gọi máy chủ POS. Hãy cấp quyền origin.', 'error');
        return;
      }
      const headers = { 'Content-Type': 'application/json' };
      if (relaySecret) headers['x-grab-relay-secret'] = relaySecret;
      const response = await fetch(`${backendUrl}/api/webhooks/grabfood/relay`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ping: true }),
      });

      if (response.ok) {
        showToast('Kết nối POS thành công.', 'success');
      } else if (response.status === 401) {
        showToast('Relay Secret không đúng. Kiểm tra lại khóa bảo mật.', 'error');
      } else {
        showToast(`Máy chủ POS phản hồi HTTP ${response.status}.`, 'error');
      }
    } catch {
      showToast(`Không thể kết nối tới ${formatBackendHost(backendUrl)}.`, 'error');
    } finally {
      setButtonBusy(btnPing, false, 'Đang kiểm tra');
    }
  });

  btnToggleSecret.addEventListener('click', () => {
    const isVisible = relaySecretInput.type === 'text';
    relaySecretInput.type = isVisible ? 'password' : 'text';
    btnToggleSecret.textContent = isVisible ? 'Hiện' : 'Ẩn';
    btnToggleSecret.setAttribute('aria-pressed', String(!isVisible));
    btnToggleSecret.setAttribute('aria-label', isVisible ? 'Hiện Relay Secret' : 'Ẩn Relay Secret');
    relaySecretInput.focus();
  });

  btnSyncMenu.addEventListener('click', async () => {
    setButtonBusy(btnSyncMenu, true, 'Đang gửi lệnh');
    const tabs = await queryGrabTabs();
    const relayTab = tabs.find((tab) => tab?.id !== undefined && !tab.discarded);
    if (!relayTab) {
      setButtonBusy(btnSyncMenu, false, 'Đang gửi lệnh');
      showToast('Mở merchant.grab.com rồi thử đồng bộ lại.', 'error');
      return;
    }

    let accepted = false;
    for (const tab of tabs) {
      if (tab?.id === undefined || tab.discarded) continue;
      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: 'FORCE_FULL_SYNC' }, (result) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(result);
        });
      });
      if (response?.success) {
        accepted = true;
        break;
      }
    }
    setButtonBusy(btnSyncMenu, false, 'Đang gửi lệnh');
    if (accepted) {
      showToast('Đã bắt đầu đồng bộ toàn bộ trạng thái và tồn kho.', 'success');
    } else {
      showToast('Không gửi được lệnh. Hãy tải lại tab Grab Merchant.', 'error');
    }
  });

  btnRecoverOrders.addEventListener('click', async () => {
    setButtonBusy(btnRecoverOrders, true, 'Đang khôi phục');
    chrome.runtime.sendMessage({ action: 'RECOVER_MISSED_ORDERS' }, () => {
      setButtonBusy(btnRecoverOrders, false, 'Đang khôi phục');
      if (chrome.runtime.lastError) {
        showToast('Không khôi phục được. Mở lại popup.', 'error');
        return;
      }
      showToast('Đã yêu cầu khôi phục đơn đang mở trên Grab.', 'success');
    });
  });
});
