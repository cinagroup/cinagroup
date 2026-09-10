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

## Multilingual articles

Articles can be translated into any of the eight site locales
(`en`, `zh`, `ja`, `ko`, `ru`, `es`, `pt`, `fr`). A translation is a separate
markdown source that declares its content language and shares a
`translationKey` with the original:

```yaml
---
status: published
origin: editorial
language: zh-CN
translationKey: agent-workspace-guide
title: '……'
publishDate: 2026-08-30T08:00:00.000Z
---
```

Routing and linking are derived from the language:

- English (`en`) posts are served at `/blog/<slug>/`; every other language is
  served under its locale prefix, e.g. `zh-CN` at `/zh/blog/<slug>/`. Use an
  ASCII slug per file; localized slugs are acceptable but must stay unique.
- Posts sharing a `translationKey` (it defaults to the slug) are grouped as
  translations. Reciprocal `hreflang` links include only indexable `published`
  siblings; `x-default` is added only when that set has a published English
  member. The header language switcher may also link to a noindex historical
  original so readers can inspect the authoritative archive source.
- Each locale's blog index (`/zh/blog/`, `/ja/blog/`, …) lists only
  `published` posts written in that language, and is generated only when at
  least one such post exists. The automated English archive never appears in a
  localized feed, and category/tag pages remain English-only.
- Blog UI strings (headline, pagination, "back to blog", reading time) come
  from `src/i18n/blog.ts`; add or adjust translations there.

Governance rules apply per source file: every translation still needs an
explicit `status` and `origin`, and the structured-data and governance audits
validate each localized detail page exactly like the English one.

## Machine translation of archived briefings

Translations of archived automated briefings are how localized blog sections
get readable content. English is authoritative: the archive files in
`src/data/post/` are immutable, so a translation is a new file under
`src/content/blog/` (never named `ai-news-briefing-*`, which would force it
into the archive lifecycle):

1. Verify the original's claims first and record the verdicts in the fact-check
   ledger (below). Do not publish a translation ahead of its fact-check. Keep
   partially reviewed translations at `status: in_review`; they do not get a
   feed entry or detail route.
2. Create `src/content/blog/news-briefing-<date>-<edition>-<lang>.md` with
   `language`, `translationKey: <original archive slug>`, `status: published`,
   `origin: editorial`, the original `publishDate`, and a `verification.note`
   that discloses machine translation and points at the fact-check panel.
3. Open the body with a notice that the text is machine-translated and the
   English original prevails, and link the original by its English URL.
4. Omit `category` and `tags` so the translation does not link into the
   English-only taxonomy pages.
5. Build and run the audits. The governance audit allows the archived slug to
   appear only on that translation's own detail route; anywhere else is a
   leak.

## Fact-check ledger

`src/data/fact-checks.ts` records verification verdicts for translation groups
keyed by `translationKey`, so the English archive page and all of its
translations render the same panel. Constraints that the reviews and audits
enforce:

- Every claim verdict rendered publicly (`supported`, `partially_supported`,
  `unsupported`, `unresolvable`) must cite public sources consulted. Records
  with provisional empty source lists are internal research notes only.
- Only a record whose every claim has at least one source is rendered publicly.
  CI rejects a `published` translation when its ledger record is missing or
  incomplete.
- Archive files are never edited to attach verdicts; the ledger exists because
  the archive manifest pins their hashes.
- A fact-check date must be serialized so page labels keep canonical ISO
  datetimes.

## Historical automated briefings

All files under `src/data/post/` are preserved as unverified historical
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
