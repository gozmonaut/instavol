'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { LinkRow } from '@/lib/schema';
import { groupByDate } from '@/lib/dateGroups';
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

function formatDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

// macOS lists only apps that accept every shared item, and many accept a url but not plain text.
// iPads also report "MacIntel", but have touch points.
function isMacDesktop(): boolean {
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints === 0;
}

// The URL goes inside the text: some apps keep only the text or only the url when both are passed.
function buildShareText(link: LinkRow): string {
  const meta = [formatDate(link.createdAt), link.category].filter(Boolean).join(' | ');
  const summary = link.status === 'done' && link.summary ? link.summary : null;
  return [link.title, meta, summary, link.url].filter(Boolean).join('\n');
}

const ACTION_ICON_PATHS = {
  share: ['M12 15V4', 'M8 8l4-4 4 4', 'M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1'],
  research: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z'],
  retry: ['M20 12a8 8 0 1 1-2.34-5.66', 'M20 4v4h-4'],
  delete: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12', 'M9 7V4h6v3'],
  done: ['M5 12.5l4.5 4.5L19 7.5'],
  category: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  password: ['M12 15a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', 'M11 12l9-9', 'M17 6l3 3'],
  logout: ['M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3', 'M10 17l-5-5 5-5', 'M5 12h11'],
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
  // Where the "..." dropdown hangs: just under (or, near the bottom, above) the button that opened it.
  const [menuPos, setMenuPos] = useState<{ right: number; top?: number; bottom?: number } | null>(null);
  const itemMenuRef = useRef<HTMLDivElement>(null);
  const closeItemMenu = useCallback(() => setMenuLink(null), []);
  const [tagsLink, setTagsLink] = useState<LinkRow | null>(null);
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
  const [categoryMenuLink, setCategoryMenuLink] = useState<LinkRow | null>(null);
  const [editingLink, setEditingLink] = useState<LinkRow | null>(null);
  const [categoryDraft, setCategoryDraft] = useState('');
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [savingCategory, setSavingCategory] = useState(false);
  const [promptCopiedId, setPromptCopiedId] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
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
  const readerOpen = readerLink !== null;

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

  // Date headings stick right below the search header, whose height can change (e.g. the Enter hint).
  useEffect(() => {
    const page = pageRef.current;
    const header = headerRef.current;
    if (!page || !header || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      page.style.setProperty('--header-height', `${header.offsetHeight}px`);
    });
    observer.observe(header);
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

  // Opens the native share sheet, or copies the text where sharing isn't supported.
  async function shareOrCopy(
    text: string,
    url: string,
    id: string,
    setFeedbackId: (update: (current: string | null) => string | null) => void,
  ) {
    if (navigator.share) {
      try {
        // On iOS the url stays inside the text only; on a Mac it's also passed separately (see isMacDesktop).
        await navigator.share(isMacDesktop() ? { text, url } : { text });
      } catch {
        // User closed the share sheet; nothing to do.
      }
      return;
    }
    await navigator.clipboard.writeText(text);
    setFeedbackId(() => id);
    setTimeout(() => setFeedbackId((current) => (current === id ? null : current)), COPIED_FEEDBACK_MS);
  }

  function handleShare(link: LinkRow) {
    return shareOrCopy(buildShareText(link), link.url, link.id, setCopiedId);
  }

  function handleResearch(focus: ResearchFocus) {
    if (!researchLink) return;
    const link = researchLink;
    setResearchLink(null);
    return shareOrCopy(buildResearchPrompt(link, focus, formatDate(link.createdAt)), link.url, link.id, setPromptCopiedId);
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
    setCategoryMenuLink(null);
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

  function startEditingCategory(link: LinkRow) {
    setCategoryMenuLink(null);
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
      if (event.target instanceof Node && !settingsRef.current?.contains(event.target)) closeSettings();
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

  function openPasswordSheet() {
    setCurrentPassword('');
    setNewPassword('');
    setRepeatPassword('');
    setPasswordError(null);
    setPasswordChanged(false);
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

  // On a card, a "+" after the tags opens the tag editor.
  function tagList(link: LinkRow, withAdd = false) {
    if (!link.tags?.length) return null;
    return (
      <ul className={readerStyles.tags} aria-label="Tags">
        {link.tags.map((t) => (
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
    <main ref={pageRef} className={styles.page} data-compact={compact}>
      <div ref={topSentinel} className={styles.sentinel} aria-hidden="true" />
      <div ref={pullIndicatorRef} className={styles.pullIndicator} data-refreshing={refreshing} role="status" aria-label={refreshing ? 'Verversen' : undefined}>
        <span className={styles.spinner} aria-hidden="true" />
      </div>
      <div className={styles.brand}>
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
              <div className={styles.popover} role={passwordSheetOpen ? 'dialog' : 'menu'} aria-label="Instellingen">
                {!passwordSheetOpen ? (
                  <>
                    <button className={`${styles.popoverItem} ${styles.menuOption}`} role="menuitem" onClick={openPasswordSheet}>
                      <span>Wachtwoord wijzigen</span>
                      <ActionIcon name="password" />
                    </button>
                    <button className={`${styles.popoverItem} ${styles.menuOption} ${styles.menuDanger}`} role="menuitem" onClick={handleLogout}>
                      <span>Uitloggen</span>
                      <ActionIcon name="logout" />
                    </button>
                  </>
                ) : (
                  <div className={styles.popoverForm}>
                    <div className={styles.sheetHeader}>
                      <p className={styles.sheetTitle}>Wachtwoord wijzigen</p>
                      {passwordChanged && <p className={styles.sheetSubtitle}>Je wachtwoord is gewijzigd</p>}
                    </div>
                    {!passwordChanged && (
                      <form
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
                        <button type="submit" className={styles.pickerSave} disabled={savingPassword}>
                          Bewaar
                        </button>
                      </form>
                    )}
                    <div className={styles.dialogActions}>
                      <button type="button" className={styles.dialogButton} onClick={closeSettings}>
                        {passwordChanged ? 'Sluiten' : 'Annuleren'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <header ref={headerRef} className={styles.header}>
        <div className={styles.controls}>
          <input
            type="search"
            enterKeyHint="go"
            autoCapitalize="none"
            autoCorrect="off"
            aria-label="Zoek of plak een link"
            placeholder="Zoek of plak een link"
            className={styles.search}
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              const url = parseShareUrl(q);
              if (event.key === 'Enter' && url && !saving) handleSave(url);
            }}
          />
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

      {links.length === 0 ? (
        <div className={styles.empty}>
          {isFiltering ? (
            <p className={styles.emptyTitle}>Geen resultaten</p>
          ) : (
            <>
              <p className={styles.emptyTitle}>Nog niets bewaard</p>
              <p>Plak hierboven een link, of deel een pagina vanuit Safari met &ldquo;Bewaar in Instavol&rdquo;.</p>
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
                <li key={link.id} className={styles.card}>
                  <div className={styles.cardMain}>
                    <div className={styles.cardTop}>
                      {link.category && (
                        <button
                          className={styles.chip}
                          aria-label={`Categorie ${link.category}`}
                          aria-haspopup="dialog"
                          aria-pressed={category === link.category}
                          onClick={() => setCategoryMenuLink(link)}
                        >
                          {link.category}
                        </button>
                      )}
                      <span className={styles.date}>{formatDate(link.createdAt)}</span>
                      {moreButton(link, styles.moreButton)}
                    </div>
                    <a
                      href={link.url}
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
                      {link.title ?? link.url}
                      {!link.readingMinutes && (
                        <svg className={styles.externalIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 4h6v6" />
                          <path d="M20 4l-9 9" />
                          <path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
                        </svg>
                      )}
                    </a>
                    <div className={styles.meta}>
                      <span>{domainFromUrl(link.url)}</span>
                      {link.readingMinutes && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{link.readingMinutes} min. leestijd</span>
                        </>
                      )}
                      {link.notes.length > 0 && (
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
                    {link.imageUrl && (
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
                    {link.status === 'done' && link.summary && (
                      <p className={styles.summary}>{link.summary}</p>
                    )}
                    {link.status === 'pending' && (
                      <p className={styles.status}>
                        <span className={styles.spinner} aria-hidden="true" />
                        Wordt verwerkt...
                      </p>
                    )}
                    {link.status === 'failed' && (
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

      {categoryMenuLink && (
        <div className={styles.sheetBackdrop} onClick={() => setCategoryMenuLink(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="category-menu-title"
            className={styles.sheet}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sheetGroup}>
              <div className={styles.sheetHeader}>
                <p id="category-menu-title" className={styles.sheetTitle}>
                  {categoryMenuLink.category}
                </p>
              </div>
              <button className={styles.sheetOption} onClick={() => toggleCategoryFilter(categoryMenuLink)}>
                {category === categoryMenuLink.category ? 'Toon alle categorieën' : `Filter op ${categoryMenuLink.category}`}
              </button>
              <button className={styles.sheetOption} onClick={() => startEditingCategory(categoryMenuLink)}>
                Categorie wijzigen
              </button>
            </div>
            <button className={styles.sheetCancel} onClick={() => setCategoryMenuLink(null)}>
              Annuleren
            </button>
          </div>
        </div>
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
                <p className={styles.sheetSubtitle}>{editingLink.title ?? domainFromUrl(editingLink.url)}</p>
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
                <p className={styles.sheetSubtitle}>{researchLink.title ?? domainFromUrl(researchLink.url)}</p>
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

      {readerLink && (
        <Reader
          key={readerLink.id}
          link={readerLink}
          domain={domainFromUrl(readerLink.url)}
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
          aria-label={menuLink.title ?? domainFromUrl(menuLink.url)}
          className={`${styles.popover} ${styles.itemMenu}`}
          style={menuPos}
        >
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
              <p className={styles.dialogItem}>{deleteLink.title ?? domainFromUrl(deleteLink.url)}</p>
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
                <p className={styles.sheetSubtitle}>{tagsLink.title ?? domainFromUrl(tagsLink.url)}</p>
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
    </main>
  );
}
