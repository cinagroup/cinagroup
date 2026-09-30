# CinaAuth → Cloudflare Access for EmDash preview

This runbook applies only to `cinagroup-emdash-preview.cinagroup.workers.dev`. Production `cinagroup.com` remains on Pages. The Worker guard requires Cloudflare Access for `/_emdash` and its descendants. Public pages, RSS, sitemap, and canonical public-file-media reads remain anonymous. The more-specific Access bypass application covers only `/_emdash/api/media/file/*`; uploads, metadata, private media keys, and other admin APIs remain protected by the Worker.

The dedicated preview CinaAuth OIDC provider passed a real Cloudflare Test login for the selected identity, returning boolean `oidc_fields.email_verified: true`. Both isolated Access applications and six runtime bindings were configured. Commit `1080bbc` was deployed as Worker version `8a486133-6176-43ed-9812-eabd5b2969b0`; its full Linux workflow passed, including 190 EmDash tests. Anonymous private paths received the fixed Cloudflare Access login challenge. These results do not establish successful administrator provisioning.

The first protected-app login was blocked by Access: the exact-email Include rule passed, while the OIDC Require rule failed. The replacement policy requires the dedicated CinaAuth login method and the same exact email. The Worker still validates the application JWT, issuer, audience, expiry, identity provider, matching signed email, and strictly boolean `email_verified === true` before granting the selected identity the native Admin role. The Access rule does not replace this verification.

Manual preview workflow operations:

1. `audit-access` reads the isolated account/team, IdPs, and applications without changing them.
2. `configure-access` creates only absent fixed-path applications and refuses conflicting or broader applications. The verified admin AUD is passed to runtime configuration; it is not an API token.
3. `configure-access-runtime` verifies applications, policy, IdP, AUD, and Worker, then creates only previously absent runtime bindings. Do not rerun it to overwrite an existing or partial configuration.
4. `migrate-access-policy` changes only the exact owned legacy admin policy to the dedicated login-method rule. It verifies both applications and requires the audited auth-guard Worker as the sole active version before the first write. Unexpected policy fields or changed state stop the operation. An already-current policy is read-only.
5. `diagnose-public` checks fixed anonymous public GET/HEAD URLs and briefly opens an ephemeral Worker Tail, deleted in cleanup. Reports contain only projected status, version/binding checks, and whitelisted error categories; never raw logs, headers, stacks, cookies, or the Tail URL.
6. `deploy` uploads the isolated preview Worker separately. Acceptance requires anonymous admin denial, successful selected-account Admin entry, reload persistence, public GET/HEAD parity, RSS/sitemap parity, canonical media reads, and `X-Robots-Tag: noindex, nofollow`.

The six required Worker bindings are:

| Binding                        | Required value or source                                                         |
| ------------------------------ | -------------------------------------------------------------------------------- |
| `EMDASH_AUTH_MODE`             | `cinaauth-access`                                                                |
| `CF_ACCESS_TEAM_DOMAIN`        | `cinagroup.cloudflareaccess.com`                                                 |
| `CF_ACCESS_AUDIENCE`           | Verified admin Access application AUD                                            |
| `CF_ACCESS_CINA_AUTH_IDP_ID`   | Dedicated preview CinaAuth OIDC provider ID                                      |
| `CF_ACCESS_CINA_AUTH_IDP_TYPE` | `oidc`                                                                           |
| `EMDASH_ACCESS_ADMIN_EMAIL`    | Exact selected administrator email, stored as a secret; never document its value |

Live administrator acceptance and intermittent public-index HTTP 500 diagnosis remain pending. The previous pilot REST/PAT import expected the [legacy password cookie](emdash-migration.md#legacy-password-and-passkey-rollback-reference) and cannot be used against this guard. Configure and verify preview-only Cloudflare Access Service Auth together with native EmDash PAT handling before importing drafts. A native PAT is not an Access credential. Production cutover remains a separate decision.
