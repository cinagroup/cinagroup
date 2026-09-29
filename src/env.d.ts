// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />
/// <reference types="@astrojs/cloudflare/types.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../worker-configuration.d.ts" />
/// <reference types="vite/client" />
/// <reference types="../vendor/integration/types.d.ts" />

interface ImportMetaEnv {
  /** Optional public override for local Turnstile testing; production uses the checked-in public site key. */
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
