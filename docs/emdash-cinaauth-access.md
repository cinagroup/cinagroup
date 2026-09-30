# CinaAuth → Cloudflare Access for EmDash preview

This runbook applies only to `cinagroup-emdash-preview.cinagroup.workers.dev`. Production `cinagroup.com` remains on Pages. The new Worker guard requires Cloudflare Access for `/_emdash` and its descendants. The public site, RSS, sitemap, and canonical public-file-media reads remain anonymous. The more-specific Access bypass application covers only `/_emdash/api/media/file/*`; upload, metadata, and other admin APIs remain protected.

The dedicated preview CinaAuth OIDC provider has passed a real Cloudflare Test login for the selected identity. Its `oidc_fields.email_verified` value was boolean `true`. A read-only Access audit succeeded and found **no preview-host application**. Application creation, runtime setup, new-code deployment, and first EmDash administrator provisioning are still pending. Do not treat a successful OIDC test as proof that the admin route is protected or usable.

Use the manual preview workflow in this order:

1. Run `audit-access` and review the isolated account/team, selected preview IdP, and absence or exact match of both preview applications. This operation performs GET requests only.
2. Run `configure-access`. It creates only absent, fixed-path preview applications and refuses conflicting or broader applications. The admin application allows one exact configured email through only the dedicated preview IdP and requires its OIDC `email_verified=true` claim. Its application AUD is captured for the next operation; the value is not an API token.
3. Run `configure-access-runtime`. It verifies those applications, policy, IdP, AUD, and isolated Worker, then creates only previously absent runtime bindings. It does not upload Worker code, although secret updates can create a new Worker version.
4. Dispatch `deploy` separately, then test anonymous denial on `/_emdash/admin/` and private API/setup paths, successful selected-account admin entry, and anonymous public pages, RSS, sitemap, and canonical file-media reads. Check `X-Robots-Tag: noindex, nofollow` throughout.

The six required Worker bindings are:

| Binding                        | Required value or source                                                         |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `EMDASH_AUTH_MODE`             | `cinaauth-access`                                                                |
| `CF_ACCESS_TEAM_DOMAIN`        | `cinagroup.cloudflareaccess.com`                                                 |
| `CF_ACCESS_AUDIENCE`           | Verified admin Access application AUD                                            |
| `CF_ACCESS_CINA_AUTH_IDP_ID`   | Dedicated preview CinaAuth OIDC provider ID                                      |
| `CF_ACCESS_CINA_AUTH_IDP_TYPE` | `oidc`                                                                           |
| `EMDASH_ACCESS_ADMIN_EMAIL`    | Exact verified administrator email, stored as a secret; never document its value |

The `ab02` copy-flow update passed full Linux CI and 184 local tests. Those tests do not replace live Access and EmDash checks. The previous pilot REST/PAT import expected the [legacy password cookie](emdash-migration.md#legacy-password-and-passkey-rollback-reference); it cannot be used against this guard. Design Cloudflare Access Service Auth and EmDash PAT handling, including preview-only idempotent imports, before importing drafts. A native EmDash bearer PAT is not an Access credential. First-admin creation or automatic provisioning remains a separate verified step.
