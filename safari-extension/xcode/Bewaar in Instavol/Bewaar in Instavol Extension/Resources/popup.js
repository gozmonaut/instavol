const statusEl = document.getElementById('status');

function show(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'error' : '';
}

async function selectedText(tabId) {
  try {
    const [result] = await ext.scripting.executeScript({ target: { tabId }, func: () => String(getSelection()) });
    return result?.result ?? '';
  } catch {
    return ''; // pages the extension may not read (e.g. the start page)
  }
}

document.getElementById('save').addEventListener('click', async () => {
  show('Bezig…');
  try {
    const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url || !/^https?:/.test(tab.url)) throw new Error('Deze pagina kan niet bewaard worden.');
    await saveLink({ url: tab.url, title: tab.title, text: await selectedText(tab.id) });
    show('Bewaard ✓');
  } catch (error) {
    show(error.message ?? String(error), true);
  }
});

document.getElementById('store').addEventListener('click', async () => {
  await ext.storage.local.set({
    baseUrl: document.getElementById('baseUrl').value.trim(),
    token: document.getElementById('token').value.trim(),
  });
  show('Instellingen opgeslagen.');
});

document.getElementById('pair').addEventListener('click', async () => {
  const baseUrl = document.getElementById('baseUrl').value.trim().replace(/\/+$/, '');
  if (!/^https:\/\//.test(baseUrl)) {
    show('Vul eerst het adres van Instavol in (https://…).', true);
    return;
  }
  await ext.storage.local.set({ baseUrl });
  await ext.tabs.create({ url: `${baseUrl}/extensie-koppelen` });
});

(async () => {
  const { baseUrl, token, lastError } = await ext.storage.local.get(['baseUrl', 'token', 'lastError']);
  document.getElementById('baseUrl').value = baseUrl ?? '';
  document.getElementById('token').value = token ?? '';
  if (!baseUrl || !token) document.getElementById('settings').open = true;
  if (lastError) {
    show(`Laatste fout: ${lastError}`, true);
    ext.storage.local.remove('lastError');
  }
})();
