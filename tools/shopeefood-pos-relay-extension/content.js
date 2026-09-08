(function () {
  const policy = ShopeeRelayState;
  let authExpired = false;
  const badge = document.createElement('div');
  badge.id = 'comtammatu-shopee-pos-relay-badge';
  badge.setAttribute('role', 'status');
  badge.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:999999;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:6px;padding:8px 12px;font:12px system-ui;max-width:320px;overflow-wrap:anywhere';
  function show(message) {
    badge.textContent = 'ShopeeFood · ' + message;
    if (document.body && !badge.isConnected) document.body.appendChild(badge);
  }
  async function refresh() {
    if (authExpired) { show('Phiên ShopeeFood hết hạn. Đăng nhập lại'); return; }
    const values = await chrome.storage.local.get(['backendUrl', 'branchId', 'shopeeRelayQueueV2']);
    const target = policy.configuration(values);
    if (!target) { show('Chưa cấu hình POS và chi nhánh'); return; }
    const pending = values.shopeeRelayQueueV2?.pending || [];
    const other = pending.filter((row) => !policy.sameTarget(row.target, target)).length;
    const current = pending.filter((row) => policy.sameTarget(row.target, target));
    if (other) show(other + ' đơn đang giữ ở cấu hình cũ');
    else if (current.length) show(current.length + ' đơn chờ POS' + (current[0].lastError ? ' · ' + current[0].lastError : ''));
    else show('Đang chờ đơn từ trang');
  }
  const refreshSafely = () => refresh().catch(() => show('Không thể đọc trạng thái. Tải lại trang'));
  document.addEventListener('DOMContentLoaded', refreshSafely, { once: true });
  refreshSafely();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ['backendUrl', 'branchId', 'shopeeRelayQueueV2'].some((key) => changes[key])) refreshSafely();
  });
  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'SHOPEE_POS_RELAY_INJECTED') return;
    if (event.data.type === 'AUTH_EXPIRED') { authExpired = true; refreshSafely(); return; }
    if (event.data.type === 'AUTH_RECOVERED') { authExpired = false; refreshSafely(); return; }
    if (event.data.type !== 'ORDER_DETAIL' || !policy.validOrder(event.data.data?.order)) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'SHOPEE_RELAY_ORDER', order: event.data.data.order });
      if (!response?.success) show(response?.message || 'Không thể lưu đơn. Tải lại trang để thử lại');
      else if (response.status === 'sent') show('POS đã tiếp nhận đơn ' + event.data.data.order.displayId);
      else refreshSafely();
    } catch { show('Tiện ích đã ngắt kết nối. Tải lại trang'); }
  });
})();
