import '../worker-configuration';

export interface ContactPagesEnv extends CloudflareEnv {
  /** Cloudflare Pages secret. Never place its value in source or Wrangler configuration. */
  TURNSTILE_SECRET_KEY: string;
  /** Local-only opt-in. Must never be enabled in a deployed Pages environment. */
  TURNSTILE_ALLOW_LOCALHOST?: 'true';
  /** Temporary E2E opt-in. Accepted only on this project's preview subdomains. */
  TURNSTILE_TEST_MODE?: 'true';
  CONTACT_WEBHOOK_URL?: string;
}
