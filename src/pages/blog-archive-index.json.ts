import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

import { fetchPostsByLocale } from '~/utils/blog';
import { buildBlogArchiveIndex, explicitlyArchivedIds } from '~/utils/blog-archive-index';
import { getPermalink } from '~/utils/permalinks';
import { getFormattedDate } from '~/utils/utils';

export const prerender = true;

export const GET: APIRoute = async () => {
  const [posts, sourceEntries] = await Promise.all([fetchPostsByLocale('en'), getCollection('post')]);
  const entries = buildBlogArchiveIndex(
    posts,
    explicitlyArchivedIds(sourceEntries),
    (permalink) => getPermalink(permalink, 'post'),
    getFormattedDate
  );

  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
