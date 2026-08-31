# Contact submission operations

The contact endpoint treats a successful D1 write as the only acceptance boundary. Email Sending is not configured for `cinagroup.com`; the optional webhook is best-effort and never changes an accepted submission into a failure.

## Required Cloudflare resource

- D1 database name: `cinagroup-contact-submissions`
- Pages binding: `CONTACT_DB`
- Pages project: `cinagroup`
- Pages root hostname: `homepage-cj7.pages.dev`
- Pages secret (production and preview): `TURNSTILE_SECRET_KEY`

Configure `TURNSTILE_SECRET_KEY` separately for the production and preview Pages environments in the Cloudflare dashboard. It is a secret binding: never add its value to source, logs, `wrangler.jsonc`, or a committed environment file. A missing secret fails closed for every new submission.

Before replacing dashboard configuration with a Wrangler file, download and compare the existing project configuration. Run the download in a fresh temporary directory so it cannot overwrite reviewed repository files:

```powershell
$contactConfigAudit = Join-Path ([IO.Path]::GetTempPath()) ("cinagroup-pages-config-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $contactConfigAudit | Out-Null
Push-Location $contactConfigAudit
npx wrangler pages download config cinagroup
Pop-Location
```

Create the database only once, then place the returned database UUID in the Pages D1 binding configuration. Do not commit account tokens or secret values.

```sh
npx wrangler d1 create cinagroup-contact-submissions
```

## Migrations

Apply and test the migration against local D1 storage first:

```sh
npx wrangler d1 migrations apply cinagroup-contact-submissions --local
```

After the production binding has been checked, apply the same tracked migration remotely:

```sh
npx wrangler d1 migrations list cinagroup-contact-submissions --remote
npx wrangler d1 migrations apply cinagroup-contact-submissions --remote
```

`public/_routes.json` limits Pages Functions execution to `/api/*`; Astro copies it to `dist/_routes.json` during the build.

## Turnstile verification policy

The contact component uses the production public site key by default, renders the widget with action `contact`, and loads Cloudflare's `api.js` only on contact pages. The Function sends the token, `CF-Connecting-IP` when present, and the submission UUID as the Siteverify idempotency key. Acceptance requires all of the following:

- Siteverify returns `success: true`.
- The verified action is exactly `contact`.
- The verified hostname exactly matches the request hostname.
- The hostname is exactly `cinagroup.com`, exactly `homepage-cj7.pages.dev`, or a preview subdomain ending in `.homepage-cj7.pages.dev`.

Unrelated Pages projects such as `attacker.pages.dev` are explicitly rejected even if Siteverify reports the same hostname as the request.

Verification failures return only the generic `verification_failed` response; Siteverify error codes, action values, hostname values, and secret-related details are not returned to the browser. Transport or configuration failures return the generic `verification_unavailable` response. Neither case writes a contact row.

Turnstile tokens are single-use. Before Siteverify is called, the Function looks up the submitted UUID. A retry with the same UUID and identical normalized payload returns the existing success without consuming another token or writing again. Reusing the UUID with different content returns a conflict. A new UUID must pass Siteverify before insertion.

For automated preview E2E only, `TURNSTILE_TEST_MODE=true` may be set temporarily together with Cloudflare's official dummy key pair. The server accepts that mode only on a subdomain of `homepage-cj7.pages.dev`, requires Cloudflare's exact dummy token and response shape, and continues to reject it on `cinagroup.com`. Remove the flag and restore the real preview secret immediately after the test.

Automated unit tests inject a fake Siteverify fetch and use placeholder values; they never call Cloudflare or use a real secret. Localhost is denied by default. For an intentional interactive local integration test only:

1. Set `PUBLIC_TURNSTILE_SITE_KEY` to an official Cloudflare dummy site key for the Astro build.
2. Put the matching dummy secret in the ignored `.dev.vars` file.
3. Set `TURNSTILE_ALLOW_LOCALHOST=true` in that same local-only file.

Never use the production secret locally, and never configure `TURNSTILE_ALLOW_LOCALHOST` in production or preview. Remove the local file values after testing. The checked-in `wrangler.jsonc` intentionally contains neither the secret nor the localhost opt-in.

## Optional webhook

No webhook is configured at this stage. Leave `CONTACT_WEBHOOK_URL` unset unless a notification processor has been separately reviewed and approved. If enabled later, it must be an HTTPS URL stored as a Pages secret, never in source or Wrangler variables.

When absent, accepted rows use `notification_status = 'not_configured'`. When present, the Function writes the row with `notification_status = 'pending'` before returning success and attempts the webhook through `waitUntil()`. Successful delivery updates the row to `sent`; any delivery failure remains `pending` with an operational error for later reconciliation.

## Retention audit and cleanup

Accepted submissions receive a `retention_until` value 12 calendar months after acceptance. Until cleanup is automated, run the following auditable process monthly. Review the count and sample before deleting anything:

```sql
SELECT COUNT(*) AS expired_count
FROM contact_submissions
WHERE retention_until <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

SELECT submission_id, created_at, retention_until, status
FROM contact_submissions
WHERE retention_until <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
ORDER BY retention_until
LIMIT 100;

DELETE FROM contact_submissions
WHERE retention_until <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

SELECT changes() AS deleted_count;
```

Record the audit date, reviewed count, deletion count, operator, and any rows retained under a documented legal or business exception. Run cleanup through `wrangler d1 execute cinagroup-contact-submissions --remote` only after the review has been completed; do not test deletion against the production binding.

If an approved exception applies, extend that row’s `retention_until` to a specific reviewed date before running the deletion and record the reason outside the contact database. Do not leave an expired row in place without a new review date.

## Verification

Run the dependency-free core tests:

```sh
node --test tests/contact-core.test.mjs
```

For a local Pages integration test, build the site, apply the local migration, then run Pages development with the `CONTACT_DB` binding configured. Never use a remote production binding for write tests.
