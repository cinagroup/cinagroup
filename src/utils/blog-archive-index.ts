import type { Post } from '../types';
import { isAutomatedBriefing } from './blog-content.js';

export interface BlogArchiveIndexEntry {
  title: string;
  excerpt: string;
  url: string;
  date: string;
  displayDate: string;
}

const archiveDateFormatter = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Singapore',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Match the calendar date shown by getFormattedDate, including at month boundaries. */
function archiveCalendarDate(date: Date): string {
  const parts = Object.fromEntries(archiveDateFormatter.formatToParts(date).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Check source flags before normalization, which can treat automated posts as archives. */
export function explicitlyArchivedIds(entries: readonly { id: string; data: { status?: string; draft?: boolean } }[]) {
  return new Set(
    entries.filter(({ data }) => data.status === 'archived_unverified' && data.draft !== true).map(({ id }) => id)
  );
}

/** Only the publicly visible English automated archive belongs in this index. */
export function buildBlogArchiveIndex(
  posts: readonly Post[],
  archivedIds: ReadonlySet<string>,
  postUrl: (permalink: string) => string,
  formatDate: (date: Date, language: string) => string
): BlogArchiveIndexEntry[] {
  return posts
    .filter(
      (post) =>
        post.language === 'en' &&
        post.status === 'archived_unverified' &&
        post.draft !== true &&
        archivedIds.has(post.id) &&
        isAutomatedBriefing(post.slug)
    )
    .map((post) => ({
      title: post.title,
      excerpt: post.excerpt ?? '',
      url: postUrl(post.permalink),
      date: archiveCalendarDate(post.publishDate),
      displayDate: formatDate(post.publishDate, post.language),
    }));
}
