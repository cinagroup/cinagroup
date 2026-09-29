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
