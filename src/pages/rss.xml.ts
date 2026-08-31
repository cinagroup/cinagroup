import { getRssString } from '@astrojs/rss';

import { SITE, APP_BLOG } from 'astrowind:config';
import { fetchPosts } from '~/utils/blog';
import { getPermalink } from '~/utils/permalinks';

export const GET = async () => {
  if (!APP_BLOG.isEnabled) {
    return new Response(null, {
      status: 404,
      statusText: 'Not found',
    });
  }

  const posts = await fetchPosts();

  const rss = await getRssString({
    title: `${SITE.name} AI News Briefing Archive`,
    description:
      'English AI news briefings from a retired automated workflow. Items are unverified and should be checked against current primary sources.',
    site: import.meta.env.SITE,

    items: posts.map((post) => ({
      link: getPermalink(post.permalink, 'post'),
      title: post.status === 'archived_unverified' ? `[Unverified archive] ${post.title}` : post.title,
      description:
        post.status === 'archived_unverified'
          ? `Automated, unverified archive. Confirm claims with current primary sources. ${post.excerpt || ''}`
          : post.excerpt,
      pubDate: post.publishDate,
    })),

    trailingSlash: SITE.trailingSlash,
  });

  return new Response(rss, {
    headers: {
      'Content-Type': 'application/xml',
    },
  });
};
