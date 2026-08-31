import type { ImageMetadata } from 'astro';

import type { Post } from '~/types';

type ArticleSchemaOptions = {
  post: Post;
  canonical: string;
  image?: ImageMetadata | string;
};

const absoluteImage = (image: ImageMetadata | string, canonical: string) => {
  const source = typeof image === 'string' ? image : image.src;
  const url = new URL(source, canonical).toString();

  return {
    '@type': 'ImageObject',
    url,
    ...(typeof image === 'object' && image.width ? { width: image.width } : {}),
    ...(typeof image === 'object' && image.height ? { height: image.height } : {}),
  };
};

const articleId = (canonical: string) => {
  const url = new URL(canonical);
  url.hash = 'article';
  return url.toString();
};

export const getArticleStructuredData = ({ post, canonical, image }: ArticleSchemaOptions) => ({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  '@id': articleId(canonical),
  identifier: post.id,
  headline: post.title,
  description: post.excerpt || post.title,
  datePublished: post.publishDate.toISOString(),
  dateModified: (post.updateDate || post.publishDate).toISOString(),
  author: {
    '@type': post.authorType,
    name: post.author || 'CinaGroup Editorial',
    ...(post.authorUrl ? { url: post.authorUrl } : {}),
  },
  publisher: {
    '@type': 'Organization',
    '@id': 'https://cinagroup.com/#organization',
    name: 'CinaGroup',
    url: 'https://cinagroup.com/',
    logo: {
      '@type': 'ImageObject',
      url: 'https://cinagroup.com/logo.png',
    },
  },
  mainEntityOfPage: {
    '@type': 'WebPage',
    '@id': canonical,
  },
  url: canonical,
  inLanguage: post.language,
  ...(post.category ? { articleSection: post.category.title } : {}),
  ...(post.tags?.length ? { keywords: post.tags.map((tag) => tag.title) } : {}),
  ...(image ? { image: absoluteImage(image, canonical) } : {}),
});
