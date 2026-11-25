// Right-click menu: save selected text or an image. The result shows as a badge on the toolbar button.

const MENU_SELECTION = 'instavol-selection';
const MENU_IMAGE = 'instavol-image';

ext.runtime.onInstalled.addListener(() => {
  ext.contextMenus.removeAll(() => {
    ext.contextMenus.create({ id: MENU_SELECTION, title: 'Bewaar selectie in Instavol', contexts: ['selection'] });
    ext.contextMenus.create({ id: MENU_IMAGE, title: 'Bewaar afbeelding in Instavol', contexts: ['image'] });
  });
});

function flash(tabId, text, color) {
  ext.action.setBadgeBackgroundColor({ color, tabId });
  ext.action.setBadgeText({ text, tabId });
  setTimeout(() => ext.action.setBadgeText({ text: '', tabId }), 4000);
}

ext.contextMenus.onClicked.addListener(async (info, tab) => {
  const tabId = tab?.id;
  try {
    if (info.menuItemId === MENU_SELECTION) {
      // Only the selected passage is kept: a loose note titled after the page, with the page's link as its source.
      const pageUrl = info.pageUrl ?? tab?.url;
      await saveQuote({
        text: info.selectionText,
        url: pageUrl && /^https?:/.test(pageUrl) ? pageUrl : '',
        title: tab?.title,
      });
    } else if (info.menuItemId === MENU_IMAGE) {
      await saveImage({ srcUrl: info.srcUrl, title: tab?.title });
    }
    flash(tabId, '✓', '#2e7d32');
  } catch (error) {
    console.error(error);
    flash(tabId, '!', '#c62828');
    ext.storage.local.set({ lastError: String(error.message ?? error) });
  }
});

// Pairing: the token only counts when it comes from a tab on the address the user entered.
ext.runtime.onMessage.addListener(async (message, sender) => {
  if (message?.type !== 'pair' || typeof message.token !== 'string' || !sender.tab?.url) return;
  const { baseUrl } = await getSettings();
  if (!baseUrl || new URL(sender.tab.url).origin !== new URL(baseUrl).origin) return;
  await ext.storage.local.set({ token: message.token, paired: true });
});
