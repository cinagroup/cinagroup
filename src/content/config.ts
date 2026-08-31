import { z, defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  POST_AUTHOR_TYPES,
  POST_LANGUAGES,
  POST_ORIGINS,
  POST_STATUSES,
  POST_VERIFICATION_STATUSES,
} from '../utils/blog-content.js';

const metadataDefinition = () =>
  z
    .object({
      title: z.string().optional(),
      ignoreTitleTemplate: z.boolean().optional(),

      canonical: z.string().url().optional(),

      robots: z
        .object({
          index: z.boolean().optional(),
          follow: z.boolean().optional(),
        })
        .optional(),

      description: z.string().optional(),

      openGraph: z
        .object({
          url: z.string().optional(),
          siteName: z.string().optional(),
          images: z
            .array(
              z.object({
                url: z.string(),
                width: z.number().optional(),
                height: z.number().optional(),
              })
            )
            .optional(),
          locale: z.string().optional(),
          type: z.string().optional(),
        })
        .optional(),

      twitter: z
        .object({
          handle: z.string().optional(),
          site: z.string().optional(),
          cardType: z.string().optional(),
        })
        .optional(),
    })
    .optional();

const postCollection = defineCollection({
  loader: glob({
    pattern: ['content/blog/*.{md,mdx}', 'data/post/*.{md,mdx}'],
    base: 'src',
    generateId: ({ entry }) =>
      entry
        .split('/')
        .pop()
        ?.replace(/\.(md|mdx)$/i, '') || entry,
  }),
  schema: z.object({
    status: z.enum(POST_STATUSES).optional(),
    origin: z.enum(POST_ORIGINS).optional(),
    sources: z
      .array(
        z.union([
          z.string().trim().min(1),
          z.object({
            title: z.string().trim().min(1),
            url: z.string().url(),
            kind: z.enum(['primary', 'secondary', 'press_release', 'dataset', 'other']).optional(),
            publisher: z.string().trim().min(1).optional(),
            publishedAt: z.date().optional(),
            accessedAt: z.date().optional(),
          }),
        ])
      )
      .optional(),
    verification: z
      .object({
        status: z.enum(POST_VERIFICATION_STATUSES),
        verifiedBy: z.string().trim().min(1).optional(),
        verifiedAt: z.date().optional(),
        note: z.string().trim().min(1).optional(),
      })
      .optional(),
    review: z
      .object({
        status: z.enum(['pending', 'changes_requested', 'approved']).optional(),
        reviewedBy: z.string().trim().min(1).optional(),
        reviewedAt: z.date().optional(),
        note: z.string().trim().min(1).optional(),
      })
      .optional(),
    correction: z
      .object({
        note: z.string().trim().min(1),
        correctedAt: z.date().optional(),
      })
      .optional(),
    reviewedBy: z.string().trim().min(1).optional(),
    reviewedAt: z.date().optional(),
    correctionNote: z.string().trim().min(1).optional(),
    aliases: z.array(z.string().trim().min(1)).optional(),

    publishDate: z.date(),
    updateDate: z.date().optional(),
    updated: z.date().optional(),
    draft: z.boolean().optional(),
    archive: z.boolean().optional(),
    archived: z.boolean().optional(),
    published: z.boolean().optional(),

    title: z.string(),
    excerpt: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),

    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
    author: z.string().trim().min(1).default('CinaGroup Editorial'),
    authorType: z.enum(POST_AUTHOR_TYPES).optional(),
    authorUrl: z.string().url().optional(),
    language: z.enum(POST_LANGUAGES).optional(),

    metadata: metadataDefinition(),
  }),
});

export const collections = {
  post: postCollection,
};
