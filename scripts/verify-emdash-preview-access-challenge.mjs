const PREVIEW_HOSTNAME = 'cinagroup-emdash-preview.cinagroup.workers.dev';
const ACCESS_ORIGIN = 'https://cinagroup.cloudflareaccess.com';
const LOGIN_PATH = `/cdn-cgi/access/login/${PREVIEW_HOSTNAME}`;

function hasNoStore(value) {
  return /(?:^|,)\s*no-store\s*(?:,|$)/i.test(value ?? '');
}

/** Classify only fixed, anonymous preview management probes. Never echo Location or its query. */
export function classifyPrivatePreviewResponse(response, path, origin) {
  if (response.status === 302) {
    let login;
    try {
      login = new URL(response.headers.get('Location') ?? '');
    } catch {
      throw new Error(`Preview ${path}: invalid Access login redirect`);
    }
    if (
      login.origin !== ACCESS_ORIGIN ||
      login.username ||
      login.password ||
      login.pathname !== LOGIN_PATH
    ) {
      throw new Error(`Preview ${path}: unexpected Access login redirect`);
    }
    const redirectUrls = login.searchParams.getAll('redirect_url');
    let returnTo;
    try {
      if (redirectUrls.length !== 1) throw new Error('missing return path');
      returnTo = new URL(redirectUrls[0], origin);
    } catch {
      throw new Error(`Preview ${path}: invalid Access return path`);
    }
    if (returnTo.href !== `${origin}${path}`) {
      throw new Error(`Preview ${path}: Access return path differs from the requested management path`);
    }
    return { status: 302, mode: 'cloudflare-access' };
  }

  if (response.status !== 401 && response.status !== 503) {
    throw new Error(`Preview ${path}: management route was not closed`);
  }
  if (!response.headers.get('X-Robots-Tag')?.includes('noindex') || !hasNoStore(response.headers.get('Cache-Control'))) {
    throw new Error(`Preview ${path}: Worker denial is missing noindex or no-store`);
  }
  return {
    status: response.status,
    mode:
      response.status === 503
        ? 'worker-unavailable'
        : response.headers.get('WWW-Authenticate')?.startsWith('Basic ')
          ? 'legacy-basic'
          : 'worker-denied',
  };
}
