// Shared by the background script and the popup: talks to Instavol's /api/share.
// Settings live in extension storage: { baseUrl, token }.

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // keep in sync with lib/createItem.ts
const MAX_NOTE_LENGTH = 2000; // idem
const MAX_IMAGE_WIDTH = 2000;

const ext = globalThis.browser ?? globalThis.chrome;

async function getSettings() {
  const { baseUrl = '', token = '' } = await ext.storage.local.get(['baseUrl', 'token']);
  return { baseUrl: baseUrl.replace(/\/+$/, ''), token };
}

async function postShare(body) {
  const { baseUrl, token } = await getSettings();
  if (!baseUrl || !token) throw new Error('Nog niet ingesteld: open de extensie en vul adres en token in.');

  const isForm = body instanceof FormData;
  const response = await fetch(`${baseUrl}/api/share`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(isForm ? {} : { 'Content-Type': 'application/json' }) },
    body: isForm ? body : JSON.stringify(body),
  });

  if (!response.ok) {
    let message = `Fout ${response.status}`;
    try {
      message = (await response.json()).error ?? message;
    } catch {
      // not JSON; keep the status message
    }
    throw new Error(message);
  }
  return response.json();
}

// A page (with the selected text, if any, as its first note).
async function saveLink({ url, title, text }) {
  const trimmed = (text ?? '').trim();
  const body = { url, title };
  if (trimmed) body.text = trimmed.slice(0, MAX_NOTE_LENGTH);
  return postShare(body);
}

// Loose text without a page: a note.
async function saveNote({ text, title }) {
  const trimmed = (text ?? '').trim();
  if (!trimmed) throw new Error('Geen tekst geselecteerd.');
  return postShare({ text: trimmed.slice(0, MAX_NOTE_LENGTH), title });
}

// A selected passage: a loose note with the page's title, and the page's link under the text.
// The passage is shortened (not the link) when the whole would not fit.
async function saveQuote({ text, url, title }) {
  const passage = (text ?? '').trim();
  if (!passage) throw new Error('Geen tekst geselecteerd.');
  const source = url ? `\n\n${url}` : '';
  const room = MAX_NOTE_LENGTH - source.length;
  const body = passage.length > room ? `${passage.slice(0, room - 1)}…` : passage;
  return postShare({ text: body + source, title });
}

// Fetches the image, shrinks it to a JPEG that fits Instavol's limits and uploads it.
async function saveImage({ srcUrl, title }) {
  const source = await fetch(srcUrl);
  if (!source.ok) throw new Error(`Afbeelding ophalen mislukt (${source.status}).`);
  const bitmap = await createImageBitmap(await source.blob());

  let width = Math.min(bitmap.width, MAX_IMAGE_WIDTH);
  let quality = 0.85;
  let blob;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const height = Math.max(1, Math.round((bitmap.height * width) / bitmap.width));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff'; // JPEG has no transparency
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    if (blob.size <= MAX_IMAGE_BYTES) break;
    width = Math.round(width * 0.75);
    quality = Math.max(0.6, quality - 0.1);
  }
  bitmap.close();
  if (blob.size > MAX_IMAGE_BYTES) throw new Error('Afbeelding is te groot, ook na verkleinen.');

  const form = new FormData();
  form.append('file', new File([blob], 'afbeelding.jpg', { type: 'image/jpeg' }));
  if (title) form.append('title', title);
  return postShare(form);
}
