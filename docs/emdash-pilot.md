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

## Isolated preview import in Access mode

The current preview uses the [CinaAuth → Cloudflare Access admin path](emdash-cinaauth-access.md). Complete the selected identity's protected-app login, verify native Admin provisioning and reload persistence, and resolve public-page failures before importing. Access application or runtime configuration alone does not create an EmDash administrator. Native registration and passkey setup are disabled by the current guard.

Remote import is not ready for this auth mode. The existing `scripts/import-emdash-pilot.mjs` requires a legacy password cookie and cannot be used against the current Worker, including its read-only preflight. Design and verify a preview-only Access Service Auth identity together with native EmDash PAT handling before adapting the importer. The current Worker guard rejects service identities, so this requires a separate implementation rather than credentials alone. The automation must satisfy both authentication layers without forwarding a browser session or weakening the selected administrator policy. A native PAT is not an Access credential. Do not run `configure-admin-password` or reuse the old password entrance in the current branch; [legacy rollback context](emdash-migration.md#legacy-password-and-passkey-rollback-reference) applies only to the corresponding pre-Access Worker.

The deployed Worker already seeded the content model without article content. `emdash seed` connects to local SQLite, not the deployed preview D1; the generated pilot seed remains a local review artifact. Do not copy article drafts into the checked-in model seed or run the importer against production.

When the new automation is ready, create a short-lived native EmDash PAT with `schema:read`, `content:read`, and `content:write`. The administrator role supplies separate RBAC permissions to read drafts and edit the source entry when linking translations; `content:read_drafts`, `content:create`, and `content:edit_own` are permissions rather than PAT scope names. Add `media:read` and `media:write` only for media upload/readback acceptance. Store the PAT and any Access service credentials as environment secrets, never CLI arguments or logs. Preserve the configured `EMDASH_ENCRYPTION_KEY` and its secure backup; changing it would make existing encrypted values unreadable.

The adapted importer must retain the existing preview-only safety checks: audit the exact deployed Worker bindings and route inventory before writes; inventory all live posts and all eight locales' trash; stop on collisions or mismatched source hashes; reuse matching drafts after a lost response; and never update or publish an existing entry. Link the Japanese translation using the actual Chinese EmDash ID. After each write, verify draft state and translation groups through authenticated APIs, anonymous detail URLs returning 404, public lists omitting the drafts, and short-lived signed preview URLs returning 200. The pilot articles lack structured source citations, so editorial review remains required before publication.
