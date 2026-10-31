import { getCollection } from 'astro:content';

import { fetchPostsByLocale } from './blog';
import { buildBlogArchiveIndex, explicitlyArchivedIds } from './blog-archive-index';
import { getPermalink } from './permalinks';
import { getFormattedDate } from './utils';

/** Shared by the static search controls and the public index, with the same publication gate. */
export async function fetchBlogArchiveIndex() {
  const [posts, sourceEntries] = await Promise.all([fetchPostsByLocale('en'), getCollection('post')]);
  return buildBlogArchiveIndex(
    posts,
    explicitlyArchivedIds(sourceEntries),
    (permalink) => getPermalink(permalink, 'post'),
    getFormattedDate
  );
}
