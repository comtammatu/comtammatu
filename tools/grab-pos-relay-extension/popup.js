// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const backendUrlInput = document.getElementById('backendUrl');
  const branchIdInput = document.getElementById('branchId');
  const btnSave = document.getElementById('btnSave');
  const btnPing = document.getElementById('btnPing');
  const toast = document.getElementById('toast');
  const orderList = document.getElementById('orderList');

  function showToast(msg, isSuccess = true) {
    toast.textContent = msg;
    toast.style.color = isSuccess ? '#34d399' : '#f87171';
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  }

  // Load existing settings
  chrome.storage.local.get(['backendUrl', 'branchId', 'recentOrders'], (res) => {
    backendUrlInput.value = res.backendUrl || 'http://localhost:3000';
    branchIdInput.value = res.branchId || '1';

    if (Array.isArray(res.recentOrders) && res.recentOrders.length > 0) {
      renderOrders(res.recentOrders);
    }
  });

  // Save settings
  btnSave.addEventListener('click', () => {
    const backendUrl = backendUrlInput.value.trim().replace(/\/+$/, '');
    const branchId = parseInt(branchIdInput.value, 10) || 1;

    chrome.storage.local.set({ backendUrl, branchId }, () => {
      showToast('Đã lưu cấu hình thành công!');
    });
  });

  // Ping test
  btnPing.addEventListener('click', async () => {
    const backendUrl = backendUrlInput.value.trim().replace(/\/+$/, '');
    showToast('Đang kiểm tra kết nối...', true);
    try {
      const res = await fetch(`${backendUrl}/api/webhooks/grabfood/relay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ping: true })
      });
      if (res.ok) {
        showToast('✅ Kết nối POS thành công!', true);
      } else {
        showToast(`⚠️ Server phản hồi mã lỗi: ${res.status}`, false);
      }
    } catch (e) {
      showToast('❌ Không thể kết nối tới POS URL', false);
    }
  });

  function renderOrders(orders) {
    orderList.innerHTML = '';
    orders.forEach(o => {
      const el = document.createElement('div');
      el.className = 'order-item';
      el.innerHTML = `
        <div class="order-row">
          <span>${o.displayID} (${o.eater})</span>
          <span style="color:#38bdf8;">${o.total}</span>
        </div>
        <div class="order-sub">${o.items} • ${o.time}</div>
      `;
      orderList.appendChild(el);
    });
  }
});
