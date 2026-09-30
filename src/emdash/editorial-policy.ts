import type { PluginDescriptor } from 'emdash';
import type { ContentPolicyDecision, SandboxedPlugin } from 'emdash/plugin';

const PLUGIN_ID = 'cinagroup-editorial-policy';
const PLUGIN_VERSION = '1.0.0';
const ALLOWED_ORIGINS = new Set([
  'editorial',
  'automated_news_workflow',
  'imported_legacy',
  'partner',
  'press_release',
]);
const VERIFIED_STATES = new Set(['source_reviewed', 'fact_checked', 'primary_source_confirmed']);

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasDate(value: unknown): boolean {
  return hasText(value) && Number.isFinite(Date.parse(value));
}

/** A citation must point to a public web host; this does not fetch or endorse its claims. */
function hasReviewableUrl(value: unknown): boolean {
  if (!hasText(value)) return false;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const reserved = ['localhost', 'local', 'internal', 'invalid', 'test', 'example'];

    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !url.username &&
      !url.password &&
      host.includes('.') &&
      !host.startsWith('[') &&
      !/^\d+(?:\.\d+){3}$/.test(host) &&
      !reserved.some((part) => host === part || host.endsWith(`.${part}`)) &&
      !['example.com', 'example.net', 'example.org'].some((part) => host === part || host.endsWith(`.${part}`))
    );
  } catch {
    return false;
  }
}

function reject(reason: string): Exclude<ContentPolicyDecision, void> {
  return { cancel: true, reason };
}

/**
 * EmDash policy events carry a complete entry; schema fields live in `entry.data`.
 * Each localized post is reviewed independently. Imports without evidence stay drafts.
 */
export function validatePostPublication(entry: unknown): ContentPolicyDecision {
  if (!isRecord(entry) || !isRecord(entry.data)) {
    return reject('Publication requires a complete post with editorial metadata.');
  }

  const data = entry.data;
  if (data.editorial_status === 'archived_unverified' || data.editorial_status === 'withdrawn') {
    return reject('Archived or withdrawn posts cannot be published or scheduled.');
  }
  if (data.editorial_status !== 'approved') {
    return reject('Set editorial_status to approved after editorial review.');
  }
  if (!ALLOWED_ORIGINS.has(data.origin as string)) {
    return reject('Record a valid origin before publication.');
  }
  if (data.review_status !== 'approved' || !hasText(data.reviewed_by) || !hasDate(data.reviewed_at)) {
    return reject('Record approved editorial review, reviewer, and review date.');
  }
  if (
    !VERIFIED_STATES.has(data.verification_status as string) ||
    !hasText(data.verified_by) ||
    !hasDate(data.verified_at)
  ) {
    return reject('Record source verification status, reviewer, and verification date.');
  }
  if (
    !Array.isArray(data.sources) ||
    data.sources.length === 0 ||
    !data.sources.every((source) => isRecord(source) && hasText(source.title) && hasReviewableUrl(source.url))
  ) {
    return reject('Cite at least one source with a title and reviewable public web URL.');
  }

  return undefined;
}

/** Registered in `emdash({ plugins: [editorialPolicyPlugin()] })`. */
export function editorialPolicyPlugin(): PluginDescriptor {
  return {
    id: PLUGIN_ID,
    version: PLUGIN_VERSION,
    format: 'standard',
    capabilities: ['hooks.content-policy:register'],
    entrypoint: '/src/emdash/editorial-policy.ts',
  };
}

/**
 * Keep this entrypoint free of runtime imports from the EmDash barrel. Its
 * virtual plugins module loads it during runtime initialization; importing the
 * barrel here creates a cycle that can instantiate the policy before its
 * module constants initialize. EmDash adapts this standard definition and
 * normalizes the hooks using the descriptor above.
 */
const editorialPolicy = {
  hooks: {
    'content:beforePublish': {
      errorPolicy: 'abort',
      handler: async (event) => (event.collection === 'posts' ? validatePostPublication(event.content) : undefined),
    },
    'content:beforeSchedule': {
      errorPolicy: 'abort',
      handler: async (event) => (event.collection === 'posts' ? validatePostPublication(event.content) : undefined),
    },
  },
} satisfies SandboxedPlugin;

export default editorialPolicy;
