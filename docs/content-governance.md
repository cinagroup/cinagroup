# Content governance

The journal uses an explicit, fail-closed lifecycle. A source without a valid
`status` is treated as `in_review` and is not included in public collections.
Only `published` entries appear in the blog list, pagination, RSS, category and
tag pages, related posts, or the sitemap.

## Status model

| Status                | Meaning                                                                  | Detail URL                           | Public collections |
| --------------------- | ------------------------------------------------------------------------ | ------------------------------------ | ------------------ |
| `draft`               | Work in progress                                                         | No                                   | No                 |
| `in_review`           | Awaiting editorial and source review                                     | No                                   | No                 |
| `approved`            | Review complete, publication not authorized                              | No                                   | No                 |
| `scheduled`           | Approved for a later controlled release                                  | No                                   | No                 |
| `published`           | Explicitly authorized public article                                     | Yes                                  | Yes                |
| `archived_unverified` | Preserved historical record whose claims were not independently verified | Yes, `noindex,follow` with a warning | No                 |
| `withdrawn`           | Removed from public routing for legal, safety, or integrity reasons      | No                                   | No                 |

The optional governance fields are:

- `origin`: `editorial`, `automated_news_workflow`, `imported_legacy`,
  `partner`, or `press_release`.
- `sources`: reviewable citations. Object entries carry a title, absolute URL,
  optional source kind, publisher, and source/access dates.
- `verification`: verification status, reviewer, date, and note.
- `review` plus `reviewedBy`/`reviewedAt`: editorial review record.
- `correction` plus `correctionNote`: a visible, attributable correction record.
- `aliases`: former paths to review before adding redirects.

Legacy `draft`, `archive`, and `archived` flags remain readable only as safe
downgrades. The legacy `published` flag never authorizes publication; every
publication decision must use `status: published`. An automated briefing
filename is forced to `archived_unverified` even if its frontmatter is edited to
claim a public state.

## Publication requirements

1. Start new content as `draft` or `in_review` with `origin` set.
2. Record primary sources for material factual claims. A press release must be
   labeled as such and should not be the only source for an independent claim.
3. Complete editorial review and record the reviewer and review date.
4. Use `approved` while release approval is pending. Change to `published` only
   in a reviewed pull request; publishing scripts never mutate repository state.
5. Run `node scripts/audit-content-governance.mjs --source-only`. After building,
   run the same command without `--source-only` to verify every public surface.

Corrections must not silently rewrite provenance. Add a correction note and
date, preserve the original URL, re-run source review, and use `withdrawn` when
the record cannot safely remain available.

## Historical automated briefings

All 346 files under `src/data/post/` are preserved as unverified historical
archives. Their original detail URLs remain available for transparency and link
continuity, but the pages carry an explicit warning and `noindex,follow`.
They are excluded from lists, feeds, taxonomies, recommendations, and sitemaps.
The generation and bulk-rewrite entry points are retired and fail closed.
`docs/briefing-archive-manifest.json` pins every slug, source path, and normalized
source hash. The governance audit fails if a record disappears or changes unless
the manifest change is reviewed explicitly alongside it.

The migration is reproducible and idempotent:

```sh
node scripts/migrate-briefing-governance.mjs
node scripts/migrate-briefing-governance.mjs --write
node scripts/generate-briefing-archive-manifest.mjs
node scripts/generate-briefing-archive-manifest.mjs --write
```

The first invocation is a dry run. The migration also removes model-control or
tool-transcript remnants and refuses to overwrite conflicting review metadata.
The manifest generator is also dry-run by default; use its write mode only for
an intentional, reviewed archive-baseline update.

## Legacy `blog/` directory

The root `blog/` tree is outside Astro's content loader and is not published.
It is retained as a read-only provenance inventory; do not delete or import it
based on filenames alone. `docs/legacy-blog-mapping.json` records hashes,
candidate historical URLs, collection counterparts, and review actions. Refresh
that inventory with:

```sh
node scripts/generate-legacy-blog-mapping.mjs --write
```

The inventory currently contains 21 files: 15 have same-name collection
counterparts with content variants, while 6 have no collection counterpart.
An alias or redirect requires ownership and provenance review first.

## Backup boundaries

Repository mutation is not a backup mechanism. The bundled schedule and memory
backup scripts are local-only or use explicitly configured S3/WebDAV storage.
They do not stage, commit, synchronize, or publish application repository state.
