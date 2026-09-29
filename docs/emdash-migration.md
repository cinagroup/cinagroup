# EmDash migration: isolated preview and cutover

The first deployment target is the Worker `cinagroup-emdash-preview` on its `workers.dev` URL. The checked-in `wrangler.jsonc` has no custom-domain route. `.github/workflows/emdash-preview.yml` validates pushes to the isolated `codex/emdash-migration` branch without credentials or deployment; only a manual `workflow_dispatch` from that branch can deploy the preview Worker. It must never attach `cinagroup.com` or deploy the existing `cinagroup` Pages project. **Do not merge this migration branch to the default branch:** the existing Pages workflow deploys on a `main` push, while this branch changes the site build and Cloudflare configuration. The Pages site remains the production baseline until a separate, reviewed cutover.

## Provision the preview environment

| Setting                | Preview value or action                                                                                                                                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Actions secrets | `CLOUDFLARE_EMDASH_PREVIEW_API_TOKEN` with permission to deploy this Worker and use its D1/R2 resources; `CLOUDFLARE_ACCOUNT_ID` for the same account. Keep the production Pages token separate.                                                                                       |
| EmDash D1 binding      | `DB` → `cinagroup-emdash-preview`. Provision this database in the preview account before deployment and verify its ID/binding.                                                                                                                                                         |
| EmDash R2 binding      | `MEDIA` → `cinagroup-emdash-media-preview`. Provision this bucket before deployment. Never reuse production media.                                                                                                                                                                     |
| Contact D1 binding     | `CONTACT_DB` → `cinagroup-contact-submissions-preview`, ID `a24a999d-f784-4ee1-8dcd-888a7be43e7c`. Verify this exact account/database before dispatch. Apply the tracked contact migration to this database only.                                                                      |
| Worker secrets         | Set a new, persistent `EMDASH_ENCRYPTION_KEY` on the preview Worker before storing plugin secrets. Set a separate preview `TURNSTILE_SECRET_KEY` only after preview form validation is enabled. Leave `CONTACT_WEBHOOK_URL` unset unless a preview-only destination has been approved. |
| Build variable         | Set GitHub Actions variable `EMDASH_PREVIEW_TURNSTILE_SITE_KEY` to the preview Turnstile site key once its hostname has been configured. The workflow passes it as `PUBLIC_TURNSTILE_SITE_KEY` at build time.                                                                          |
| Astro bindings         | The Cloudflare adapter adds `IMAGES` and `SESSION` KV to the generated Worker config. Check both before deploy; the preview token needs KV write permission if Wrangler provisions `SESSION`. Image transforms can incur Cloudflare Images usage.                                      |

Provision and inspect resources in the Cloudflare account before a remote write; do not rely on automatic D1/R2 creation. If missing, use `wrangler d1 create cinagroup-emdash-preview` and `wrangler r2 bucket create cinagroup-emdash-media-preview` with preview-scoped credentials, then verify that `wrangler.jsonc` resolves to those resources. For the contact database, inspect the tracked migrations in `migrations/` and apply them to `cinagroup-contact-submissions-preview` with `wrangler d1 migrations apply cinagroup-contact-submissions-preview --remote`. This preview database must remain separate from `cinagroup-contact-submissions`. After the first Worker deployment, add the encryption key with `wrangler secret put EMDASH_ENCRYPTION_KEY --name cinagroup-emdash-preview`; keep the key with the preview D1 backup so encrypted plugin settings remain recoverable. Set other Worker secrets in the same named Worker, never in `wrangler.jsonc` or GitHub logs.

The preview URL is public unless access controls are configured. Protect EmDash admin access. The preview Worker adds `X-Robots-Tag: noindex, nofollow` to responses on its `workers.dev` hostname; verify the header on old static pages, API routes, and CMS pages before sharing the URL. Check that neither the preview Worker in the Cloudflare dashboard nor the generated Wrangler deployment configuration has a custom-domain route, especially `cinagroup.com`. The preview cron in `wrangler.jsonc` runs against isolated preview bindings; confirm scheduled tasks cannot call production services.

EmDash reads `seed/seed.json` into the bundle and applies its content model only when the new database is empty and setup has not completed. This checked-in seed has no article content; the separately generated pilot draft seed is a review artifact. Later schema changes or draft imports need an explicit, reviewed operation against the preview database.

## Deploy and verify

As of 2026-09-29, GitHub authentication from the current workstation is unavailable, and the local Windows `workerd` process crashes during Astro checks. No preview deployment or production switch has been performed. Use a Linux builder with Node 24.19, this isolated branch, and only preview-scoped Cloudflare credentials. The branch-push workflow validates without credentials or deployment once GitHub access is restored; the `workflow_dispatch` deploy option cannot be invoked while this workflow file exists only on the migration branch. GitHub requires the workflow file on the default branch for manual dispatch. A later, separately reviewed **workflow-only** change to the default branch or a dedicated preview repository could enable that option; do not merge the migration branch to enable it.

From a Linux checkout of `codex/emdash-migration`, with the preview resources already provisioned, run the same checks explicitly:

```sh
node --version # use 24.19; the EmDash dependency requires ^22.22.2, ^24.15.0, or >=26
npm ci
npm run check:astro
npm run check:cloudflare
npm run check:eslint
npm run check:prettier
npm run test:contact
npm run test:blog-i18n
npm run test:emdash
npm run audit:source
PUBLIC_TURNSTILE_SITE_KEY="$EMDASH_PREVIEW_TURNSTILE_SITE_KEY" npm run build
```

Inspect the generated Wrangler deployment target before any upload. This check must pass on the exact build output that will be deployed:

```sh
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const pointerPath = resolve('.wrangler/deploy/config.json');
const pointer = JSON.parse(readFileSync(pointerPath, 'utf8'));
const config = JSON.parse(readFileSync(resolve(dirname(pointerPath), pointer.configPath), 'utf8'));
const db = (binding) => config.d1_databases?.find((item) => item.binding === binding);
const media = config.r2_buckets?.find((item) => item.binding === 'MEDIA');
const session = config.kv_namespaces?.find((item) => item.binding === 'SESSION');
if (config.name !== 'cinagroup-emdash-preview' || config.route || config.routes?.length || config.domains?.length || config.workers_dev === false) throw new Error('Unsafe preview Worker target');
if (db('DB')?.database_name !== 'cinagroup-emdash-preview') throw new Error('Unexpected EmDash D1 binding');
if (db('CONTACT_DB')?.database_name !== 'cinagroup-contact-submissions-preview' || db('CONTACT_DB')?.database_id !== 'a24a999d-f784-4ee1-8dcd-888a7be43e7c') throw new Error('Unexpected contact D1 binding');
if (media?.bucket_name !== 'cinagroup-emdash-media-preview') throw new Error('Unexpected media bucket');
if (!session || config.images?.binding !== 'IMAGES') throw new Error('Missing Astro session or images binding');
console.log('Isolated preview target verified');
NODE
npx wrangler deploy --dry-run --name cinagroup-emdash-preview
```

Only after those checks and a deliberate review of the Cloudflare dashboard routes, an operator may run `npx wrangler deploy --name cinagroup-emdash-preview` with a preview-scoped token. Record the deployment ID and actual `workers.dev` hostname. This is a manual preview operation; no push or pull request is authorized to deploy, and no production switch is authorized at this stage.

Compare the preview against `https://cinagroup.com` for `/`, `/zh/`, `/ja/`, `/blog/`, `/zh/blog/`, `/ja/blog/`, several canonical articles and translations, an archived article, a known redirect, `/rss.xml`, `/sitemap-index.xml`, localized contact pages, `/api/contact`, `/cms-preview/?locale=zh`, `/cms-preview/?locale=ja`, a published article's `/cms-preview/<slug>/?locale=zh` and `?locale=ja` URLs, and `/_emdash/admin/`. Check status codes, trailing slashes, redirects, navigation, language links, image and CSS assets, canonical URL, `robots`, Open Graph and Twitter tags, hreflang, RSS and sitemap membership, and page content. Verify the Worker-level `X-Robots-Tag: noindex, nofollow` on every preview response tested. On eventual production cutover, canonical URLs and hreflang must refer to `cinagroup.com` and all intended locales must remain discoverable. Exercise EmDash login, content editing, media upload/readback, and persistence after a fresh Worker deployment. Verify that published Chinese and Japanese EmDash articles appear in the corresponding CMS preview lists and details, while drafts appear only in EmDash admin preview. The English legacy archive remains outside the initial CMS sample. Full migration is not ready for cutover while published CMS content is invisible on the intended public blog routes.

The contact handler currently accepts Turnstile hostnames only for `cinagroup.com` and the `homepage-cj7.pages.dev` family. A `workers.dev` preview submission therefore fails closed even with a valid token. Expect `verification_failed` and no row in preview `CONTACT_DB` until the preview hostname is explicitly added to the handler's allowlist and its own Turnstile widget. Do not set `TURNSTILE_TEST_MODE` for this Worker; that mode is limited to Pages preview subdomains. After implementing the hostname change, test same-origin POST, token action/hostname verification, successful D1 write, idempotent retry, GET confirmation, invalid token rejection, and no production D1 write. Form acceptance is a cutover gate, not a property of the initial preview deploy.

## Cutover gate and rollback

Before scheduling cutover, finish the preview checks, resolve the contact hostname gate, prove CMS-to-public content behavior, and take recoverable snapshots of EmDash D1, contact D1, R2 media, and the encryption key. Record the known-good Pages deployment and DNS/domain settings. Freeze editorial writes while reconciling content and media; verify production-specific D1/R2 bindings and secrets in a separately reviewed Worker configuration. Attach `cinagroup.com` only in a separate production change after the gate passes. Then recheck representative URLs, robots/canonical/hreflang, sitemap/RSS, admin permissions, media, and a real contact submission on the live domain.

For a bad preview release, restore its previous Worker deployment and keep the preview resources for diagnosis. For a failed production cutover, route `cinagroup.com` back to the recorded Pages deployment and verify the same routes and contact flow. Preserve EmDash D1/R2 and the encryption key; reconcile writes made during the cutover window before another attempt. Restoring a Worker bundle alone does not roll back D1 or R2 data.

References: [EmDash Cloudflare deployment](https://docs.emdashcms.com/deployment/cloudflare/), [Cloudflare Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [Cloudflare Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/), and the existing [Pages deployment](deployment.md) and [contact operations](contact-submissions.md) runbooks.
