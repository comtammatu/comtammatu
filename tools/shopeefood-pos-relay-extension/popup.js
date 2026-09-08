document.addEventListener('DOMContentLoaded', () => {
  const byId = (id) => document.getElementById(id);
  const backendUrl = byId('backendUrl');
  const branchId = byId('branchId');
  const relaySecret = byId('relaySecret');
  const toast = byId('toast');
  const policy = ShopeeRelayState;
  byId('extVersion').textContent = 'v' + chrome.runtime.getManifest().version;

  function show(message, success = false) {
    toast.textContent = message;
    toast.style.color = success ? '#34d399' : '#f87171';
    toast.style.display = 'block';
  }

  function settings() {
    try {
      const url = new URL(backendUrl.value.trim());
      const pathBranch = /^\/br\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1];
      const enteredBranch = branchId.value.trim();
      if (pathBranch && enteredBranch && Number(pathBranch) !== Number(enteredBranch)) return null;
      return policy.configuration({ backendUrl: url.href, branchId: enteredBranch || pathBranch });
    } catch { return null; }
  }

  async function refreshStatus() {
    const values = await chrome.storage.local.get(['backendUrl', 'branchId', 'shopeeRelayQueueV2', 'recentOrders']);
    const target = policy.configuration(values);
    const pending = values.shopeeRelayQueueV2?.pending || [];
    const other = pending.filter((row) => !policy.sameTarget(row.target, target)).length;
    const failed = pending.find((row) => row.lastError);
    byId('statusBadge').textContent = !target ? 'Chưa cấu hình' : pending.length ? pending.length + ' đơn chờ' : 'Đang chờ đơn';
    byId('statusBadge').style.background = pending.length ? '#78350f' : '#334155';
    byId('statusBadge').style.color = pending.length ? '#fcd34d' : '#e2e8f0';
    byId('queueStatus').textContent = other
      ? other + ' đơn đang giữ ở cấu hình cũ'
      : failed ? failed.lastError : pending.length ? 'Đơn đã lưu, đang chờ POS xác nhận' : '';
    renderOrders(values.recentOrders || []);
  }

  function renderOrders(orders) {
    const list = byId('orderList');
    list.replaceChildren();
    if (!orders.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-msg';
      empty.textContent = 'Chưa có đơn hàng nào';
      list.appendChild(empty);
    }
    for (const order of orders) {
      const entry = document.createElement('div');
      entry.className = 'order-item';
      const row = document.createElement('div');
      row.className = 'order-row';
      row.textContent = String(order.displayId || '') + ' · ' + String(order.total || 'Đã nhận');
      const detail = document.createElement('div');
      detail.className = 'order-sub';
      detail.textContent = String(order.items || '') + ' · ' + String(order.time || '');
      entry.append(row, detail);
      list.appendChild(entry);
    }
  }

  chrome.storage.local.get(['backendUrl', 'branchId', 'relaySecret']).then((values) => {
    backendUrl.value = values.backendUrl || '';
    branchId.value = values.branchId || '';
    relaySecret.value = values.relaySecret || '';
    return refreshStatus();
  }).catch(() => show('Không thể đọc cấu hình tiện ích'));

  byId('btnSave').addEventListener('click', async () => {
    const target = settings();
    if (!target) { show('Kiểm tra địa chỉ POS và mã chi nhánh khớp đường dẫn'); return; }
    try {
      await chrome.storage.local.set({ ...target, relaySecret: relaySecret.value.trim() });
      backendUrl.value = target.backendUrl;
      branchId.value = target.branchId;
      show('Đã lưu cấu hình', true);
    } catch { show('Không thể lưu cấu hình'); }
  });

  byId('btnPing').addEventListener('click', async () => {
    const target = settings();
    if (!target) { show('Nhập địa chỉ POS và chi nhánh hợp lệ'); return; }
    const button = byId('btnPing');
    button.disabled = true;
    show('Đang kiểm tra kết nối…', true);
    try {
      const response = await fetch(target.backendUrl + '/api/webhooks/shopeefood/relay', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', 'x-shopee-relay-secret': relaySecret.value.trim() },
        body: JSON.stringify({ ping: true }),
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success === true) show('Đã kết nối POS', true);
      else show(response.status === 401 ? 'POS từ chối xác thực. Kiểm tra khóa bảo mật' : 'POS chưa xác nhận kết nối');
    } catch { show('Không thể kết nối POS'); }
    finally { button.disabled = false; }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ['backendUrl', 'branchId', 'shopeeRelayQueueV2', 'recentOrders'].some((key) => changes[key])) {
      if (changes.shopeeRelayQueueV2) toast.style.display = 'none';
      refreshStatus().catch(() => show('Không thể đọc trạng thái'));
    }
  });
});
