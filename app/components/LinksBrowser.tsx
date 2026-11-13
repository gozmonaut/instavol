'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { LinkRow } from '@/lib/schema';
import { groupByDate, TIME_ZONE } from '@/lib/dateGroups';
import { RESEARCH_FOCUSES, buildResearchPrompt, type ResearchFocus } from '@/lib/researchPrompt';
import { parseShareUrl } from '@/lib/shareUrl';
import Reader from './Reader';
import styles from './LinksBrowser.module.css';
import readerStyles from './Reader.module.css';

const SEARCH_DEBOUNCE_MS = 300;
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;
const COPIED_FEEDBACK_MS = 2000;
const PULL_THRESHOLD_PX = 70;
const PULL_RESISTANCE = 0.5;

// Safari has its own pull-to-refresh; a home-screen web app (standalone) has none.
function isStandalone(): boolean {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) return true;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// Screenshots can be several MB; the server accepts 4 MB. Shrinks big pictures to a JPEG of at most 2000 px
// where the browser can decode them, and sends anything else as it is.
const MAX_UPLOAD_EDGE = 2000;
async function prepareImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob ?? file;
  } catch {
    return file;
  }
}

// The text of a note on a card, in a yellow block: the first lines only; the reader shows all of it.
function NoteBody({ text }: { text: string }) {
  return (
    <div className={`${styles.summary} ${styles.noteSticky}`}>
      <p className={`${styles.noteBody} ${styles.noteClamped}`}>{text}</p>
    </div>
  );
}

const IMAGE_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/heic': 'heic' };

// The picture of a note or image as a file, to hand to the share sheet. Never throws: null means "share without".
async function loadShareFile(link: LinkRow): Promise<File | null> {
  if (!link.imageUrl) return null;
  try {
    const res = await fetch(link.imageUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    const name = (link.title ?? 'afbeelding').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 60) || 'afbeelding';
    return new File([blob], `${name}.${IMAGE_EXTENSIONS[blob.type] ?? 'jpg'}`, { type: blob.type });
  } catch {
    return null;
  }
}

// What to call an item in titles and dialogs; uploaded images and loose notes have no url.
function itemName(link: LinkRow): string {
  if (link.title) return link.title;
  if (link.url) return domainFromUrl(link.url);
  return link.kind === 'image' ? 'Afbeelding' : 'Notitie';
}

// Fixed to Amsterdam time, like the date groups: the server (UTC) and the browser must render the
// same text, or React rebuilds the whole page and drops the theme set on <html>.
function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short', timeZone: TIME_ZONE }).format(date);
}

// macOS lists only apps that accept every shared item, and many accept a url but not plain text.
// iPads also report "MacIntel", but have touch points.
function isMacDesktop(): boolean {
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints === 0;
}

// A note is shared as its own text. The name goes on top only when it says more than the first line of the
// text (which is what a new note is named after), and a picture's default name ("Afbeelding 13 nov. 2026") is left out.
function buildOwnShareText(link: LinkRow): string {
  const text = link.notes[0]?.text ?? '';
  const title = link.title?.trim() ?? '';
  const stem = title.replace(/…$/, '');
  const redundant = !title || (text && text.startsWith(stem)) || /^Afbeelding( \d.*)?$/.test(title);
  return [redundant ? '' : title, text].filter(Boolean).join('\n\n');
}

// The URL goes inside the text: some apps keep only the text or only the url when both are passed.
function buildShareText(link: LinkRow): string {
  if (link.kind !== 'link') return buildOwnShareText(link);
  const meta = [formatDate(link.createdAt), link.category].filter(Boolean).join(' | ');
  const summary = link.status === 'done' && link.summary ? link.summary : null;
  return [link.title, meta, summary, link.url].filter(Boolean).join('\n');
}

// The search bar only slides away once the logo has scrolled out of view, and ignores tiny
// scroll movements (finger jitter, rubber-banding).
// How far left the overview starts, and how dark, when the reader is swiped back (like iOS).
const SWIPE_PARALLAX_PERCENT = 30;
const SWIPE_DIM = 0.12;
// Being away from the app at least this long (ms) fetches the newly saved items when it opens again.
const RESUME_REFRESH_AFTER_MS = 10_000;
// How long the overview's bars stay solid after the reader closed (its slide-out is already over).
const READER_SHOWN_TAIL_MS = 400;
const HEADER_HIDE_AFTER_PX = 120;
const HEADER_SCROLL_SLACK_PX = 6;
// Within this distance of the top the page looks as it does at the top.
const HEADER_TOP_PX = 4;

const ACTION_ICON_PATHS = {
  share: ['M12 15V4', 'M8 8l4-4 4 4', 'M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1'],
  research: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z'],
  retry: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v4h-4'],
  delete: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V4h6v3'],
  done: ['M5 12.5l4.5 4.5L19 7.5'],
  category: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  password: ['M12 15a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M11 12l9-9', 'M17 6l3 3'],
  logout: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 17l-5-5 5-5', 'M5 12h11'],
  rename: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z'],
  tag: ['M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z', 'M7.5 7.5h.01'],
} as const;

function ActionIcon({ name }: { name: keyof typeof ACTION_ICON_PATHS | 'more' }) {
  if (name === 'more') {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.9" />
        <circle cx="12" cy="12" r="1.9" />
        <circle cx="12" cy="19" r="1.9" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ACTION_ICON_PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

function distinctCategories(items: LinkRow[]): string[] {
  const categories = new Set<string>();
  for (const item of items) {
    if (item.category) categories.add(item.category);
  }
  return Array.from(categories).sort();
}

// A tap outside an open menu only closes the menu: the click that follows it (which would open the
// card underneath, or follow a link) is swallowed. Cleared after a moment in case no click comes.
function swallowNextClick() {
  function swallow(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    done();
  }
  function done() {
    window.removeEventListener('click', swallow, true);
    clearTimeout(timer);
  }
  window.addEventListener('click', swallow, true);
  const timer = setTimeout(done, 600);
}

// Closes a dropdown on a tap outside it (the button that opens it handles itself), on Escape, when
// the page really scrolls, and on rotation. At the very top of the page a tap can rubber-band the
// screen: that fires scroll events and shifts the button, but must not close the menu again.
function useDismissibleMenu(open: boolean, close: () => void, menuRef: RefObject<HTMLElement | null>, triggerSelector: string) {
  useEffect(() => {
    if (!open) return;
    const startScroll = window.scrollY;
    const startWidth = window.innerWidth;
    const trigger = () => document.querySelector<HTMLElement>(`${triggerSelector}[aria-expanded="true"]`);
    const startTop = trigger()?.getBoundingClientRect().top ?? 0;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && (menuRef.current?.contains(target) || target.closest(triggerSelector))) return;
      swallowNextClick();
      close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close();
    }
    function onScroll(event: Event) {
      if (event.target === document) {
        if (window.scrollY > 0 && Math.abs(window.scrollY - startScroll) > 8) close();
        return;
      }
      // Something else scrolled (the reader): close once the button has moved away.
      const button = trigger();
      if (!button || Math.abs(button.getBoundingClientRect().top - startTop) > 8) close();
    }
    function onResize() {
      if (window.innerWidth !== startWidth) close();
    }

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close, menuRef, triggerSelector]);
}

export default function LinksBrowser({ initialLinks }: { initialLinks: LinkRow[] }) {
  const router = useRouter();
  const [links, setLinks] = useState<LinkRow[]>(initialLinks);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [tag, setTag] = useState('');
  const [menuLink, setMenuLink] = useState<LinkRow | null>(null);
  // Pictures fetched ahead as files for sharing: Safari wants the share sheet opened right after the tap,
  // so the fetch can't happen in between.
  const shareFiles = useRef(new Map<string, Promise<File | null>>());
  // Where the "..." dropdown hangs: just under (or, near the bottom, above) the button that opened it.
  const [menuPos, setMenuPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const closeItemMenu = useCallback(() => setMenuLink(null), []);
  const [tagsLink, setTagsLink] = useState<LinkRow | null>(null);
  const [editingNote, setEditingNote] = useState<LinkRow | null>(null);
  const [noteEditDraft, setNoteEditDraft] = useState('');
  const [nameEditDraft, setNameEditDraft] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);
  const [savingNoteEdit, setSavingNoteEdit] = useState(false);
  const [renamingLink, setRenamingLink] = useState<LinkRow | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [allTags, setAllTags] = useState<string[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [researchLink, setResearchLink] = useState<LinkRow | null>(null);
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [deleteLink, setDeleteLink] = useState<LinkRow | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  // Where the date-group dropdown hangs: under (or, near the bottom, above) the heading that opened it.
  const [groupPos, setGroupPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const groupMenuRef = useRef<HTMLDivElement>(null);
  const closeGroupMenu = useCallback(() => setGroupPickerOpen(false), []);
  const [editingLink, setEditingLink] = useState<LinkRow | null>(null);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [savingCategory, setSavingCategory] = useState(false);
  const [promptCopiedId, setPromptCopiedId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  // What the top bar shows while scrolled: 0 nothing, 1 the page as at the top, 2 logo bar and search bar.
  const [headerLevel, setHeaderLevel] = useState<0 | 1 | 2>(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [passwordSheetOpen, setPasswordSheetOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [readerLink, setReaderLink] = useState<LinkRow | null>(null);
  const closeReader = useCallback(() => setReaderLink(null), []);
  const swipeDimRef = useRef<HTMLDivElement>(null);
  // While the reader is swiped back, the overview underneath follows it like in iOS: it slides in from
  // 30% to the left and a dark layer over it fades away. Set straight on the elements, every frame.
  const followReaderSwipe = useCallback((progress: number | null, transition: string) => {
    const page = pageRef.current;
    if (!page) return;
    const offset = progress === null ? '' : `${-SWIPE_PARALLAX_PERCENT * (1 - progress)}% 0`;
    const moving = page.querySelectorAll<HTMLElement>(`:scope > section, :scope > .${styles.topBar}, :scope > .${styles.empty}`);
    for (const element of moving) {
      element.style.transition = progress === null ? '' : transition.replace('transform', 'translate');
      element.style.translate = offset;
    }
    const dim = swipeDimRef.current;
    if (dim) {
      dim.style.transition = progress === null ? '' : transition.replace('transform', 'opacity');
      dim.style.opacity = progress === null ? '0' : String(SWIPE_DIM * (1 - progress));
    }
  }, []);
  const readerOpen = readerLink !== null;
  // True while the reader is open and a moment after it closed: the bars on the overview then get a
  // solid background, because Safari skips their blur while the reader slides over them, which let
  // the cards underneath show through.
  const [readerShown, setReaderShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReaderShown(readerOpen), readerOpen ? 0 : READER_SHOWN_TAIL_MS);
    return () => clearTimeout(timer);
  }, [readerOpen]);

  // The reader gets its own history entry, so the browser's back button closes it and
  // returns to the overview instead of leaving Instavol. Closing it any other way
  // (back arrow, swipe, filter) removes that entry again.
  useEffect(() => {
    if (!readerOpen) return;
    window.history.pushState(null, '');
    let closedByBrowser = false;
    function onPopState() {
      closedByBrowser = true;
      setReaderLink(null);
    }
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (!closedByBrowser) window.history.back();
    };
  }, [readerOpen]);
  const topSentinel = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);

  // Date headings stick right below the search header (and the logo bar, when it shows), whose
  // heights can change (e.g. the Enter hint, or the iPhone text size).
  useEffect(() => {
    const page = pageRef.current;
    const header = headerRef.current;
    const brand = brandRef.current;
    if (!page || !header || !brand || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      page.style.setProperty('--header-height', `${header.offsetHeight}px`);
      page.style.setProperty('--brand-height', `${brand.offsetHeight}px`);
    });
    observer.observe(header);
    observer.observe(brand);
    return () => observer.disconnect();
  }, []);

  // Compact header (logo hidden) once the top of the page has scrolled out of view.
  useEffect(() => {
    const sentinel = topSentinel.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setCompact(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);
  // Scrolling down slides the logo bar and search bar away; any scroll up brings both back right
  // away. At the very top the page looks as it does there, and while typing in the search field the
  // search bar stays.
  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;
    function check() {
      frame = 0;
      const y = window.scrollY;
      const dy = y - lastY;
      const typing = document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'search';
      if (typing || y <= HEADER_TOP_PX) {
        setHeaderLevel(1);
        lastY = y;
        return;
      }
      if (Math.abs(dy) <= HEADER_SCROLL_SLACK_PX) return;
      lastY = y;
      if (dy < 0) setHeaderLevel(2);
      else if (y >= HEADER_HIDE_AFTER_PX) setHeaderLevel(0);
    }
    function onScroll() {
      if (!frame) frame = requestAnimationFrame(check);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      if (tag) params.set('tag', tag);
      fetch(`/api/links?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => setLinks(data.links));
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [q, category, tag]);

  // Pull-to-refresh for the home-screen app. The pull distance is written straight to the
  // indicator's style, so dragging doesn't re-render the whole list on every touchmove.
  const pullIndicatorRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshLinks = useCallback(() => {
    setRefreshing(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (tag) params.set('tag', tag);
    fetch(`/api/links?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setLinks(data.links))
      .catch(() => {})
      .finally(() => setRefreshing(false));
  }, [q, category, tag]);

  useEffect(() => {
    if (!isStandalone()) return;

    let startY: number | null = null;
    let distance = 0;

    function showPull(px: number) {
      const indicator = pullIndicatorRef.current;
      if (!indicator) return;
      indicator.style.setProperty('--pull', String(px));
      indicator.dataset.ready = String(px >= PULL_THRESHOLD_PX);
    }

    function onTouchStart(event: TouchEvent) {
      const inSheet = event.target instanceof Element && event.target.closest(`.${styles.sheetBackdrop}, .${styles.popover}, [data-reader]`);
      if (window.scrollY > 0 || event.touches.length !== 1 || inSheet) return;
      startY = event.touches[0].clientY;
      distance = 0;
    }

    function onTouchMove(event: TouchEvent) {
      if (startY === null) return;
      const dy = event.touches[0].clientY - startY;
      if (dy <= 0 || window.scrollY > 0) {
        startY = null;
        showPull(0);
        return;
      }
      // Stop the rubber-band bounce so only the indicator moves.
      event.preventDefault();
      distance = dy * PULL_RESISTANCE;
      showPull(distance);
    }

    function onTouchEnd() {
      if (startY === null) return;
      startY = null;
      showPull(0);
      if (distance >= PULL_THRESHOLD_PX) refreshLinks();
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [refreshLinks]);

  // Opening the app again (it stays alive in the background on a phone) fetches the items saved in
  // the meantime, quietly and with the current search and filters. Only after being away a while,
  // so switching apps for a second doesn't reload anything.
  useEffect(() => {
    let hiddenAt = 0;
    function refreshQuietly() {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      if (tag) params.set('tag', tag);
      fetch(`/api/links?${params.toString()}`, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setLinks(data.links))
        .catch(() => {});
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (hiddenAt && Date.now() - hiddenAt > RESUME_REFRESH_AFTER_MS) {
        hiddenAt = 0;
        refreshQuietly();
      }
    }
    // Coming back to a page the browser kept as it was (Safari's back/forward cache).
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) refreshQuietly();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [q, category, tag]);

  // Refresh while items are being processed, so title/summary appear without a reload.
  const hasPending = links.some((link) => link.status === 'pending');
  useEffect(() => {
    if (!hasPending) return;

    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        clearInterval(timer);
        return;
      }
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (category) params.set('category', category);
      if (tag) params.set('tag', tag);
      fetch(`/api/links?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => setLinks(data.links));
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [hasPending, q, category, tag]);

  async function handleRetry(id: string) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/links/${id}/reprocess`, { method: 'POST' });
      const updated = await res.json();
      setLinks((prev) => prev.map((link) => (link.id === id ? updated : link)));
    } finally {
      setRetryingId(null);
    }
  }

  async function handleSave(url: string) {
    setSaving(true);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const created: LinkRow = await res.json();
        setLinks((prev) => [created, ...prev]);
        setQ('');
      }
    } finally {
      setSaving(false);
    }
  }

  // A screenshot or other picture, from the clipboard or the file picker.
  async function handleUploadImage(file: File) {
    setSaving(true);
    setAddError(null);
    try {
      const form = new FormData();
      form.set('file', await prepareImage(file), file.name || 'afbeelding');
      const res = await fetch('/api/links', { method: 'POST', body: form });
      if (!res.ok) throw new Error();
      const created: LinkRow = await res.json();
      setLinks((prev) => [created, ...prev]);
      setAddSheetOpen(false);
    } catch {
      setAddError('De afbeelding kon niet bewaard worden.');
    } finally {
      setSaving(false);
    }
  }

  // A loose note without a link; the server gives it a title and category.
  async function handleSaveNote() {
    const text = noteDraft.trim();
    if (!text) return;
    setSaving(true);
    setAddError(null);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error();
      const created: LinkRow = await res.json();
      setLinks((prev) => [created, ...prev]);
      setNoteDraft('');
      setAddSheetOpen(false);
    } catch {
      setAddError('De notitie kon niet bewaard worden.');
    } finally {
      setSaving(false);
    }
  }

  // Opens the native share sheet, or copies the text where sharing isn't supported.
  async function shareOrCopy(
    text: string,
    url: string | undefined,
    id: string,
    setFeedbackId: (update: (current: string | null) => string | null) => void,
    file?: File | null,
  ) {
    if (navigator.share) {
      try {
        if (file && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], ...(text && { text }) });
        } else if (text) {
          // On iOS the url stays inside the text only; on a Mac it's also passed separately (see isMacDesktop).
          await navigator.share(isMacDesktop() ? { text, url } : { text });
        }
      } catch {
        // User closed the share sheet; nothing to do.
      }
      return;
    }
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setFeedbackId(() => id);
    setTimeout(() => setFeedbackId((current) => (current === id ? null : current)), COPIED_FEEDBACK_MS);
  }

  // The picture of a note or image, as a file; fetched once and kept (its url changes when it is replaced).
  function shareFileFor(link: LinkRow): Promise<File | null> {
    if (link.kind === 'link' || !link.imageUrl) return Promise.resolve(null);
    let file = shareFiles.current.get(link.imageUrl);
    if (!file) {
      file = loadShareFile(link);
      shareFiles.current.set(link.imageUrl, file);
    }
    return file;
  }

  // Opening the "..." menu already fetches the picture, so it is there when "Delen" is chosen.
  useEffect(() => {
    if (menuLink) void shareFileFor(menuLink);
  }, [menuLink]);

  async function handleShare(link: LinkRow) {
    const file = await shareFileFor(link);
    return shareOrCopy(buildShareText(link), link.url ?? undefined, link.id, setCopiedId, file);
  }

  function handleResearch(focus: ResearchFocus) {
    if (!researchLink) return;
    const link = researchLink;
    setResearchLink(null);
    return shareOrCopy(buildResearchPrompt(link, focus, formatDate(link.createdAt)), link.url ?? undefined, link.id, setPromptCopiedId);
  }

  // Switches between light and dark; the choice is remembered on this device.
  function toggleTheme() {
    const root = document.documentElement;
    const current = root.dataset.theme ?? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try {
      localStorage.setItem('instavol-theme', next);
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }

  // The logo goes back to the default home view: no search or filters, top of the list.
  function goHome() {
    setQ('');
    setCategory('');
    setTag('');
    setReaderLink(null);
    closeSettings();
    window.scrollTo({ top: 0 });
  }

  function toggleCategoryFilter(link: LinkRow) {
    setCategory((current) => (current === link.category ? '' : (link.category ?? '')));
  }

  // Tapping a tag filters on it (or stops filtering); from the reader it goes back to the list.
  function toggleTagFilter(value: string) {
    setReaderLink(null);
    setTag((current) => (current === value ? '' : value));
  }

  // Keeps the list and an open reader in step after an item changed.
  function replaceLink(updated: LinkRow) {
    setLinks((prev) => prev.map((link) => (link.id === updated.id ? updated : link)));
    setReaderLink((current) => (current?.id === updated.id ? updated : current));
  }

  // The "..." menu: each choice closes it and opens what it stands for.
  function chooseFromMenu(action: (link: LinkRow) => void) {
    const link = menuLink;
    setMenuLink(null);
    if (link) action(link);
  }

  function openTags(link: LinkRow) {
    setTagsLink(link);
    setTagDraft('');
    // The filtered list may not contain every tag, so ask the server for all of them.
    fetch('/api/tags')
      .then((res) => res.json())
      .then((data) => setAllTags(data.tags))
      .catch(() => setAllTags(Array.from(new Set(links.flatMap((item) => item.tags ?? [])))));
  }

  async function saveTags(link: LinkRow, tags: string[]) {
    if (savingTags) return;
    setSavingTags(true);
    try {
      const res = await fetch(`/api/links/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags }),
      });
      if (res.ok) {
        const updated: LinkRow = await res.json();
        replaceLink(updated);
        setTagsLink(updated);
        setAllTags((prev) => [...prev, ...updated.tags.filter((t) => !prev.includes(t))]);
      }
    } finally {
      setSavingTags(false);
    }
  }

  function addTag(link: LinkRow, value: string) {
    const name = value.trim();
    if (!name) return;
    setTagDraft('');
    saveTags(link, [...(link.tags ?? []), name]);
  }

  // A tap on a note or image card opens the reader, except on a button or link inside it, or while text
  // on the card is selected (that tap only puts the selection away).
  function openOwnItem(event: React.MouseEvent, link: LinkRow) {
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    if (window.getSelection()?.toString()) return;
    setReaderLink(link);
  }

  // Notes and uploaded images are edited in one sheet: the name and the text together.
  function startEditingNote(link: LinkRow) {
    setEditingNote(link);
    setNameEditDraft(link.title ?? '');
    setNoteEditDraft(link.notes[0]?.text ?? '');
    setImageError(null);
  }

  // Adds, replaces or removes the picture right away; the name and text are saved with "Bewaar".
  async function changeEditedImage(file: File | null) {
    if (!editingNote || imageBusy) return;
    setImageBusy(true);
    setImageError(null);
    try {
      const res = file
        ? await fetch(`/api/links/${editingNote.id}/image`, { method: 'POST', body: (() => {
            const form = new FormData();
            form.set('file', file, file.name || 'afbeelding');
            return form;
          })() })
        : await fetch(`/api/links/${editingNote.id}/image`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      const updated: LinkRow = await res.json();
      replaceLink(updated);
      setEditingNote(updated);
    } catch {
      setImageError('De afbeelding kon niet gewijzigd worden.');
    } finally {
      setImageBusy(false);
    }
  }

  async function saveNoteEdit() {
    if (!editingNote || savingNoteEdit) return;
    const title = nameEditDraft.trim();
    const text = noteEditDraft.trim();
    setSavingNoteEdit(true);
    try {
      const res = await fetch(`/api/links/${editingNote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(title && { title }), text }),
      });
      if (res.ok) {
        replaceLink(await res.json());
        setEditingNote(null);
      }
    } finally {
      setSavingNoteEdit(false);
    }
  }

  function startRenaming(link: LinkRow) {
    setRenamingLink(link);
    setNameDraft(link.title ?? '');
  }

  async function saveName() {
    const title = nameDraft.trim();
    if (!renamingLink || !title || savingName) return;
    setSavingName(true);
    try {
      const res = await fetch(`/api/links/${renamingLink.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        replaceLink(await res.json());
        setRenamingLink(null);
      }
    } finally {
      setSavingName(false);
    }
  }

  function startEditingCategory(link: LinkRow) {
    setEditingLink(link);
    setCategoryDraft(link.category ?? '');
    // The filtered list may not contain every category, so ask the server for all of them.
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setAllCategories(data.categories))
      .catch(() => setAllCategories(distinctCategories(links)));
  }

  async function saveCategory(value: string) {
    if (!editingLink || !value.trim() || savingCategory) return;
    setSavingCategory(true);
    try {
      const res = await fetch(`/api/links/${editingLink.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: value.trim() }),
      });
      if (res.ok) {
        const updated: LinkRow = await res.json();
        replaceLink(updated);
        setEditingLink(null);
      }
    } finally {
      setSavingCategory(false);
    }
  }

  function jumpToGroup(label: string) {
    setGroupPickerOpen(false);
    const section = pageRef.current?.querySelector<HTMLElement>(`section[data-group="${CSS.escape(label)}"]`);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    section?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  // The "..." and date-group dropdowns close on an outside tap, Escape, scrolling and rotating.
  useDismissibleMenu(menuLink !== null, closeItemMenu, itemMenuRef, '[data-item-menu-trigger]');
  useDismissibleMenu(groupPickerOpen, closeGroupMenu, groupMenuRef, '[data-group-trigger]');

  function closeSettings() {
    setSettingsOpen(false);
    setPasswordSheetOpen(false);
  }

  // The settings menu closes on a tap outside it or on Escape.
  useEffect(() => {
    if (!settingsOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !settingsRef.current?.contains(event.target)) {
        swallowNextClick();
        closeSettings();
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSettings();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [settingsOpen]);

  // Escape closes the password dialog (a tap beside it doesn't, so typed text isn't lost by accident).
  useEffect(() => {
    if (!passwordSheetOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeSettings();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [passwordSheetOpen]);

  function openPasswordSheet() {
    setCurrentPassword('');
    setNewPassword('');
    setRepeatPassword('');
    setPasswordError(null);
    setPasswordChanged(false);
    setSettingsOpen(false);
    setPasswordSheetOpen(true);
  }

  async function savePassword() {
    if (newPassword !== repeatPassword) {
      setPasswordError('De nieuwe wachtwoorden zijn niet gelijk');
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    try {
      const res = await fetch('/api/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        setPasswordChanged(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      setPasswordError(data.error ?? 'Wijzigen mislukt, probeer het opnieuw');
    } catch {
      setPasswordError('Geen verbinding, probeer het opnieuw');
    } finally {
      setSavingPassword(false);
    }
  }

  function handleLogout() {
    closeSettings();
    setLogoutConfirmOpen(true);
  }

  async function confirmLogout() {
    setLogoutConfirmOpen(false);
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
  }

  async function handleDelete(id: string) {
    setDeleteLink(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/links/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setLinks((prev) => prev.filter((link) => link.id !== id));
        setReaderLink((current) => (current?.id === id ? null : current));
      }
    } finally {
      setDeletingId(null);
    }
  }

  const categories = distinctCategories(links);
  const isFiltering = Boolean(q || category || tag);

  // Round "..." button that opens the item menu; shows a check while something was just copied.
  function moreButton(link: LinkRow, className: string) {
    const copied = copiedId === link.id || promptCopiedId === link.id;
    return (
      <button
        className={className}
        onClick={(event) => {
          if (menuLink?.id === link.id) return setMenuLink(null);
          const rect = event.currentTarget.getBoundingClientRect();
          const below = window.innerHeight - rect.bottom;
          setMenuPos({
            right: Math.max(8, window.innerWidth - rect.right),
            ...(below < 300 && rect.top > below ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
          });
          setMenuLink(link);
        }}
        aria-label={copied ? 'Gekopieerd' : 'Meer'}
        aria-haspopup="menu"
        aria-expanded={menuLink?.id === link.id}
        data-item-menu-trigger
        title="Meer"
      >
        <ActionIcon name={copied ? 'done' : 'more'} />
      </button>
    );
  }

  // On a card, a "+" after the tags (or on its own, without tags) opens the tag editor.
  function tagList(link: LinkRow, withAdd = false) {
    if (!link.tags?.length && !withAdd) return null;
    return (
      <ul className={readerStyles.tags} aria-label="Tags">
        {(link.tags ?? []).map((t) => (
          <li key={t}>
            <button className={readerStyles.tag} aria-pressed={tag === t} onClick={() => toggleTagFilter(t)}>
              {t}
            </button>
          </li>
        ))}
        {withAdd && (
          <li>
            <button className={`${readerStyles.tag} ${styles.tagAdd}`} aria-label="Tags toevoegen" title="Tags toevoegen" onClick={() => openTags(link)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </li>
        )}
      </ul>
    );
  }
  const groups = groupByDate(links);
  const suggestedTags = tagsLink
    ? allTags.filter((t) => !tagsLink.tags?.some((own) => own.toLocaleLowerCase('nl') === t.toLocaleLowerCase('nl')))
    : [];

  return (
    <main ref={pageRef} className={styles.page} data-compact={compact} data-header-level={headerLevel} data-reader-open={readerOpen || readerShown}>
      <div ref={topSentinel} className={styles.sentinel} aria-hidden="true" />
      <div ref={pullIndicatorRef} className={styles.pullIndicator} data-refreshing={refreshing} role="status" aria-label={refreshing ? 'Verversen' : undefined}>
        <span className={styles.spinner} aria-hidden="true" />
      </div>
      <div className={styles.topBar}>
        <div ref={brandRef} className={styles.brand}>
          <h1>
            <button className={styles.logoButton} onClick={goHome} title="Terug naar het overzicht">
              {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG */}
              <img src="/instavol-logo-light.svg" alt="Instavol" className={`${styles.logo} on-light`} />
              {/* eslint-disable-next-line @next/next/no-img-element -- small static SVG */}
              <img src="/instavol-logo-dark.svg" alt="" className={`${styles.logo} on-dark`} />
            </button>
          </h1>
          <div className={styles.brandActions}>
            <button className={styles.iconButton} onClick={refreshLinks} disabled={refreshing} aria-label="Verversen" title="Verversen">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 12a8 8 0 1 1-2.34-5.66" />
                <path d="M20 4v4h-4" />
              </svg>
            </button>
            <button className={styles.iconButton} onClick={toggleTheme} aria-label="Wissel tussen licht en donker" title="Licht / donker">
              <svg className="on-light" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
              </svg>
              <svg className="on-dark" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            </button>
            <div ref={settingsRef} className={styles.settings}>
              <button
                className={styles.iconButton}
                onClick={() => (settingsOpen ? closeSettings() : setSettingsOpen(true))}
                aria-label="Instellingen"
                title="Instellingen"
                aria-haspopup="menu"
                aria-expanded={settingsOpen}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
              {settingsOpen && (
                <div className={styles.popover} role="menu" aria-label="Instellingen">
                  <button className={`${styles.popoverItem} ${styles.menuOption}`} role="menuitem" onClick={openPasswordSheet}>
                    <span>Wachtwoord wijzigen</span>
                    <ActionIcon name="password" />
                  </button>
                  <button className={`${styles.popoverItem} ${styles.menuOption} ${styles.menuDanger}`} role="menuitem" onClick={handleLogout}>
                    <span>Uitloggen</span>
                    <ActionIcon name="logout" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <header ref={headerRef} className={styles.header}>
          <div className={styles.controls}>
            <div className={styles.searchWrap}>
              <input
                ref={searchRef}
                type="search"
                enterKeyHint="go"
                autoCapitalize="none"
                autoCorrect="off"
                aria-label="Zoek of plak een link"
                placeholder="Zoek"
                className={styles.search}
                value={q}
                onChange={(event) => setQ(event.target.value)}
                onPaste={(event) => {
                  const image = Array.from(event.clipboardData.files).find((file) => file.type.startsWith('image/'));
                  if (!image) return;
                  event.preventDefault();
                  handleUploadImage(image);
                }}
                onKeyDown={(event) => {
                  const url = parseShareUrl(q);
                  if (event.key === 'Enter' && url && !saving) handleSave(url);
                }}
              />
              {q && (
                <button
                  type="button"
                  className={styles.searchClear}
                  aria-label="Zoekterm wissen"
                  title="Wissen"
                  // Keeps the keyboard open: the field must not lose focus when tapping the cross.
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setQ('');
                    searchRef.current?.focus();
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="button"
              className={styles.addButton}
              aria-label="Afbeelding of notitie toevoegen"
              title="Afbeelding of notitie toevoegen"
              onClick={() => {
                setAddError(null);
                setAddSheetOpen(true);
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
            <select
              aria-label="Categorie"
              className={styles.select}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="">Alles</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {parseShareUrl(q) && <p className={styles.hint}>Druk op Enter om deze link te bewaren</p>}
          {tag && (
            <div className={styles.activeTag}>
              <span>Tag:</span>
              <button className={readerStyles.tag} aria-pressed="true" aria-label={`Stop filter op tag ${tag}`} onClick={() => setTag('')}>
                {tag} ✕
              </button>
            </div>
          )}
        </header>
      </div>

      {links.length === 0 ? (
        <div className={styles.empty}>
          {isFiltering ? (
            <p className={styles.emptyTitle}>Geen resultaten</p>
          ) : (
            <>
              <p className={styles.emptyTitle}>Nog niets bewaard</p>
              <p>Plak hierboven een link of screenshot, of deel een pagina vanuit Safari met &ldquo;Bewaar in Instavol&rdquo;.</p>
            </>
          )}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.label} className={styles.group} data-group={group.label}>
            <h2 className={styles.groupHeading}>
              <button
                className={styles.groupButton}
                aria-label={`${group.label}, kies een periode`}
                aria-haspopup="menu"
                aria-expanded={groupPickerOpen}
                data-group-trigger
                onClick={(event) => {
                  if (groupPickerOpen) return setGroupPickerOpen(false);
                  const rect = event.currentTarget.getBoundingClientRect();
                  const below = window.innerHeight - rect.bottom;
                  setGroupPos({
                    left: Math.max(8, rect.left),
                    ...(below < 300 && rect.top > below ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
                  });
                  setGroupPickerOpen(true);
                }}
              >
                {group.label}
                <svg width="10" height="10" viewBox="0 0 12 8" aria-hidden="true">
                  <path d="M1 1.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </h2>
            <ul className={styles.list}>
              {group.items.map((link) => (
                <li
                  key={link.id}
                  className={`${styles.card} ${link.kind !== 'link' ? styles.cardOpenable : ''}`}
                  onClick={link.kind !== 'link' ? (event) => openOwnItem(event, link) : undefined}
                >
                  <div className={`${styles.cardMain} ${link.kind !== 'link' && link.imageUrl ? styles.cardMainImage : ''}`}>
                    <div className={styles.cardTop}>
                      {link.category && (
                        <button
                          className={styles.chip}
                          aria-label={`Categorie ${link.category}`}
                          aria-pressed={category === link.category}
                          onClick={() => toggleCategoryFilter(link)}
                        >
                          {link.category}
                        </button>
                      )}
                      <span className={styles.date}>{formatDate(link.createdAt)}</span>
                      {moreButton(link, styles.moreButton)}
                    </div>
                    {link.kind === 'link' ? (
                      <a
                        href={link.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={styles.cardTitle}
                        onClick={(event) => {
                          // Saved articles open in the reader; a modified click still opens the site.
                          if (!link.readingMinutes || event.metaKey || event.ctrlKey || event.shiftKey) return;
                          event.preventDefault();
                          setReaderLink(link);
                        }}
                      >
                        {link.title ?? link.url ?? itemName(link)}
                        {!link.readingMinutes && (
                          <svg className={styles.externalIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M14 4h6v6" />
                            <path d="M20 4l-9 9" />
                            <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
                          </svg>
                        )}
                      </a>
                    ) : (
                      // The user's own item: no link stretched over the card, so its text can be selected;
                      // a tap on the card (see openOwnItem) or on this title opens the reader.
                      <button type="button" className={`${styles.cardTitle} ${styles.cardTitleStatic} ${styles.cardTitleButton}`} onClick={() => setReaderLink(link)}>
                        {itemName(link)}
                      </button>
                    )}
                    <div className={styles.meta}>
                      {link.url && <span>{domainFromUrl(link.url).replace(/^www\./, '')}</span>}
                      {link.readingMinutes && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{link.readingMinutes} min. leestijd</span>
                        </>
                      )}
                      {link.kind === 'link' && link.notes.length > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className={styles.noteCount}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                            </svg>
                            {link.notes.length === 1 ? '1 notitie' : `${link.notes.length} notities`}
                          </span>
                        </>
                      )}
                    </div>
                    {link.imageUrl && link.kind === 'link' && (
                      // A remote og:image; hidden when it fails to load (e.g. hotlinking blocked).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={link.imageUrl}
                        alt=""
                        className={styles.thumbnail}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    )}
                    {link.imageUrl && link.kind !== 'link' && (
                      // The user's own picture; a tap on it opens the reader, like a tap anywhere on the card.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={link.imageUrl}
                        alt=""
                        className={styles.heroImage}
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                    )}
                    {link.kind !== 'link' && link.notes[0] && (
                      <NoteBody key={link.notes[0].text} text={link.notes[0].text} />
                    )}
                    {link.status === 'done' && link.summary && (
                      <p className={styles.summary}>{link.summary}</p>
                    )}
                    {link.kind !== 'note' && link.status === 'pending' && (
                      <p className={styles.status}>
                        <span className={styles.spinner} aria-hidden="true" />
                        Wordt verwerkt...
                      </p>
                    )}
                    {link.kind !== 'note' && link.status === 'failed' && (
                      <p className={`${styles.status} ${styles.failed}`}>Mislukt: {link.errorMessage}</p>
                    )}
                  </div>
                  {tagList(link, true)}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {editingLink && (
        <div className={styles.sheetBackdrop} onClick={() => setEditingLink(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-edit-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${styles.sheetGroup} ${styles.sheetScroll}`}>
              <div className={styles.sheetHeader}>
                <p id="category-edit-title" className={styles.sheetTitle}>
                  Categorie wijzigen
                </p>
                <p className={styles.sheetSubtitle}>{itemName(editingLink)}</p>
              </div>
              <div className={styles.pickerBody}>
                <form
                  className={styles.pickerForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveCategory(categoryDraft);
                  }}
                >
                  <input
                    className={styles.pickerInput}
                    aria-label="Nieuwe categorie"
                    placeholder="Nieuwe categorie"
                    enterKeyHint="done"
                    autoCapitalize="sentences"
                    value={categoryDraft}
                    onChange={(event) => setCategoryDraft(event.target.value)}
                  />
                  <button type="submit" className={styles.pickerSave} disabled={!categoryDraft.trim() || savingCategory}>
                    Bewaar
                  </button>
                </form>
                {allCategories.length > 0 && (
                  <section>
                    <h3 className={styles.pickerLabel}>Kies een categorie</h3>
                    <ul className={styles.chipList}>
                      {allCategories.map((c) => (
                        <li key={c}>
                          <button
                            className={`${styles.pickChip} ${c === editingLink.category ? styles.pickChipSelected : ''}`}
                            aria-pressed={c === editingLink.category}
                            disabled={savingCategory}
                            onClick={() => saveCategory(c)}
                          >
                            {c}
                            {c === editingLink.category && <span aria-hidden="true"> ✓</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
            <button className={styles.sheetCancel} onClick={() => setEditingLink(null)}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      {groupPickerOpen && groupPos && (
        <div
          ref={groupMenuRef}
          role="menu"
          aria-label="Ga naar"
          className={`${styles.popover} ${styles.itemMenu} ${styles.groupMenu}`}
          style={{ ...groupPos, right: 'auto' }}
        >
          {groups.map((group) => (
            <button
              key={group.label}
              className={`${styles.popoverItem} ${styles.menuOption}`}
              role="menuitem"
              aria-label={`${group.label} (${group.items.length})`}
              onClick={() => jumpToGroup(group.label)}
            >
              <span>{group.label}</span>
              <span className={styles.sheetCount}>{group.items.length}</span>
            </button>
          ))}
        </div>
      )}

      {researchLink && (
        <div className={styles.sheetBackdrop} onClick={() => setResearchLink(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="research-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sheetGroup}>
              <div className={styles.sheetHeader}>
                <p id="research-title" className={styles.sheetTitle}>
                  Onderzoek met AI
                </p>
                <p className={styles.sheetSubtitle}>{itemName(researchLink)}</p>
              </div>
              {RESEARCH_FOCUSES.map((focus) => (
                <button key={focus.id} className={styles.sheetOption} onClick={() => handleResearch(focus.id)}>
                  {focus.label}
                </button>
              ))}
            </div>
            <button className={styles.sheetCancel} onClick={() => setResearchLink(null)}>
              Annuleren
            </button>
          </div>
        </div>
      )}

      <div ref={swipeDimRef} className={styles.swipeDim} aria-hidden="true" />
      {readerLink && (
        <Reader
          onSwipe={followReaderSwipe}
          key={readerLink.id}
          link={readerLink}
          domain={readerLink.url ? domainFromUrl(readerLink.url) : ''}
          onClose={closeReader}
          onChange={replaceLink}
          actions={moreButton(readerLink, readerStyles.barIcon)}
          labels={
            Boolean(readerLink.category || readerLink.tags?.length) && (
              <>
                {readerLink.category && (
                  <button
                    className={styles.chip}
                    aria-label={`Categorie ${readerLink.category}`}
                    aria-pressed={category === readerLink.category}
                    onClick={() => {
                      setReaderLink(null);
                      toggleCategoryFilter(readerLink);
                    }}
                  >
                    {readerLink.category}
                  </button>
                )}
                {readerLink.category && readerLink.tags?.length > 0 && (
                  <svg className={styles.labelArrow} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14" />
                    <path d="M13 6l6 6-6 6" />
                  </svg>
                )}
                {tagList(readerLink)}
              </>
            )
          }
        />
      )}

      {menuLink && menuPos && (
        <div
          ref={itemMenuRef}
          role="menu"
          aria-label={itemName(menuLink)}
          className={`${styles.popover} ${styles.itemMenu}`}
          style={menuPos}
        >
          <button className={`${styles.popoverItem} ${styles.menuOption}`} role="menuitem" onClick={() => chooseFromMenu(menuLink.kind === 'link' ? startRenaming : startEditingNote)}>
            <span>{menuLink.kind === 'link' ? 'Naam wijzigen' : 'Bewerken'}</span>
            <ActionIcon name="rename" />
          </button>
          <button className={`${styles.popoverItem} ${styles.menuOption}`} role="menuitem" onClick={() => chooseFromMenu(openTags)}>
            <span>Tags toevoegen</span>
            <ActionIcon name="tag" />
          </button>
          <button className={`${styles.popoverItem} ${styles.menuOption}`} role="menuitem" onClick={() => chooseFromMenu(startEditingCategory)}>
            <span>Categorie wijzigen</span>
            <ActionIcon name="category" />
          </button>
          <button className={`${styles.popoverItem} ${styles.menuOption}`} role="menuitem" onClick={() => chooseFromMenu(handleShare)}>
            <span>Delen</span>
            <ActionIcon name="share" />
          </button>
          <button className={`${styles.popoverItem} ${styles.menuOption}`} role="menuitem" onClick={() => chooseFromMenu(setResearchLink)}>
            <span>AI-onderzoek</span>
            <ActionIcon name="research" />
          </button>
          {menuLink.status !== 'done' && (
            <button
              className={`${styles.popoverItem} ${styles.menuOption}`}
              role="menuitem"
              disabled={retryingId === menuLink.id}
              onClick={() => chooseFromMenu((link) => handleRetry(link.id))}
            >
              <span>Opnieuw verwerken</span>
              <ActionIcon name="retry" />
            </button>
          )}
          <button
            className={`${styles.popoverItem} ${styles.menuOption} ${styles.menuDanger}`}
            role="menuitem"
            disabled={deletingId === menuLink.id}
            onClick={() => chooseFromMenu(setDeleteLink)}
          >
            <span>Verwijderen</span>
            <ActionIcon name="delete" />
          </button>
        </div>
      )}

      {passwordSheetOpen && (
        <div className={styles.dialogBackdrop}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-title"
            className={`${styles.dialog} ${styles.dialogWide}`}
          >
            <div className={styles.dialogBody}>
              <p id="password-title" className={styles.dialogTitle}>
                Wachtwoord wijzigen
              </p>
              {passwordChanged && <p className={styles.dialogText}>Je wachtwoord is gewijzigd</p>}
            </div>
            {!passwordChanged && (
              <form
                id="password-form"
                className={styles.passwordBody}
                onSubmit={(event) => {
                  event.preventDefault();
                  savePassword();
                }}
              >
                <input
                  className={styles.pickerInput}
                  type="password"
                  aria-label="Huidig wachtwoord"
                  placeholder="Huidig wachtwoord"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
                <input
                  className={styles.pickerInput}
                  type="password"
                  aria-label="Nieuw wachtwoord"
                  placeholder="Nieuw wachtwoord (minstens 8 tekens)"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                />
                <input
                  className={styles.pickerInput}
                  type="password"
                  aria-label="Herhaal nieuw wachtwoord"
                  placeholder="Herhaal nieuw wachtwoord"
                  autoComplete="new-password"
                  required
                  value={repeatPassword}
                  onChange={(event) => setRepeatPassword(event.target.value)}
                />
                {passwordError && (
                  <p className={styles.passwordError} role="alert">
                    {passwordError}
                  </p>
                )}
              </form>
            )}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.dialogButton} onClick={closeSettings}>
                {passwordChanged ? 'Sluiten' : 'Annuleren'}
              </button>
              {!passwordChanged && (
                <button type="submit" form="password-form" className={styles.dialogButton} disabled={savingPassword}>
                  Bewaar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {logoutConfirmOpen && (
        <div className={styles.dialogBackdrop} onClick={() => setLogoutConfirmOpen(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            aria-describedby="logout-text"
            className={styles.dialog}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.dialogBody}>
              <p id="logout-title" className={styles.dialogTitle}>
                Uitloggen?
              </p>
              <p id="logout-text" className={styles.dialogText}>
                Weet je zeker dat je wilt uitloggen?
              </p>
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogButton} onClick={() => setLogoutConfirmOpen(false)}>
                Annuleren
              </button>
              <button className={`${styles.dialogButton} ${styles.dialogDanger}`} onClick={confirmLogout}>
                Uitloggen
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteLink && (
        <div className={styles.dialogBackdrop} onClick={() => setDeleteLink(null)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-title"
            aria-describedby="delete-text"
            className={styles.dialog}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.dialogBody}>
              <p id="delete-title" className={styles.dialogTitle}>
                Item verwijderen?
              </p>
              <p id="delete-text" className={styles.dialogText}>
                Weet je zeker dat je dit item wilt verwijderen?
              </p>
              <p className={styles.dialogItem}>{itemName(deleteLink)}</p>
            </div>
            <div className={styles.dialogActions}>
              <button className={styles.dialogButton} onClick={() => setDeleteLink(null)}>
                Annuleren
              </button>
              <button className={`${styles.dialogButton} ${styles.dialogDanger}`} onClick={() => handleDelete(deleteLink.id)}>
                Verwijderen
              </button>
            </div>
          </div>
        </div>
      )}

      {tagsLink && (
        <div className={styles.sheetBackdrop} onClick={() => setTagsLink(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="tags-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${styles.sheetGroup} ${styles.sheetScroll}`}>
              <div className={styles.sheetHeader}>
                <p id="tags-title" className={styles.sheetTitle}>
                  Tags
                </p>
                <p className={styles.sheetSubtitle}>{itemName(tagsLink)}</p>
              </div>
              <div className={styles.pickerBody}>
                <form
                  className={styles.pickerForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    addTag(tagsLink, tagDraft);
                  }}
                >
                  <input
                    className={styles.pickerInput}
                    aria-label="Nieuwe tag"
                    placeholder="Nieuwe tag"
                    enterKeyHint="done"
                    autoCapitalize="none"
                    maxLength={40}
                    value={tagDraft}
                    onChange={(event) => setTagDraft(event.target.value)}
                  />
                  <button type="submit" className={styles.pickerSave} disabled={!tagDraft.trim() || savingTags}>
                    Voeg toe
                  </button>
                </form>
                {tagsLink.tags?.length > 0 && (
                  <section>
                    <h3 className={styles.pickerLabel}>Op dit artikel</h3>
                    <ul className={styles.chipList} aria-label="Huidige tags">
                      {tagsLink.tags.map((t) => (
                        <li key={t}>
                          <button
                            className={`${styles.pickChip} ${styles.pickChipSelected}`}
                            aria-label={`Tag ${t} verwijderen`}
                            disabled={savingTags}
                            onClick={() => saveTags(tagsLink, tagsLink.tags.filter((other) => other !== t))}
                          >
                            {t}
                            <span aria-hidden="true"> ✕</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {suggestedTags.length > 0 && (
                  <section>
                    <h3 className={styles.pickerLabel}>Eerder gebruikt</h3>
                    <ul className={styles.chipList}>
                      {suggestedTags.map((t) => (
                        <li key={t}>
                          <button className={styles.pickChip} disabled={savingTags} onClick={() => addTag(tagsLink, t)}>
                            {t}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            </div>
            <button className={styles.sheetCancel} onClick={() => setTagsLink(null)}>
              Klaar
            </button>
          </div>
        </div>
      )}
      {addSheetOpen && (
        <div className={styles.sheetBackdrop} onClick={() => setAddSheetOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${styles.sheetGroup} ${styles.sheetScroll}`}>
              <div className={styles.sheetHeader}>
                <p id="add-title" className={styles.sheetTitle}>
                  Toevoegen
                </p>
              </div>
              <div className={styles.pickerBody}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label="Afbeelding kiezen"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) handleUploadImage(file);
                  }}
                />
                <button type="button" className={styles.pickerSave} disabled={saving} onClick={() => fileInputRef.current?.click()}>
                  Afbeelding kiezen
                </button>
                <form
                  className={styles.noteForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleSaveNote();
                  }}
                >
                  <textarea
                    className={styles.noteInput}
                    aria-label="Notitie"
                    placeholder="Schrijf een notitie"
                    rows={4}
                    maxLength={2000}
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                  />
                  <button type="submit" className={styles.pickerSave} disabled={!noteDraft.trim() || saving}>
                    Notitie bewaren
                  </button>
                </form>
                {addError && <p role="alert">{addError}</p>}
              </div>
            </div>
            <button className={styles.sheetCancel} onClick={() => setAddSheetOpen(false)}>
              Annuleren
            </button>
          </div>
        </div>
      )}
      {renamingLink && (
        <div className={styles.sheetBackdrop} onClick={() => setRenamingLink(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${styles.sheetGroup} ${styles.sheetScroll}`}>
              <div className={styles.sheetHeader}>
                <p id="rename-title" className={styles.sheetTitle}>
                  Naam wijzigen
                </p>
              </div>
              <div className={styles.pickerBody}>
                <form
                  className={styles.pickerForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveName();
                  }}
                >
                  <input
                    className={styles.pickerInput}
                    aria-label="Naam"
                    enterKeyHint="done"
                    maxLength={200}
                    autoFocus
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                  />
                  <button type="submit" className={styles.pickerSave} disabled={!nameDraft.trim() || savingName}>
                    Bewaar
                  </button>
                </form>
              </div>
            </div>
            <button className={styles.sheetCancel} onClick={() => setRenamingLink(null)}>
              Annuleren
            </button>
          </div>
        </div>
      )}
      {editingNote && (
        <div className={styles.sheetBackdrop} onClick={() => setEditingNote(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-edit-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`${styles.sheetGroup} ${styles.sheetScroll}`}>
              <div className={styles.sheetHeader}>
                <p id="note-edit-title" className={styles.sheetTitle}>
                  Bewerken
                </p>
              </div>
              <div className={styles.pickerBody}>
                <form
                  className={styles.noteForm}
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveNoteEdit();
                  }}
                >
                  <input
                    className={styles.pickerInput}
                    aria-label="Naam"
                    placeholder="Naam"
                    enterKeyHint="next"
                    maxLength={200}
                    value={nameEditDraft}
                    onChange={(event) => setNameEditDraft(event.target.value)}
                  />
                  <textarea
                    className={styles.noteInput}
                    aria-label="Notitie"
                    placeholder={editingNote.kind === 'image' ? 'Notitie (niet verplicht)' : 'Notitie'}
                    rows={8}
                    maxLength={2000}
                    value={noteEditDraft}
                    onChange={(event) => setNoteEditDraft(event.target.value)}
                  />
                  <input
                    ref={editImageInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    aria-label="Afbeelding kiezen voor deze notitie"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) changeEditedImage(await prepareImage(file).then((blob) => (blob instanceof File ? blob : new File([blob], 'afbeelding.jpg', { type: blob.type }))));
                    }}
                  />
                  {editingNote.kind !== 'link' && (
                    <div className={styles.noteImageRow}>
                      {editingNote.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={editingNote.imageUrl} alt="" className={styles.noteImagePreview} />
                      )}
                      <button type="button" className={styles.noteImageButton} disabled={imageBusy} onClick={() => editImageInputRef.current?.click()}>
                        {editingNote.imageUrl ? 'Afbeelding vervangen' : 'Afbeelding toevoegen'}
                      </button>
                      {editingNote.kind === 'note' && editingNote.imageUrl && (
                        <button type="button" className={styles.noteImageButton} disabled={imageBusy} onClick={() => changeEditedImage(null)}>
                          Afbeelding verwijderen
                        </button>
                      )}
                    </div>
                  )}
                  {imageError && <p role="alert">{imageError}</p>}
                  <button
                    type="submit"
                    className={styles.pickerSave}
                    disabled={savingNoteEdit || (editingNote.kind === 'note' && !noteEditDraft.trim())}
                  >
                    Bewaar
                  </button>
                </form>
              </div>
            </div>
            <button className={styles.sheetCancel} onClick={() => setEditingNote(null)}>
              Annuleren
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
