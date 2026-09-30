import { classifyPublic500 } from './public-500-diagnostic.mjs';

const PREVIEW_ORIGIN = 'https://cinagroup-emdash-preview.cinagroup.workers.dev';
const PATHS = new Set(['/', '/ko/blog/', '/fr/blog/', '/zh/blog/']);
const ROUTE_KINDS = new Map([
  ['/', 'home'],
  ['/ko/blog', 'native_cms_index'],
  ['/fr/blog', 'native_cms_index'],
  ['/[lang]/blog', 'localized_blog_endpoint'],
  ['/[lang]/[...blog]', 'localized_legacy_index'],
]);

/** Limit all diagnostic output to the same fixed anonymous preview probes. */
export function previewPublicProbeScope(request, routePattern) {
  // Astro reuses the original Request URL when rerendering its /500 page.
  if (routePattern === '/500' || routePattern === '/500/') return null;
  if (!request || (request.method !== 'GET' && request.method !== 'HEAD')) return null;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.origin !== PREVIEW_ORIGIN || url.search || url.hash || !PATHS.has(url.pathname)) return null;
  return { method: request.method, path: url.pathname, routeKind: ROUTE_KINDS.get(routePattern) ?? 'other_or_absent' };
}

/** Called before Astro replaces a bodyless 500 with its error route. */
export function projectPublicRouteResponse(scope, response) {
  if (!scope || response?.status !== 500) return null;
  const rawType = response.headers.get('X-Astro-Route-Type');
  return {
    kind: 'response_500',
    ...scope,
    bodyPresent: response.body !== null,
    routeType: rawType === 'page' || rawType === 'fallback' ? rawType : 'other_or_absent',
    rerouteDisabled: response.headers.get('X-Astro-Reroute') === 'no',
    astroErrorFlag: response.headers.has('X-Astro-Error'),
  };
}

/** Log only allowlisted error identity; the original error is rethrown unchanged. */
export function projectPublicRouteThrow(scope, error) {
  if (!scope) return null;
  return { kind: 'throw', ...scope, ...classifyPublic500(error) };
}
