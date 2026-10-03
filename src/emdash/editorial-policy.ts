import type { ContentPolicyDecision, PluginDescriptor, ResolvedPlugin } from 'emdash';

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
    id: 'cinagroup-editorial-policy',
    version: '1.0.0',
    format: 'native',
    capabilities: ['hooks.content-policy:register'],
    entrypoint: '/src/emdash/editorial-policy.ts',
  };
}

/**
 * EmDash's virtual plugin registry calls this factory during module loading.
 * Keep it self-contained: the SDK barrel and standard adapter introduce a
 * circular initialization path on Workers. Fixed metadata and hook defaults
 * live inside this function so registration cannot read uninitialized module
 * constants. Publication validation still runs when each hook is dispatched.
 */
export function createPlugin(): ResolvedPlugin {
  const pluginId = 'cinagroup-editorial-policy';

  return {
    id: pluginId,
    version: '1.0.0',
    capabilities: ['hooks.content-policy:register'],
    allowedHosts: [],
    storage: {},
    hooks: {
      'content:beforePublish': {
        pluginId,
        priority: 100,
        timeout: 5000,
        dependencies: [],
        errorPolicy: 'abort',
        exclusive: false,
        handler: async (event) => (event.collection === 'posts' ? validatePostPublication(event.content) : undefined),
      },
      'content:beforeSchedule': {
        pluginId,
        priority: 100,
        timeout: 5000,
        dependencies: [],
        errorPolicy: 'abort',
        exclusive: false,
        handler: async (event) => (event.collection === 'posts' ? validatePostPublication(event.content) : undefined),
      },
    },
    routes: {},
    mcp: { tools: {} },
    admin: {},
  };
}
