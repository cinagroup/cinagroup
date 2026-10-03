export type DeploymentTarget = 'preview' | 'production';
export const PREVIEW_HOST = 'cinagroup-emdash-preview.cinagroup.workers.dev';
export const PRODUCTION_HOST = 'cinagroup.com';
export const PRODUCTION_STAGING_HOST = 'cinagroup-emdash-production.cinagroup.workers.dev';
export const PRODUCTION_ALIAS = 'xn--v6qq4kq7wvy1b.xn--fiqs8s';

export function resolveDeploymentTarget(bindings: unknown): DeploymentTarget | null {
  if (!bindings || typeof bindings !== 'object') return null;
  const value = (bindings as Record<string, unknown>).EMDASH_DEPLOYMENT_TARGET;
  return value === 'preview' || value === 'production' ? value : null;
}

export function isDeploymentHostname(url: string, target: DeploymentTarget | null): boolean {
  const hostname = new URL(url).hostname;
  return target === 'preview'
    ? hostname === PREVIEW_HOST
    : target === 'production' && [PRODUCTION_HOST, PRODUCTION_STAGING_HOST, PRODUCTION_ALIAS].includes(hostname);
}

/** The existing Chinese Pages alias follows the production canonical origin. */
export function productionAliasRedirect(request: Request, target: DeploymentTarget | null): Response | null {
  const url = new URL(request.url);
  if (target !== 'production' || url.hostname !== PRODUCTION_ALIAS) return null;
  url.protocol = 'https:';
  url.hostname = PRODUCTION_HOST;
  url.port = '';
  return new Response(null, {
    status: 308,
    headers: { Location: url.href, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

/** Index only the exact production host and retain route-specific robots directives. */
export function applyDeploymentHeaders(request: Request, response: Response, target: DeploymentTarget): Response {
  const result = new Response(response.body, response);
  const url = new URL(request.url);
  const privatePath = /^\/(?:(?:en|zh|ja|ko|ru|es|pt|fr)\/)?(?:_emdash|cms-preview)(?:\/|$)/i.test(url.pathname);
  if (target !== 'production' || url.hostname !== PRODUCTION_HOST || privatePath) {
    const robots = result.headers.get('X-Robots-Tag');
    result.headers.set('X-Robots-Tag', robots ? robots + ', noindex, nofollow' : 'noindex, nofollow');
  }
  result.headers.set('X-CinaGroup-Deployment', 'emdash-' + target);
  return result;
}
