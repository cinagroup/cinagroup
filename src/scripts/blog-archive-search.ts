import { navigate } from 'astro:transitions/client';
import type { BlogArchiveIndexEntry } from '~/utils/blog-archive-index';
import { isArchiveIndex, searchArchive, type ArchiveSort } from '~/utils/blog-archive-search';
import { rememberArchiveVisit } from './blog-archive-return';

// Astro keeps this module across page swaps, so history navigation reuses the download.
let index: Promise<BlogArchiveIndexEntry[]> | undefined;
function loadIndex() {
  if (!index) {
    index = fetch('/blog-archive-index.json', { signal: AbortSignal.timeout(12000) })
      .then(async (response) => {
        if (!response.ok) throw new Error('Archive index unavailable');
        const entries: unknown = await response.json();
        if (!isArchiveIndex(entries)) throw new Error('Invalid archive index');
        return entries;
      })
      .catch((error: unknown) => {
        index = undefined;
        throw error;
      });
  }
  return index;
}

function initializeArchiveSearch() {
  const root = document.querySelector<HTMLElement>('[data-archive-search]');
  const section = root?.closest<HTMLElement>('[data-blog-collection="index"]');
  const form = root?.querySelector<HTMLFormElement>('form');
  const query = root?.querySelector<HTMLInputElement>('#archive-query');
  const month = root?.querySelector<HTMLElement & { value: string }>('#archive-month');
  const sort = root?.querySelector<HTMLElement & { value: string }>('#archive-sort');
  const results = root?.querySelector<HTMLElement>('.archive-search-results');
  const status = root?.querySelector<HTMLElement>('.archive-search-status');
  const list = root?.querySelector<HTMLOListElement>('[data-archive-results]');
  const pages = root?.querySelector<HTMLElement>('.archive-search-pages');
  const previous = root?.querySelector<HTMLButtonElement>('[data-archive-previous]');
  const next = root?.querySelector<HTMLButtonElement>('[data-archive-next]');
  const pageLabel = root?.querySelector<HTMLElement>('[data-archive-page]');
  const copy = root?.querySelector<HTMLButtonElement>('[data-archive-copy]');
  const copyStatus = root?.querySelector<HTMLElement>('[data-archive-copy-status]');
  const retry = root?.querySelector<HTMLButtonElement>('[data-archive-retry]');
  const originalList = section?.querySelector<HTMLElement>(':scope > ul.cg-blog-list');
  const originalPagination = section?.querySelector<HTMLElement>('[data-archive-pagination]');

  if (
    !root ||
    root.dataset.archiveReady ||
    !form ||
    !query ||
    !month ||
    !sort ||
    !results ||
    !status ||
    !list ||
    !pages ||
    !previous ||
    !next ||
    !pageLabel ||
    !copy ||
    !copyStatus ||
    !retry ||
    !originalList
  )
    return;

  root.dataset.archiveReady = 'true';
  const controls = {
    root,
    form,
    query,
    month,
    sort,
    results,
    status,
    list,
    pages,
    previous,
    next,
    pageLabel,
    copy,
    copyStatus,
    retry,
    originalList,
  };
  const perPage = 10;
  let request = 0;
  let currentPage = 1;
  let totalPages = 1;
  let activeFilter: { q: string; month: string; sort: ArchiveSort } | undefined;
  let activeResultsUrl = window.location.href;

  function resultsUrl(q: string, selectedMonth: string, order: ArchiveSort, page: number) {
    const url = new URL(window.location.href);
    for (const key of ['q', 'month', 'sort', 'archivePage']) url.searchParams.delete(key);
    if (q) url.searchParams.set('q', q);
    if (selectedMonth) url.searchParams.set('month', selectedMonth);
    if (order === 'oldest') url.searchParams.set('sort', order);
    if (page > 1) url.searchParams.set('archivePage', String(page));
    url.hash = 'archive-search-heading';
    return url;
  }

  async function updateHistory(q: string, selectedMonth: string, order: ArchiveSort, page: number) {
    const url = resultsUrl(q, selectedMonth, order, page);
    if (url.href !== window.location.href) {
      // Let ClientRouter own its history index, DOM swap and back/forward restoration.
      await navigate(url.pathname + url.search + url.hash, { history: 'push' });
    } else {
      controls.status.focus({ preventScroll: true });
    }
  }

  function render(matches: BlogArchiveIndexEntry[]) {
    totalPages = Math.max(1, Math.ceil(matches.length / perPage));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);
    controls.list.replaceChildren();
    const start = (currentPage - 1) * perPage;
    for (const entry of matches.slice(start, start + perPage)) {
      const url = new URL(entry.url, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith('/blog/')) continue;
      const item = document.createElement('li');
      const article = document.createElement('article');
      article.className = 'cg-blog-item';
      article.dataset.contentKind = 'historical-archive-summary';
      article.dataset.contentStatus = 'archived_unverified';
      const content = document.createElement('div');
      content.className = 'cg-blog-item-copy';
      const header = document.createElement('header');
      const meta = document.createElement('div');
      meta.className = 'cg-blog-meta';
      const kind = document.createElement('span');
      kind.className = 'cg-blog-kind';
      kind.textContent = 'Automated · unverified';
      const time = document.createElement('time');
      time.dateTime = entry.date;
      time.textContent = entry.displayDate;
      meta.appendChild(kind);
      meta.appendChild(document.createTextNode(' · '));
      meta.appendChild(time);
      const heading = document.createElement('h2');
      const link = document.createElement('a');
      link.className = 'cg-blog-title-link';
      link.href = url.pathname;
      link.textContent = entry.title;
      const remember = () => rememberArchiveVisit(link.href, activeResultsUrl);
      link.addEventListener('click', remember);
      link.addEventListener('auxclick', remember);
      heading.appendChild(link);
      header.appendChild(meta);
      header.appendChild(heading);
      content.appendChild(header);
      if (entry.excerpt) {
        const excerpt = document.createElement('p');
        excerpt.textContent = entry.excerpt;
        content.appendChild(excerpt);
      }
      article.appendChild(content);
      item.appendChild(article);
      controls.list.appendChild(item);
    }
    controls.status.textContent = matches.length
      ? `${matches.length} ${matches.length === 1 ? 'briefing' : 'briefings'} found in the unverified archive. Showing ${start + 1}–${Math.min(start + perPage, matches.length)}. Page ${currentPage} of ${totalPages}.`
      : 'No briefings found. Try fewer words or choose another month.';
    controls.pages.hidden = totalPages <= 1;
    controls.pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
    controls.previous.disabled = currentPage <= 1;
    controls.next.disabled = currentPage >= totalPages;
    controls.copy.hidden = false;
  }

  async function search(page = 1, pushHistory = false, useActiveFilter = false) {
    const sequence = ++request;
    const q = useActiveFilter && activeFilter ? activeFilter.q : controls.query.value.trim().slice(0, 300);
    const selectedMonth = useActiveFilter && activeFilter ? activeFilter.month : controls.month.value;
    const order: ArchiveSort =
      useActiveFilter && activeFilter ? activeFilter.sort : controls.sort.value === 'oldest' ? 'oldest' : 'newest';
    controls.query.value = q;
    controls.month.value = selectedMonth;
    controls.sort.value = order;
    currentPage = page;
    controls.copyStatus.textContent = '';
    controls.copy.hidden = true;
    controls.retry.hidden = true;
    controls.list.setAttribute('aria-busy', 'false');
    if (!q && !selectedMonth && order === 'newest') {
      controls.results.hidden = true;
      controls.originalList.hidden = false;
      if (originalPagination) originalPagination.hidden = false;
      if (pushHistory) await updateHistory('', '', 'newest', 1);
      return;
    }
    controls.results.hidden = false;
    controls.status.textContent = 'Searching the archive…';
    controls.list.replaceChildren();
    controls.list.setAttribute('aria-busy', 'true');
    controls.pages.hidden = true;
    try {
      const entries = await loadIndex();
      if (sequence !== request || !controls.root.isConnected) return;
      const matches = searchArchive(entries, q, selectedMonth, order);
      controls.originalList.hidden = true;
      if (originalPagination) originalPagination.hidden = true;
      render(matches);
      activeFilter = { q, month: selectedMonth, sort: order };
      activeResultsUrl = resultsUrl(q, selectedMonth, order, currentPage).href;
      controls.list.setAttribute('aria-busy', 'false');
      if (pushHistory) await updateHistory(q, selectedMonth, order, currentPage);
    } catch {
      if (sequence !== request || !controls.root.isConnected) return;
      controls.list.setAttribute('aria-busy', 'false');
      controls.status.textContent = 'Search is temporarily unavailable. Try again or browse the archive below.';
      controls.retry.hidden = false;
      controls.originalList.hidden = false;
      if (originalPagination) originalPagination.hidden = false;
    }
  }

  controls.form.addEventListener('submit', (event) => {
    event.preventDefault();
    void search(1, true);
  });
  controls.form.addEventListener('reset', (event) => {
    event.preventDefault();
    controls.query.value = '';
    controls.month.value = '';
    controls.sort.value = 'newest';
    void search(1, true);
  });
  controls.query.addEventListener('search', () => {
    if (!controls.query.value) void search(1, true);
  });
  controls.previous.addEventListener('click', () => {
    if (currentPage > 1) void search(currentPage - 1, true, true);
  });
  controls.next.addEventListener('click', () => {
    if (currentPage < totalPages) void search(currentPage + 1, true, true);
  });
  controls.retry.addEventListener('click', () => {
    void search(currentPage, true);
  });
  controls.copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(activeResultsUrl);
      controls.copyStatus.textContent = 'Results link copied.';
    } catch {
      controls.copyStatus.textContent = 'Copy the URL from your browser’s address bar to share these results.';
    }
  });

  const params = new URLSearchParams(window.location.search);
  controls.query.value = (params.get('q') ?? '').slice(0, 300);
  controls.month.value = params.get('month') ?? '';
  controls.sort.value = params.get('sort') === 'oldest' ? 'oldest' : 'newest';
  const requestedPage = Number(params.get('archivePage'));
  controls.form.hidden = false;
  const help = root.querySelector<HTMLElement>('#archive-search-help');
  if (help) help.hidden = false;
  void search(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
}

document.addEventListener('astro:page-load', initializeArchiveSearch);
initializeArchiveSearch();
