import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import type { LegacyAssetFetcher } from './legacy-article-asset.ts';

type Element = DefaultTreeAdapterTypes.Element;
type Node = DefaultTreeAdapterTypes.Node;
const MAX_HTML_LENGTH = 2 * 1024 * 1024;
const LOCALES = new Set(['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr']);
const OWNED_HOSTS = new Set([
  'cinagroup.com',
  'cinagroup-emdash-preview.cinagroup.workers.dev',
  'cinagroup-emdash-production.cinagroup.workers.dev',
]);

export interface LegacyArticleShell {
  /** Literal slices of the compiled asset, never content read from the CMS. */
  mainHtml: string;
  headHtml: string;
  bodyScriptsHtml: string;
  language: string;
  direction: 'ltr' | 'rtl';
  htmlClass: string;
  bodyClass: string;
  canonical: string;
  archived: boolean;
  noIndex: boolean;
  languageAlternates: Array<{ hreflang: string; href: string }>;
}
export type LegacyArticleLookup =
  { kind: 'shell'; article: LegacyArticleShell } | { kind: 'asset'; response: Response };

const attr = (node: Element, name: string) => node.attrs.find((item) => item.name === name)?.value;
const isElement = (node: Node): node is Element => 'tagName' in node;
const children = (node: Node): Node[] => ('childNodes' in node ? node.childNodes : []);
function descendants(node: Node): Element[] {
  return children(node).flatMap((child) => [...(isElement(child) ? [child] : []), ...descendants(child)]);
}
function literal(html: string, node: Element): string | undefined {
  const location = node.sourceCodeLocation;
  if (!location || !location.startTag || location.endOffset <= location.startOffset) return undefined;
  if (!['meta', 'link'].includes(node.tagName) && !location.endTag) return undefined;
  return html.slice(location.startOffset, location.endOffset);
}
function ownedUrl(value: string | undefined, base: string): URL | undefined {
  if (!value || Array.from(value).some((character) => character.charCodeAt(0) < 32 || character === '\\'))
    return undefined;
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' && OWNED_HOSTS.has(url.hostname) && !url.username && !url.password
      ? url
      : undefined;
  } catch {
    return undefined;
  }
}
function replacedScript(node: Element, source: string): boolean {
  const src = attr(node, 'src');
  if (src) return /\/(?:ClientRouter|Header|Footer)\.astro(?:_|\.)/.test(src);
  // These global initializers are provided once by the current shell. Other
  // compiled scripts, including any article-specific interaction, stay intact.
  return (
    /\bwindow\.basic_script\s*=/.test(source) ||
    /\bwindow\.awIntersectionObserver\s*=/.test(source) ||
    (source.includes('localStorage.theme') &&
      source.includes('document.documentElement.classList') &&
      source.includes('matchMedia'))
  );
}

/** Admit only the governed, complete article documents produced by this repo. */
export function extractLegacyArticleShell(html: string, requestUrl: string): LegacyArticleShell | undefined {
  if (html.length > MAX_HTML_LENGTH) return undefined;
  const document = parse(html, { sourceCodeLocationInfo: true });
  const htmlNodes = document.childNodes.filter(isElement);
  if (htmlNodes.length !== 1 || htmlNodes[0].tagName !== 'html') return undefined;
  const root = htmlNodes[0];
  const rootChildren = root.childNodes.filter(isElement);
  const head = rootChildren.find((node) => node.tagName === 'head');
  const body = rootChildren.find((node) => node.tagName === 'body');
  if (
    !head?.sourceCodeLocation?.startTag ||
    !head.sourceCodeLocation.endTag ||
    !body?.sourceCodeLocation?.startTag ||
    !body.sourceCodeLocation.endTag
  )
    return undefined;
  const bodyElements = body.childNodes.filter(isElement);
  const mains = descendants(body).filter((node) => node.tagName === 'main');
  const main = mains[0];
  const header = bodyElements.find((node) => node.tagName === 'header');
  if (
    mains.length !== 1 ||
    !bodyElements.includes(main) ||
    attr(main, 'id') !== 'main-content' ||
    !header ||
    !bodyElements.some((node) => node.tagName === 'footer')
  )
    return undefined;
  const posts = descendants(main).filter(
    (node) => node.tagName === 'article' && (attr(node, 'class') ?? '').split(/\s+/).includes('cg-blog-post')
  );
  if (posts.length !== 1) return undefined;
  const status = attr(posts[0], 'data-content-status');
  const archived = status === 'archived_unverified';
  if (status !== 'published' && !archived) return undefined;
  if (attr(posts[0], 'data-content-kind') !== (archived ? 'historical-archive' : 'editorial')) return undefined;
  if (archived && !descendants(posts[0]).some((node) => attr(node, 'data-archive-notice') !== undefined))
    return undefined;
  const headElements = head.childNodes.filter(isElement);
  if (headElements.some((node) => !['title', 'meta', 'link', 'style', 'script'].includes(node.tagName)))
    return undefined;
  const titles = headElements.filter((node) => node.tagName === 'title');
  const canonicals = headElements.filter((node) => node.tagName === 'link' && attr(node, 'rel') === 'canonical');
  const robots = headElements.filter(
    (node) => node.tagName === 'meta' && attr(node, 'name')?.toLowerCase() === 'robots'
  );
  if (titles.length !== 1 || canonicals.length !== 1 || robots.length !== 1) return undefined;
  const canonical = ownedUrl(attr(canonicals[0], 'href'), requestUrl);
  if (!canonical || canonical.pathname !== new URL(requestUrl).pathname || canonical.search || canonical.hash)
    return undefined;
  const noIndex = /(?:^|[\s,])noindex(?:$|[\s,])/i.test(attr(robots[0], 'content') ?? '');
  if (archived && !noIndex) return undefined;
  const language = attr(root, 'lang') ?? '';
  if (!LOCALES.has(language.split('-')[0])) return undefined;
  const pathLocale = new URL(requestUrl).pathname.match(/^\/(zh|ja|ko|ru|es|pt|fr)\//)?.[1] ?? 'en';
  if (language.split('-')[0] !== pathLocale) return undefined;
  const mainHtml = literal(html, main);
  if (!mainHtml) return undefined;
  const keptHead: string[] = [];
  for (const node of headElements) {
    const source = literal(html, node);
    if (!source) return undefined;
    const rel = (attr(node, 'rel') ?? '').toLowerCase().split(/\s+/);
    if (
      node.tagName === 'link' &&
      rel.some((value) => ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon'].includes(value))
    )
      continue;
    if (node.tagName === 'meta' && (attr(node, 'name') ?? '').startsWith('astro-view-transitions-')) continue;
    if (node.tagName === 'script' && replacedScript(node, source)) continue;
    keptHead.push(source);
  }
  const bodyScripts: string[] = [];
  for (const node of bodyElements.filter((node) => node.tagName === 'script')) {
    const source = literal(html, node);
    if (!source) return undefined;
    if (!replacedScript(node, source)) bodyScripts.push(source);
  }
  // Header language links contain archived translation/home fallbacks omitted
  // from SEO hreflang. Preserve that original switching scope independently.
  const alternates = new Map<string, string>();
  for (const node of descendants(header).filter((node) => node.tagName === 'a')) {
    const locale = attr(node, 'hreflang') ?? attr(node, 'lang');
    const href = attr(node, 'href');
    if (locale && LOCALES.has(locale) && ownedUrl(href, requestUrl)) alternates.set(locale, href!);
  }
  for (const node of headElements.filter((node) => node.tagName === 'link' && attr(node, 'rel') === 'alternate')) {
    const locale = attr(node, 'hreflang');
    const href = attr(node, 'href');
    if (locale && LOCALES.has(locale) && ownedUrl(href, requestUrl) && !alternates.has(locale))
      alternates.set(locale, href!);
  }
  return {
    mainHtml,
    headHtml: keptHead.join(''),
    bodyScriptsHtml: bodyScripts.join(''),
    language,
    direction: attr(root, 'dir') === 'rtl' ? 'rtl' : 'ltr',
    htmlClass: attr(root, 'class') ?? '',
    bodyClass: attr(body, 'class') ?? '',
    canonical: canonical.href,
    archived,
    noIndex,
    languageAlternates: [...alternates].map(([hreflang, href]) => ({ hreflang, href })),
  };
}

/** Fetch a complete representation for extraction; never parse a 304 or range. */
export function legacyArticleReadRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  for (const name of ['If-Match', 'If-None-Match', 'If-Modified-Since', 'If-Unmodified-Since', 'Range', 'If-Range'])
    headers.delete(name);
  return new Request(request.url, { method: 'GET', headers, redirect: 'manual' });
}
export function withoutHeadBody(request: Request, response: Response): Response {
  if (request.method !== 'HEAD') return response;
  void response.body?.cancel();
  return new Response(null, response);
}
export async function loadLegacyArticleShell(
  request: Request,
  assets: LegacyAssetFetcher
): Promise<LegacyArticleLookup | undefined> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
  const response = await assets.fetch(legacyArticleReadRequest(request));
  if (response.status === 404) {
    await response.body?.cancel();
    return undefined;
  }
  if (response.status === 200 && /^text\/html(?:\s*;|$)/i.test(response.headers.get('Content-Type') ?? '')) {
    const article = extractLegacyArticleShell(await response.text(), request.url);
    if (article) return { kind: 'shell', article };
  } else {
    await response.body?.cancel();
  }
  // Unsupported assets retain priority and original conditional/range semantics.
  return { kind: 'asset', response: withoutHeadBody(request, await assets.fetch(request)) };
}
export function setLegacyArticleShellHeaders(headers: Headers, article: LegacyArticleShell): void {
  for (const name of ['ETag', 'Last-Modified', 'Content-Length', 'Content-Encoding', 'Accept-Ranges'])
    headers.delete(name);
  headers.set('Cache-Control', 'no-store');
  if (article.noIndex) headers.set('X-Robots-Tag', 'noindex, follow');
}
