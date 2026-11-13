const api = typeof browser !== 'undefined' ? browser : chrome;
const action = api.action || api.browserAction;

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'FX_FETCH_REMOTE') return false;

  let url;
  try {
    url = new URL(message.url);
  } catch (e) {
    sendResponse({ ok: false, error: 'Ungültige URL' });
    return false;
  }

  const allowedURLs = new Set([
    'https://raw.githubusercontent.com/CRZX1337/flowzz-plus/main/data/attrs.json.gz',
    'https://api.github.com/repos/CRZX1337/flowzz-plus/releases/latest'
  ]);
  if (
    !sender.url || !sender.url.startsWith('https://flowzz.com/') ||
    !allowedURLs.has(url.origin + url.pathname)
  ) {
    sendResponse({ ok: false, error: 'Zugriff nicht erlaubt' });
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const headers = url.origin === 'https://api.github.com'
    ? { Accept: 'application/vnd.github+json' }
    : undefined;
  fetch(url.toString(), { signal: controller.signal, cache: 'no-store', headers })
    .then(async (response) => {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return {
        ok: true,
        status: response.status,
        body: bytesToBase64(new Uint8Array(await response.arrayBuffer()))
      };
    })
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }))
    .finally(() => clearTimeout(timeout));
  return true;
});

if (action && action.onClicked) {
  action.onClicked.addListener(async (tab) => {
    if (tab && tab.id != null && tab.url && tab.url.startsWith('https://flowzz.com/')) {
      try {
        await api.tabs.sendMessage(tab.id, { type: 'FX_OPEN' });
        return;
      } catch (e) {
        // Das Content-Script ist noch nicht bereit; die Produktübersicht öffnet den Launcher.
      }
    }
    api.tabs.create({ url: 'https://flowzz.com/product?fx=1' });
  });
}
