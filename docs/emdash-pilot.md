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

`emdash seed` connects to a local SQLite file, not the deployed preview D1. The deployed Worker already seeded the content model without article content. To import the three pilot candidates later, finish the preview-only outer admin password and first EmDash administrator setup, then create an EmDash API token with schema read, content read (including drafts), content create, and source-entry edit permissions. Keep the EmDash token, outer-gate password, rotated Cloudflare token, and Cloudflare account ID in environment secrets; never pass them as CLI arguments or print them.

```sh
node scripts/import-emdash-pilot.mjs           # read-only remote preflight
node scripts/import-emdash-pilot.mjs --apply   # explicitly create missing drafts
```

The script is pinned to `cinagroup-emdash-preview.cinagroup.workers.dev`. Before writing, `--apply` audits the currently deployed Worker bindings and route inventory through the Cloudflare API, then inventories every live post and all eight locales' trash. A collision or mismatched source hash stops the import. If a request succeeds but its response is lost, rerun the read-only preflight; matching drafts are reused, and the script never updates or publishes an existing entry. The Japanese translation is linked using the actual Chinese EmDash ID. After any write, the script verifies draft state and translation groups through the authenticated API, checks that anonymous detail URLs return 404 and public lists omit the drafts, and checks short-lived signed preview URLs return 200. The pilot has no structured source citations, so editorial review is still required before publication. Do not run this against production or copy its drafts into the checked-in model seed.
