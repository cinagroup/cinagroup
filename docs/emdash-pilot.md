# EmDash pilot draft preparation

Run the local dry run after `npm ci`:

```sh
node scripts/prepare-emdash-pilot.mjs --out cinagroup-pilot.seed.json
```

Without `--out`, the script prints the seed JSON to stdout. `--file` can be repeated to select individual files under `src/content/blog/`:

```sh
node scripts/prepare-emdash-pilot.mjs \
  --file src/content/blog/news-briefing-2026-03-20-zh.md \
  --file src/content/blog/news-briefing-2026-03-20-ja.md \
  --out cinagroup-pilot-pair.seed.json
```

The default selection is one formerly published Chinese article and an in-review Chinese/Japanese translation pair. The script reads local Markdown and the checked-in content model, validates the generated seed with EmDash 1.0, and writes only the requested local output file. It never contacts the CMS. It refuses to overwrite an existing output or the checked-in model seed.

Every generated entry has EmDash `status: "draft"`. The source publication state is retained in the `legacy_status` provenance field. A formerly `published`, `scheduled`, or `approved` source is downgraded to `editorial_status: "in_review"`; its old state does not authorize EmDash publication. The original slug, locale, translation key, dates, review and verification records, citations, and source hash are carried into the draft when present. The Japanese article is linked to the Chinese article by seed-local `translationOf`; the absent English archive is not imported.

The dry-run report on stderr lists the derived canonical URL and citation count for each entry. The current default articles have no structured `sources` frontmatter and require source review before approval. The script checks source status, language-to-locale mapping, slug suffix, canonical route, duplicate slug/locale and translation-key/locale within the selection. It rejects unsupported Markdown structures and metadata rather than flattening them. Existing remote CMS entries cannot be checked without a CMS inventory; compare slugs and locales before any manual import. The source English briefings under `src/data/post/` are immutable unverified archives and are outside this pilot.

The output follows EmDash's [seed content entry format](https://docs.emdashcms.com/themes/seed-files/) with explicit draft status and Portable Text blocks. It is a review artifact, not a deployment step. EmDash's `seed` CLI includes content by default, so applying this file is a separate controlled action. The [content CLI](https://docs.emdashcms.com/reference/cli/) also publishes newly created content unless `--draft` is supplied; do not omit that flag if importing individual entries manually.

## Isolated preview import after admin setup

`emdash seed` connects to a local SQLite file, not the deployed preview D1. The deployed Worker already seeded the content model without article content. Before importing, use the explicitly authorized manual `configure-admin-password` workflow operation to provision an absent `EMDASH_PREVIEW_ADMIN_PASSWORD` on the exact preview Worker. Generate this password locally from 32 cryptographically random bytes encoded as unpadded base64url, save it as the same-named GitHub secret, and keep a Windows-account DPAPI-encrypted backup outside Git. This guarded operation preserves an existing password; normal `deploy` never sets or rotates it. Secret values are never printed.

Open the preferred [preview access entrance](https://cinagroup-emdash-preview.cinagroup.workers.dev/_emdash/access/) and submit the existing preview password. Its form POST requires the exact preview Origin and a single password field in `application/x-www-form-urlencoded`, with an actual body limit of 2048 bytes. A valid submission issues the existing HMAC-signed eight-hour `HttpOnly; Secure; SameSite=Strict` cookie and redirects with a fixed 303 to the native `/_emdash/admin/` page. JavaScript-capable browsers use a hash-authorized inline script to submit the same form through a same-origin fetch and then navigate to the fixed admin page; the native POST form remains the fallback. The entrance sends `no-store`, a restricted CSP, and a same-origin referrer policy; it does not place the password in the URL or echo it. Direct HTTP Basic access to the admin page remains protected as before, using username `preview` and the same password.

The user personally completes first-admin setup: fill Site Title with `CinaGroup Preview`, leave Tagline optional, select `Empty site`, and click `Continue →`; enter your email as Your Email and an optional name, continue, then click `Create passkey` and approve the device's secure prompt. An authorized agent may fill the email and other form fields in the browser, but the user completes authenticator approval; do not write their specific email into repository documentation. When `Passkey created` appears, click `Open the dashboard`; if redirected to login, use the new passkey to sign in. A Cloudflare API token or generated outer password cannot replace passkey registration. The EmDash `siteUrl` is pinned to the preview origin so setup and passkey verification use the correct host.

Create a short-lived EmDash API token from the administrator account with the valid PAT scopes `schema:read`, `content:read`, and `content:write`. The administrator role supplies the separate permissions to read drafts and edit the source entry when linking translations; `content:read_drafts`, `content:create`, and `content:edit_own` are RBAC permissions, not PAT scope names. Add `media:read` and `media:write` only when performing media upload/readback acceptance. Keep the EmDash token as `EMDASH_TOKEN`, the outer-gate password, rotated Cloudflare token, and Cloudflare account ID in environment secrets; never pass them as CLI arguments or print them. Before storing plugin secrets, provision and retain an `EMDASH_ENCRYPTION_KEY` in the format `emdash_enc_v1_` followed by 43 unpadded base64url characters encoding 32 random bytes.

```sh
node scripts/import-emdash-pilot.mjs           # read-only remote preflight
node scripts/import-emdash-pilot.mjs --apply   # explicitly create missing drafts
```

The script is pinned to `cinagroup-emdash-preview.cinagroup.workers.dev`. Before writing, `--apply` audits the currently deployed Worker bindings and route inventory through the Cloudflare API, then inventories every live post and all eight locales' trash. A collision or mismatched source hash stops the import. If a request succeeds but its response is lost, rerun the read-only preflight; matching drafts are reused, and the script never updates or publishes an existing entry. The Japanese translation is linked using the actual Chinese EmDash ID. After any write, the script verifies draft state and translation groups through the authenticated API, checks that anonymous detail URLs return 404 and public lists omit the drafts, and checks short-lived signed preview URLs return 200. The pilot has no structured source citations, so editorial review is still required before publication. Do not run this against production or copy its drafts into the checked-in model seed.
