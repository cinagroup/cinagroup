import type { BlogArchiveIndexEntry } from './blog-archive-index';

export type ArchiveSort = 'newest' | 'oldest';

/** Reject invalid successful responses before they can become a cached index. */
export function isArchiveIndex(value: unknown): value is BlogArchiveIndexEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        entry &&
        typeof entry === 'object' &&
        ['title', 'excerpt', 'url', 'date', 'displayDate'].every((key) => typeof entry[key] === 'string') &&
        /^\/blog\/ai-news-briefing-[a-z0-9-]+\/$/.test(entry.url) &&
        /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(entry.date)
    )
  );
}

export function archiveMonths(entries: readonly Pick<BlogArchiveIndexEntry, 'date'>[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return Array.from(counts, ([value, count]) => ({ value, count })).sort((a, b) => b.value.localeCompare(a.value));
}

/** Input is already ordered by publication time, including briefings on the same day. */
export function searchArchive(
  entries: readonly BlogArchiveIndexEntry[],
  query: string,
  month: string,
  sort: ArchiveSort
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.filter((entry) => {
    const text = `${entry.title} ${entry.excerpt}`.toLocaleLowerCase();
    return (!month || entry.date.startsWith(`${month}-`)) && terms.every((term) => text.includes(term));
  });
  return sort === 'oldest' ? matches.reverse() : matches;
}
