// popup.js
document.addEventListener('DOMContentLoaded', () => {
  const backendUrlInput = document.getElementById('backendUrl');
  const branchIdInput = document.getElementById('branchId');
  const relaySecretInput = document.getElementById('relaySecret');
  const btnSave = document.getElementById('btnSave');
  const btnPing = document.getElementById('btnPing');
  const btnSyncMenu = document.getElementById('btnSyncMenu');
  const toast = document.getElementById('toast');
  const orderList = document.getElementById('orderList');

  function showToast(msg, isSuccess = true) {
    toast.textContent = msg;
    toast.style.color = isSuccess ? '#34d399' : '#f87171';
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
  }

  // Load existing settings
  chrome.storage.local.get(['backendUrl', 'branchId', 'relaySecret', 'recentOrders'], (res) => {
    backendUrlInput.value = res.backendUrl || 'http://localhost:3000';
    branchIdInput.value = res.branchId || '1';
    relaySecretInput.value = res.relaySecret || '';

    if (Array.isArray(res.recentOrders) && res.recentOrders.length > 0) {
      renderOrders(res.recentOrders);
    }
  });

  // Save settings
  btnSave.addEventListener('click', () => {
    const backendUrl = backendUrlInput.value.trim().replace(/\/+$/, '');
    const branchId = parseInt(branchIdInput.value, 10) || 1;
    const relaySecret = relaySecretInput.value.trim();

    chrome.storage.local.set({ backendUrl, branchId, relaySecret }, () => {
      showToast('Đã lưu cấu hình thành công!');
    });
  });

  // Ping test
  btnPing.addEventListener('click', async () => {
    const backendUrl = backendUrlInput.value.trim().replace(/\/+$/, '');
    const relaySecret = relaySecretInput.value.trim();

    showToast('Đang kiểm tra kết nối...', true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (relaySecret) {
        headers['x-grab-relay-secret'] = relaySecret;
      }

      const res = await fetch(`${backendUrl}/api/webhooks/grabfood/relay`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ping: true }),
      });

      if (res.ok) {
        showToast('✅ Kết nối POS thành công!', true);
      } else if (res.status === 401) {
        showToast('❌ Sai Khóa bảo mật Relay Secret (401)', false);
      } else {
        showToast(`⚠️ Server phản hồi mã: ${res.status}`, false);
      }
    } catch {
      showToast('❌ Không thể kết nối tới POS URL', false);
    }
  });

  // Full Menu Sync trigger
  btnSyncMenu.addEventListener('click', async () => {
    showToast('Đang kích hoạt đồng bộ Menu sang Grab...', true);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab || !currentTab.url?.includes('merchant.grab.com')) {
        showToast('⚠️ Vui lòng mở tab merchant.grab.com để đồng bộ!', false);
        return;
      }

      chrome.tabs.sendMessage(currentTab.id, { action: 'FORCE_FULL_SYNC' }, (response) => {
        if (chrome.runtime.lastError) {
          showToast('⚠️ Không gửi được lệnh sang trang Grab (vui lòng reload tab)', false);
        } else if (response?.success) {
          showToast('✅ Đã kích hoạt đồng bộ Menu thành công!', true);
        }
      });
    });
  });

  function renderOrders(orders) {
    orderList.innerHTML = '';
    orders.forEach((o) => {
      const el = document.createElement('div');
      el.className = 'order-item';
      el.innerHTML = `
        <div class="order-top">
          <span class="order-badge">${o.displayID}</span>
          <span>${o.total}</span>
        </div>
        <div class="order-desc">${o.items || '1 phần ăn'}</div>
      `;
      orderList.appendChild(el);
    });
  }
});
