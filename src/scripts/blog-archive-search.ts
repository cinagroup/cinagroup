type ArchiveEntry = { title: string; excerpt: string; url: string; date: string; displayDate: string };
export {};

function initializeArchiveSearch() {
  const root = document.querySelector<HTMLElement>('[data-archive-search]');
  const section = root?.closest<HTMLElement>('[data-blog-collection="index"]');
  const form = root?.querySelector<HTMLFormElement>('form');
  const query = root?.querySelector<HTMLInputElement>('#archive-query');
  const month = root?.querySelector<HTMLInputElement>('#archive-month');
  const results = root?.querySelector<HTMLElement>('.archive-search-results');
  const status = root?.querySelector<HTMLElement>('.archive-search-status');
  const list = root?.querySelector<HTMLOListElement>('[data-archive-results]');
  const pages = root?.querySelector<HTMLElement>('.archive-search-pages');
  const previous = root?.querySelector<HTMLButtonElement>('[data-archive-previous]');
  const next = root?.querySelector<HTMLButtonElement>('[data-archive-next]');
  const pageLabel = root?.querySelector<HTMLElement>('[data-archive-page]');
  const originalList = section?.querySelector<HTMLElement>(':scope > ul.cg-blog-list');
  const originalPagination = section?.querySelector<HTMLElement>('[data-archive-pagination]');

  if (
    root &&
    !root.dataset.archiveReady &&
    form &&
    query &&
    month &&
    results &&
    status &&
    list &&
    pages &&
    previous &&
    next &&
    pageLabel &&
    originalList
  ) {
    root.dataset.archiveReady = 'true';
    const controls = {
      root,
      form,
      query,
      month,
      results,
      status,
      list,
      pages,
      previous,
      next,
      pageLabel,
      originalList,
    };
    const perPage = 10;
    let index: Promise<ArchiveEntry[]> | undefined;
    let matches: ArchiveEntry[] = [];
    let currentPage = 1;
    let request = 0;
    let activeQuery = '';
    let activeMonth = '';

    const loadIndex = () => {
      if (!index) {
        index = fetch('/blog-archive-index.json')
          .then((response) => {
            if (!response.ok) throw new Error('Archive index unavailable');
            return response.json() as Promise<ArchiveEntry[]>;
          })
          .catch((error: unknown) => {
            index = undefined;
            throw error;
          });
      }
      return index;
    };

    function syncUrl() {
      const url = new URL(window.location.href);
      if (activeQuery) url.searchParams.set('q', activeQuery);
      else url.searchParams.delete('q');
      if (activeMonth) url.searchParams.set('month', activeMonth);
      else url.searchParams.delete('month');
      if (currentPage > 1) url.searchParams.set('archivePage', String(currentPage));
      else url.searchParams.delete('archivePage');
      history.replaceState(history.state, '', url);
    }

    function render() {
      const totalPages = Math.max(1, Math.ceil(matches.length / perPage));
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
        const copy = document.createElement('div');
        copy.className = 'cg-blog-item-copy';
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
        heading.appendChild(link);
        header.appendChild(meta);
        header.appendChild(heading);
        copy.appendChild(header);
        if (entry.excerpt) {
          const excerpt = document.createElement('p');
          excerpt.textContent = entry.excerpt;
          copy.appendChild(excerpt);
        }
        article.appendChild(copy);
        item.appendChild(article);
        controls.list.appendChild(item);
      }
      controls.status.textContent = matches.length
        ? `${matches.length} ${matches.length === 1 ? 'briefing' : 'briefings'} found in the unverified archive. Page ${currentPage} of ${totalPages}.`
        : 'No briefings found. Try another keyword or month.';
      controls.pages.hidden = totalPages <= 1;
      controls.pageLabel.textContent = `Page ${currentPage} of ${totalPages}`;
      controls.previous.disabled = currentPage <= 1;
      controls.next.disabled = currentPage >= totalPages;
      syncUrl();
    }

    async function search(page = 1) {
      const sequence = ++request;
      const enteredQuery = controls.query.value.trim();
      const q = enteredQuery.toLocaleLowerCase();
      const selectedMonth = controls.month.value;
      currentPage = page;
      if (!q && !selectedMonth) {
        activeQuery = '';
        activeMonth = '';
        controls.results.hidden = true;
        controls.originalList.hidden = false;
        if (originalPagination) originalPagination.hidden = false;
        syncUrl();
        return;
      }
      controls.results.hidden = false;
      controls.status.textContent = 'Searching the archive…';
      controls.list.replaceChildren();
      controls.pages.hidden = true;
      try {
        const entries = await loadIndex();
        if (sequence !== request || !controls.root.isConnected) return;
        matches = entries.filter(
          (entry) =>
            (!selectedMonth || entry.date.startsWith(selectedMonth)) &&
            (!q || `${entry.title} ${entry.excerpt}`.toLocaleLowerCase().includes(q))
        );
        activeQuery = enteredQuery;
        activeMonth = selectedMonth;
        controls.originalList.hidden = true;
        if (originalPagination) originalPagination.hidden = true;
        render();
      } catch {
        if (sequence !== request || !controls.root.isConnected) return;
        controls.status.textContent = 'Search is temporarily unavailable. You can still browse the archive below.';
        controls.originalList.hidden = false;
        if (originalPagination) originalPagination.hidden = false;
      }
    }

    controls.form.addEventListener('submit', (event) => {
      event.preventDefault();
      void search();
    });
    controls.form.addEventListener('reset', (event) => {
      event.preventDefault();
      controls.query.value = '';
      controls.month.value = '';
      void search();
    });
    controls.previous.addEventListener('click', () => {
      currentPage--;
      render();
      controls.status.focus({ preventScroll: true });
      controls.status.scrollIntoView({ block: 'start' });
    });
    controls.next.addEventListener('click', () => {
      currentPage++;
      render();
      controls.status.focus({ preventScroll: true });
      controls.status.scrollIntoView({ block: 'start' });
    });
    const params = new URLSearchParams(window.location.search);
    controls.query.value = params.get('q') ?? '';
    controls.month.value = params.get('month') ?? '';
    controls.form.hidden = false;
    if (controls.query.value || controls.month.value) {
      const requestedPage = Number(params.get('archivePage'));
      void search(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
    }
  }
}

document.addEventListener('astro:page-load', initializeArchiveSearch);
initializeArchiveSearch();
