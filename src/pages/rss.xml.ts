import { getRssString } from '@astrojs/rss';
import { env } from 'cloudflare:workers';
import { getEmDashCollection } from 'emdash';

import { SITE, APP_BLOG } from 'astrowind:config';
import { cmsPostsToRssItems, listDiscoverableCmsPosts } from '~/emdash/public-discovery';
import { fetchPosts } from '~/utils/blog';
import { getPermalink } from '~/utils/permalinks';

export const prerender = false;

export const GET = async ({ request }: { request: Request }) => {
  if (!APP_BLOG.isEnabled) {
    return new Response(null, {
      status: 404,
      statusText: 'Not found',
    });
  }

  const posts = await fetchPosts();
  let cmsItems: ReturnType<typeof cmsPostsToRssItems> = [];
  try {
    const cmsPosts = await listDiscoverableCmsPosts(
      'en',
      request.url,
      (env as CloudflareEnv & { ASSETS: Fetcher }).ASSETS,
      (cursor) =>
        getEmDashCollection('posts', {
          locale: 'en',
          status: 'published',
          orderBy: { published_at: 'desc' },
          limit: 100,
          cursor,
        }),
      100
    );
    cmsItems = cmsPostsToRssItems(cmsPosts);
  } catch (error) {
    console.error('Unable to add published EmDash posts to the English RSS feed', error);
  }

  const rss = await getRssString({
    title: cmsItems.length > 0 ? `${SITE.name} Blog` : `${SITE.name} AI News Briefing Archive`,
    description:
      cmsItems.length > 0
        ? 'Published CinaGroup editorial posts and English AI news briefings from a retired automated workflow. Archived briefings are unverified and should be checked against current primary sources.'
        : 'English AI news briefings from a retired automated workflow. Items are unverified and should be checked against current primary sources.',
    site: import.meta.env.SITE,

    items: [
      ...cmsItems,
      ...posts.map((post) => ({
        link: getPermalink(post.permalink, 'post'),
        title: post.status === 'archived_unverified' ? `[Unverified archive] ${post.title}` : post.title,
        description:
          post.status === 'archived_unverified'
            ? `Automated, unverified archive. Confirm claims with current primary sources. ${post.excerpt || ''}`
            : post.excerpt,
        pubDate: post.publishDate,
      })),
    ],

    trailingSlash: SITE.trailingSlash,
  });

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
};
