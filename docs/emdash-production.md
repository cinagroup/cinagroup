# EmDash production deployment and rollback

The production Worker is `cinagroup-emdash-production`. Its primary origin is `https://cinagroup.com`; the existing Chinese domain redirects to that origin with path and query preserved. The isolated preview retains its own resources and noindex behavior.

## Release policy

GitHub Actions remains the code deployment path. `.github/workflows/deploy.yml` validates pushes to `main` and pull requests without deployment. Only an explicit manual dispatch writes production state. Future automatic production deployment has not been authorized.

The manual operations are:

- `validate`: type/lint/format checks, contact and CMS/Access tests, source and built content audits, production build, fixed resource-target checks, dry upload and Linux Worker startup checks.
- `deploy`: the same checks, read-only production boundary audit, tracked contact migration to the exact production contact database, Worker upload, and public/anonymous Access verification on the noindex workers.dev endpoint. This operation does not attach domain routes.
- `cutover`: the same checks and staged online verification, followed by attaching only the two exact owned domain routes and verifying the primary live domain. Failed live verification removes those routes so retained Pages resumes serving public requests.
- `rollback`: remove only the exact routes owned by this Worker. Do not delete data, media, keys, DNS, Pages domains or the Pages project.

Live operations may run only from `main` or the reviewed migration branch. Validation of a pull request never receives Cloudflare credentials. The account, resource IDs, Access application audience and route ownership are pinned and checked before mutation.

Built-content audits inspect the actual compiled Worker responses rendered with ephemeral local D1/R2/KV bindings and no Cloudflare credentials. The resulting `dist/audit` mirror is separate from uploaded assets, includes SSR marketing pages and discovery endpoints, and retains the existing evidence, archive, structured-data and internal-link checks.

## Production resources

| Binding      | Resource                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `DB`         | `cinagroup-emdash-production`, `88da0e99-bbf0-45f6-82f6-74922e1ba2f7`                                                                 |
| `MEDIA`      | `cinagroup-emdash-media-production`                                                                                                   |
| `SESSION`    | `4cd278d6330c47d6a82537393650e405`                                                                                                    |
| `CONTACT_DB` | Existing `cinagroup-contact-submissions`, `0cfb1da1-2079-411b-bb21-f5a04fed292b`                                                      |
| Turnstile    | Existing production widget, restricted to its current approved domains                                                                |
| Access       | Separate production admin and canonical public-file applications; the same dedicated CinaAuth IdP and selected administrator identity |

Production uses `EMDASH_BUILD_TARGET=production` and `wrangler.production.jsonc`. The explicit runtime `EMDASH_DEPLOYMENT_TARGET` determines exact accepted hosts and indexing behavior. Only `cinagroup.com` public responses can be indexable; private responses, signed previews, unreviewed archives, empty CMS indexes and the workers.dev endpoint retain their applicable noindex rules. The generated deployment configuration must contain production D1/R2/KV resources and no routes: attaching routes is a separate explicit operation.

The Worker secrets are maintained in Cloudflare. Preserve `EMDASH_ENCRYPTION_KEY` with its database; the production database was promoted from a verified empty preview CMS using the original key. Administrator data and content model were retained, while all native authentication tokens and pending challenges were cleared. There were no CMS posts, media or passkey credentials to promote. Static archives and approved translations remain available, with source publication policies unchanged. Importing additional material or publishing new CMS articles is a separate editorial operation.

## Baseline and backups

The retained Pages project is `cinagroup`, with origin `homepage-cj7.pages.dev`. Its pre-cutover deployment is `4720498b-a850-41d8-90c0-fcb29fef262d`, commit `d26737743f0fe8684c195d7ef9ff62e0853514a6`. The domain CNAME records and Pages domain associations are retained. Worker routes override the retained Pages origin; removing only these routes restores that origin without a DNS replacement.

Before provisioning production, the preview CMS and production contact database were exported to SQL and encrypted with Windows DPAPI in the ignored local `.backups/` directory. Empty FTS virtual tables were checked for zero rows, exported separately as their schema and reconstructed during the successful import. The production media bucket began empty. The original encryption-key backup was copied as a PowerShell SecureString DPAPI backup. These backups are bound to the Windows account; preserve access to that account or export a separately protected recovery copy before changing machines.

The local audit report records export bookmarks, lengths and hashes, the resource IDs, and DNS/Pages rollback settings without credentials. D1 Time Travel supplies another short-term recovery option. Routing rollback does not reverse D1/R2 writes. Freeze CMS editing during a rollback and reconcile any new production data before a subsequent promotion.

## Live acceptance

Before route attachment, verify the Worker endpoint and compare RSS and sitemap bytes with the current Pages production site. Verify home/contact pages, all eight locale indexes, preserved articles including the newest RSS entry, GET/HEAD behavior, redirects, security and indexing headers, canonical public media, and anonymous protected requests.

After attachment, verify `https://cinagroup.com`, its primary administrator entry and the Chinese-domain canonical redirect. Confirm the selected administrator is Admin/Active after refresh and deployment, and test the real contact form with production Turnstile before claiming complete form acceptance. New CMS publishing, media uploads and import automation require their own content-level acceptance; this infrastructure cutover preserves the static content and existing publication rules.

References: [Worker routes](https://developers.cloudflare.com/workers/configuration/routing/routes/), [D1 export](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/), [D1 import](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/import/), and the [CinaAuth Access runbook](emdash-cinaauth-access.md).
