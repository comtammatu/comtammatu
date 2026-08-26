// background.js - MV3 service worker watchdog for the relay tab.
// Content scripts die when Chrome discards or crashes the tab, so the only
// reliable place to watch the tab from is the extension's own service worker:
// chrome.alarms wakes it even while the merchant tab is gone.
const RELAY_TAB_URL = 'https://merchant.grab.com/';
const RELAY_TAB_QUERY = { url: 'https://merchant.grab.com/*' };
const WATCHDOG_ALARM = 'relay-tab-watchdog';

async function ensureRelayTab() {
  try {
    const tabs = await chrome.tabs.query(RELAY_TAB_QUERY);

    if (tabs.length === 0) {
      console.log('[Grab POS Relay] No merchant tab found, opening one...');
      await chrome.tabs.create({ url: RELAY_TAB_URL });
      return;
    }

    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      // Discarded (Memory Saver) or crashed tabs run no content script; reload
      // restores the page and re-injects the relay.
      if (tab.discarded || tab.status === 'crashed') {
        console.log(`[Grab POS Relay] Relay tab ${tab.id} is ${tab.discarded ? 'discarded' : 'crashed'}, reloading...`);
        await chrome.tabs.reload(tab.id);
      }
    }
  } catch (err) {
    console.warn('[Grab POS Relay] Tab watchdog check failed:', err);
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === WATCHDOG_ALARM) {
    ensureRelayTab();
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 2 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 2 });
  ensureRelayTab();
});
