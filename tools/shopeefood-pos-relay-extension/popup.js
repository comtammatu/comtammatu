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
  const extVersionEl = document.getElementById('extVersion');

  try {
    const manifest = chrome.runtime.getManifest();
    if (extVersionEl && manifest?.version) {
      extVersionEl.textContent = `v${manifest.version}`;
    }
  } catch (e) {}

  function showToast(msg, isSuccess = true) {
    toast.textContent = msg;
    toast.style.color = isSuccess ? '#34d399' : '#f87171';
    toast.style.display = 'block';
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
  }

  function cleanUrlAndExtractBranch(rawUrl) {
    let url = rawUrl.trim().replace(/\/+$/, '');
    const match = url.match(/^(https?:\/\/[^\/]+)(?:\/br\/(\d+)(?:\/.*)?)?$/i);
    if (match && match[1]) {
      const origin = match[1];
      const extractedBranchId = match[2] ? parseInt(match[2], 10) : null;
      return { origin, extractedBranchId };
    }
    return { origin: url, extractedBranchId: null };
  }

  function normalizeBranchId(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  // Load existing settings
  chrome.storage.local.get(['backendUrl', 'branchId', 'relaySecret', 'recentOrders'], (res) => {
    backendUrlInput.value = res.backendUrl || 'http://localhost:3000';
    branchIdInput.value = normalizeBranchId(res.branchId) ?? '';
    relaySecretInput.value = res.relaySecret || '';

    if (Array.isArray(res.recentOrders) && res.recentOrders.length > 0) {
      renderOrders(res.recentOrders);
    }
  });

  // Save settings
  btnSave.addEventListener('click', () => {
    const parsed = cleanUrlAndExtractBranch(backendUrlInput.value);
    const backendUrl = parsed.origin;
    const branchId = normalizeBranchId(branchIdInput.value) ?? parsed.extractedBranchId;
    if (branchId === null) {
      showToast('❌ Nhập mã chi nhánh hợp lệ hoặc dán URL POS có /br/{id}', false);
      return;
    }

    backendUrlInput.value = backendUrl;
    branchIdInput.value = branchId;
    const relaySecret = relaySecretInput.value.trim();

    chrome.storage.local.set({ backendUrl, branchId, relaySecret }, () => {
      showToast(`Đã lưu cấu hình (Chi nhánh ${branchId}) thành công!`);
    });
  });

  // Ping test
  btnPing.addEventListener('click', async () => {
    const parsed = cleanUrlAndExtractBranch(backendUrlInput.value);
    const backendUrl = parsed.origin;
    const relaySecret = relaySecretInput.value.trim();

    showToast('Đang kiểm tra kết nối...', true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (relaySecret) {
        headers['x-shopee-relay-secret'] = relaySecret;
      }

      const res = await fetch(`${backendUrl}/api/webhooks/shopeefood/relay`, {
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
      showToast(`❌ Không thể kết nối tới ${backendUrl}`, false);
    }
  });

  // Full Menu Sync trigger
  if (btnSyncMenu) {
    btnSyncMenu.addEventListener('click', async () => {
      showToast('Đang kích hoạt đồng bộ Menu sang Shopee...', true);

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const currentTab = tabs[0];
        if (!currentTab || !currentTab.url?.includes('merchant.shopeefood.vn') && !currentTab.url?.includes('shopeefood.vn')) {
          showToast('⚠️ Vui lòng mở tab ShopeeFood Merchant để đồng bộ!', false);
          return;
        }

        chrome.tabs.sendMessage(currentTab.id, { action: 'FORCE_FULL_SYNC' }, (response) => {
          if (chrome.runtime.lastError) {
            showToast('⚠️ Không gửi được lệnh sang trang Shopee (vui lòng reload tab)', false);
          } else if (response?.success) {
            showToast('✅ Đã kích hoạt đồng bộ Menu thành công!', true);
          }
        });
      });
    });
  }

  function renderOrders(orders) {
    orderList.innerHTML = '';
    orders.forEach((o) => {
      const el = document.createElement('div');
      el.className = 'order-item';
      el.innerHTML = `
        <div class="order-row">
          <span>${o.displayId} (${o.eater})</span>
          <span style="color:#ee4d2d;">${o.total}</span>
        </div>
        <div class="order-sub">${o.items} • ${o.time}</div>
      `;
      orderList.appendChild(el);
    });
  }
});
