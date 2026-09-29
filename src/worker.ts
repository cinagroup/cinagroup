import handler, { createScheduledHandler, PluginBridge } from '@emdash-cms/cloudflare/worker';

export { PluginBridge };

const astroFetch = handler.fetch;

if (!astroFetch) {
  throw new Error('EmDash Worker fetch handler is missing');
}

export default {
  ...handler,
  async fetch(request, env, ctx) {
    const response = await astroFetch(request, env, ctx);
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
