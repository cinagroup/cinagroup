export const POST_LANGUAGES = ['en', 'zh-CN', 'ja', 'ko', 'ru', 'es', 'pt-BR', 'fr'];
export const POST_AUTHOR_TYPES = ['Organization', 'Person'];
export const POST_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'scheduled',
  'published',
  'archived_unverified',
  'withdrawn',
];
export const POST_ORIGINS = ['editorial', 'automated_news_workflow', 'imported_legacy', 'partner', 'press_release'];
export const POST_VERIFICATION_STATUSES = ['unverified', 'source_reviewed', 'fact_checked', 'primary_source_confirmed'];

const ORGANIZATION_AUTHORS = new Set([
  'CinaGroup Editorial',
  'CinaGroup Automation Desk',
  'CinaGroup Team',
  'CinaClaw Team',
  'CinaChain Team',
]);
const CINAGROUP_AUTHOR_URL = 'https://cinagroup.com/about/';

const countMatches = (value, pattern) => value.match(pattern)?.length ?? 0;

/**
 * Infer scripts that can be identified reliably. Latin-language posts default
 * to English and must declare `language` when they are written in another
 * Latin language.
 */
export const inferPostLanguage = (value = '') => {
  const text = String(value);
  const hiraganaAndKatakana = countMatches(text, /[\u3040-\u30ff]/gu);
  const hangul = countMatches(text, /[\uac00-\ud7af]/gu);
  const cyrillic = countMatches(text, /[\u0400-\u04ff]/gu);
  const han = countMatches(text, /[\u3400-\u9fff]/gu);
  const letters = Math.max(countMatches(text, /\p{L}/gu), 1);

  if (hiraganaAndKatakana >= Math.max(8, letters * 0.02)) return 'ja';
  if (hangul >= Math.max(12, letters * 0.08)) return 'ko';
  if (cyrillic >= Math.max(24, letters * 0.2)) return 'ru';
  if (han >= Math.max(24, letters * 0.12)) return 'zh-CN';

  return 'en';
};

export const isAutomatedBriefing = (slug = '') => String(slug).startsWith('ai-news-briefing-');

/**
 * Resolve legacy publication flags into the explicit governance model.
 *
 * Missing status is deliberately fail-closed. Existing editorial entries are
 * migrated to `published`; a newly added entry without a status stays out of
 * public indexes until an editor makes the publication decision explicit.
 * Automated briefing filenames are never allowed to become public merely by
 * changing frontmatter: they remain historical archives unless withdrawn.
 */
export const resolvePostStatus = (data = {}, automated = false) => {
  const explicitStatus = POST_STATUSES.includes(data.status) ? data.status : undefined;

  if (automated) return explicitStatus === 'withdrawn' ? 'withdrawn' : 'archived_unverified';
  if (explicitStatus) return explicitStatus;
  if (data.archive === true || data.archived === true) return 'archived_unverified';
  if (data.draft === true) return 'draft';

  return 'in_review';
};

export const isPublicPostStatus = (status) => status === 'published';
export const isRoutablePostStatus = (status) => status === 'published' || status === 'archived_unverified';

/**
 * The main journal intentionally exposes the English automated-news archive.
 * These entries remain unverified archives: listing them does not promote them
 * to editorially published status or make them indexable.
 */
export const isBlogFeedPost = (status, language) =>
  status === 'published' || (status === 'archived_unverified' && language === 'en');

/**
 * Explicit author types win. Known CinaGroup desks/teams are organizations;
 * an otherwise unknown byline defaults to Person so arbitrary names are not
 * mislabeled as organizations. Legacy automation markers are never exposed.
 */
export const normalizePostAuthorInfo = (rawAuthor, rawAuthorType, automated = false) => {
  if (automated) {
    return { name: 'CinaGroup Automation Desk', type: 'Organization', url: CINAGROUP_AUTHOR_URL };
  }

  const author = typeof rawAuthor === 'string' ? rawAuthor.trim() : '';
  if (!author || author === '001' || author.toLowerCase() === 'cinagroup ai') {
    return { name: 'CinaGroup Editorial', type: 'Organization', url: CINAGROUP_AUTHOR_URL };
  }

  const knownOrganization = ORGANIZATION_AUTHORS.has(author);
  const type = POST_AUTHOR_TYPES.includes(rawAuthorType)
    ? rawAuthorType
    : knownOrganization
      ? 'Organization'
      : 'Person';

  return { name: author, type, ...(type === 'Organization' && knownOrganization ? { url: CINAGROUP_AUTHOR_URL } : {}) };
};

export const normalizePostAuthor = (rawAuthor, automated = false) =>
  normalizePostAuthorInfo(rawAuthor, undefined, automated).name;
