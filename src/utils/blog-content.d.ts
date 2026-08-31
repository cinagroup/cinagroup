export type PostLanguage = 'en' | 'zh-CN' | 'ja' | 'ko' | 'ru' | 'es' | 'pt-BR' | 'fr';

export const POST_LANGUAGES: readonly ['en', 'zh-CN', 'ja', 'ko', 'ru', 'es', 'pt-BR', 'fr'];
export type PostAuthorType = 'Organization' | 'Person';
export const POST_AUTHOR_TYPES: readonly ['Organization', 'Person'];
export type PostStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'archived_unverified'
  | 'withdrawn';
export const POST_STATUSES: readonly [
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'archived_unverified',
  'withdrawn',
];
export type PostOrigin = 'editorial' | 'automated_news_workflow' | 'imported_legacy' | 'partner' | 'press_release';
export const POST_ORIGINS: readonly [
  'editorial',
  'automated_news_workflow',
  'imported_legacy',
  'partner',
  'press_release',
];
export type PostVerificationStatus = 'unverified' | 'source_reviewed' | 'fact_checked' | 'primary_source_confirmed';
export const POST_VERIFICATION_STATUSES: readonly [
  'unverified',
  'source_reviewed',
  'fact_checked',
  'primary_source_confirmed',
];

export function inferPostLanguage(value?: string): PostLanguage;
export function isAutomatedBriefing(slug?: string): boolean;
export function resolvePostStatus(data?: Record<string, unknown>, automated?: boolean): PostStatus;
export function isPublicPostStatus(status: unknown): status is 'published';
export function isRoutablePostStatus(status: unknown): status is 'published' | 'archived_unverified';
export function isBlogFeedPost(status: unknown, language: unknown): boolean;
export function normalizePostAuthor(rawAuthor: unknown, automated?: boolean): string;
export function normalizePostAuthorInfo(
  rawAuthor: unknown,
  rawAuthorType?: unknown,
  automated?: boolean
): { name: string; type: PostAuthorType; url?: string };
