import { createArchiveVisit, resolveArchiveVisit } from '~/utils/blog-archive-return';

const STORAGE_KEY = 'cinagroup:blog-archive-return:v1';

/** Called only when a reader follows a specific result from the English archive. */
export function rememberArchiveVisit(postUrl: string | URL, archiveUrl: string | URL): void {
  const visit = createArchiveVisit(postUrl, archiveUrl, window.location.origin);
  if (!visit) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(visit));
  } catch {
    // Browsing and the ordinary blog link remain available when storage is blocked.
  }
}

function initializeArchiveReturn(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('a[data-archive-return]');
  if (links.length === 0) return;
  let href: string | undefined;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && stored.length <= 8192) {
      href = resolveArchiveVisit(JSON.parse(stored), window.location.href, window.location.origin);
    }
  } catch {
    // Malformed or unavailable storage must not replace the working default link.
  }
  for (const link of links) {
    link.dataset.archiveDefaultHref ??= link.getAttribute('href') ?? '/blog/';
    link.dataset.archiveDefaultLabel ??= link.textContent ?? 'Back to blog';
    link.href = href ?? link.dataset.archiveDefaultHref;
    link.textContent = href ? 'Back to search results' : link.dataset.archiveDefaultLabel;
  }
}

document.addEventListener('astro:page-load', initializeArchiveReturn);
initializeArchiveReturn();
