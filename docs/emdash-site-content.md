# Website content in EmDash

The public front end reads native EmDash settings, menus and published page revisions on each request. Existing code copy remains a fallback when the database is unavailable or an entry is missing. Draft edits do not replace the published page; a signed native preview is private and nonindexable.

## Where to edit

Use the language selector in the administration interface before editing a localized entry or menu.

| Front-end area                                                             | Administration location                           | Behavior                                                                                                                                            |
| -------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Site name, tagline, light header logo, favicon                             | Settings → General                                | Saved native settings feed the site head and shared shell. The initial assets are the unchanged original CinaBrand files.                           |
| Social destinations                                                        | Settings → Social                                 | Supported native platforms feed the footer. TikTok and localized RSS links are in Site Presentation.                                                |
| Default sharing image, title separator, search verification                | Settings → SEO                                    | Page-specific metadata takes priority. Canonical origins remain the pinned production domain.                                                       |
| Header, footer groups, legal links                                         | Menus → primary / footer / footer-legal           | One menu per locale. An intentionally empty menu remains empty. Save menu changes to update the public shell.                                       |
| Dark footer logo, contact email, footer description, header contact action | Website → Site Presentation → site                | Eight localized published profiles. Publish the edited profile.                                                                                     |
| Homepage copy, product cards, process cards, two illustrative images       | Website → Website Pages → home                    | Eight localized entries with individual text, link, repeater and media fields. Publish to update the homepage.                                      |
| About / Services / Contact / Pricing / Product copy                        | Website → corresponding localized page collection | Seven localized versions of the existing inner pages. Existing approved copy is the initial published content.                                      |
| English inner-page copy                                                    | Website → English Marketing Pages                 | Ten English pages, including Work. Named plain-text fields correspond to existing page locations. Keep binding keys unchanged.                      |
| Article content and SEO                                                    | Content → Posts                                   | Existing editorial eligibility and exact-locale checks still apply. A native Published state alone cannot override evidence or review requirements. |

Page title, description, canonical URL, sharing image and noindex are available in the native SEO panel. The sharing image resolves a selected media ID to its actual registered file. Noindex CMS posts are excluded from native discovery. Historical article bodies and legacy archive listings remain governed repository content; this integration does not approve or republish those articles.

Prices, legal terms, product evidence, explicit illustrative disclaimers, contact form validation and examples remain controlled source content. The page editor exposes presentation copy rather than a mechanism for bypassing those rules.

Public settings are queried once per request instead of reusing the native isolate-lifetime settings cache, so a save handled by another Worker isolate reaches subsequent public requests. Native media selections remain ImageValue references; homepage images resolve their current ready media records and use the actual public file URL, including nested R2 keys. This avoids the installed image-transform endpoint's flat-key limitation while preserving intrinsic dimensions, focal points and loading priority.

Native posts-per-page, date-format and timezone settings apply to the five dynamic CMS journal indexes (ko/ru/es/pt/fr). The existing historical listing pagination and archived dates retain their governed source behavior.

## Initialization and deployment

The reviewed public seed consists of `seed/site-shell.json`, `seed/site-presentation.json`, `seed/site-inner-pages.json` and `seed/site-english-pages.json`. Together these provide 8 collections, 89 published entries, 24 locale menus and 6 approved media files. No new article, user, credential, widget, redirect or private option is introduced.

`npm run validate:site-content` checks the combined native seed and local media without credentials. The source defaults and generated records are checked against the existing copy. Native SQLite tests exercise the official SDK, publication revisions, locale menus and settings; the production D1 REST adapter is tested with D1 statement, parameter and column limits.

The existing production workflow accepts two explicit manual operations in addition to ordinary `deploy`:

- `deploy-and-initialize`: after all build, governance and target checks, fully downloads a nonempty private D1 SQL export, records its export bookmark and hash, uploads missing approved media to the pinned production R2 bucket, creates missing native models/content/settings/menus, then deploys the validated Worker. Existing editor data is preserved.
- `deploy-and-resume-initialization`: resumes only an identical failed initialization. A running lock is never taken over. A partial or edited menu causes an explicit stop for review instead of deleting or rebuilding its items.

Neither operation runs on a push or PR. The initializer checks the fixed account and exact production database name/ID. The SHA256-derived R2 keys and content hashes let a repeated run reuse media. A compare-and-set versioned marker makes a completed run a no-op; changing the seed afterward requires a separate reviewed migration.

Native `applySeed` replaces menu items even in skip mode. The initialization wrapper therefore passes only absent menus to the SDK, verifies any menu created by an interrupted run, and refuses ambiguous translation anchors. It does not reset EmDash setup or migrations. Redeploying after the initialization refreshes the Worker and its schema caches.

The plaintext SQL export stays in a restrictive runner temporary file. Before writes, it is also sealed with AES-256-GCM; its random encryption key is wrapped using the committed RSA public key (OAEP-SHA256). The encrypted envelope and the public initialization report are retained as GitHub artifacts for 30 days. Download the envelope to the ignored local backup directory for longer retention. The RSA private recovery key stays only in `.backups/cinagroup-site-content-backup-private.dpapi`, protected by the current Windows account; it is never sent to GitHub or Cloudflare. The matching public key was verified against the protected private key before release.

`scripts/recover-site-content-backup.ps1` authenticates the envelope, checks the exact production database and SHA256 proof, and reconstructs a DPAPI-protected SQL recovery file without printing SQL or changing any database. It requires the downloaded encrypted envelope and the local protected private key. Actual data restoration requires a separate reviewed action. Routing rollback does not undo database or media writes. D1 Time Travel is a separate recovery option with a plan-dependent retention window; the export bookmark in the report is not treated as proof that restoration has been tested. See [Cloudflare Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## Acceptance

After deployment, inspect the Website collections, locale menus and media library. Publish a reversible homepage text change, verify the anonymous public page contains the edited text, and restore the original text with a second publication. Verify the shared native settings and menus, images, draft boundaries, private admin access, all eight locales, archive routes, RSS and sitemap. A failed online probe must remain a failed check even when upload succeeded.
