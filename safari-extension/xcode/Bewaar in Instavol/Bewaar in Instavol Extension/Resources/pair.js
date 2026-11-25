// Runs only on <address>/extensie-koppelen. Passes the token the page posts to the background script,
// which accepts it only from the address the user filled in.
window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const data = event.data;
  if (data?.type !== 'instavol-extension-token' || typeof data.token !== 'string') return;
  (globalThis.browser ?? globalThis.chrome).runtime.sendMessage({ type: 'pair', token: data.token });
});
