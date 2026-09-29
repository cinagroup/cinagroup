import handler, { createScheduledHandler, PluginBridge } from '@emdash-cms/cloudflare/worker';
import { fetchWithPreviewAdminAccess } from './emdash-preview-access';

export { PluginBridge };

const astroFetch = handler.fetch;

if (!astroFetch) {
  throw new Error('EmDash Worker fetch handler is missing');
}

export default {
  ...handler,
  async fetch(request, env, ctx) {
    const previewEnv = env as CloudflareEnv & { EMDASH_PREVIEW_ADMIN_PASSWORD?: string };
    const response = await fetchWithPreviewAdminAccess(
      request,
      previewEnv.EMDASH_PREVIEW_ADMIN_PASSWORD,
      async (forwarded) => astroFetch(forwarded as typeof request, env, ctx)
    );
    if (!new URL(request.url).hostname.toLowerCase().endsWith('.workers.dev')) return response;

    const headers = new Headers(response.headers);
    const existingRobots = headers.get('X-Robots-Tag');
    headers.set('X-Robots-Tag', existingRobots ? `${existingRobots}, noindex, nofollow` : 'noindex, nofollow');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
  scheduled: createScheduledHandler(),
} satisfies ExportedHandler<CloudflareEnv>;
