import { defineMiddleware } from 'astro:middleware';
import { defaultLang, languages } from './i18n';
import {
  previewPublicProbeScope,
  projectPublicRouteResponse,
  projectPublicRouteThrow,
} from './emdash/public-route-boundary.mjs';

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const pathname = url.pathname;

  // Extract language from path
  const pathParts = pathname.split('/').filter(Boolean);
  const firstSegment = pathParts[0];

  let lang = defaultLang;
  if (firstSegment && firstSegment in languages) {
    lang = firstSegment as keyof typeof languages;
  }

  // Store language in locals for components to access
  context.locals.lang = lang;
  context.locals.pathWithoutLang = lang === defaultLang ? pathname : pathname.replace(`/${lang}`, '') || '/';

  const probeScope = previewPublicProbeScope(context.request, context.routePattern);
  try {
    const response = await next();
    const diagnostic = projectPublicRouteResponse(probeScope, response);
    if (diagnostic) console.error(`[cinagroup-preview-route-boundary] ${JSON.stringify(diagnostic)}`);
    return response;
  } catch (error) {
    const diagnostic = projectPublicRouteThrow(probeScope, error);
    if (diagnostic) console.error(`[cinagroup-preview-route-boundary] ${JSON.stringify(diagnostic)}`);
    throw error;
  }
});
