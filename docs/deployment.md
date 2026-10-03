# Production deployment

The EmDash production Worker replaces the former Pages publish target through explicit manual GitHub Actions operations. See [the production runbook](emdash-production.md) for resource IDs, staged acceptance, domain cutover and recovery.

GitHub Actions is the only supported code deployment chain. Pushes to main and pull requests validate the production Worker without uploading or changing routes. A manual dispatch of deploy.yml selects validate, deploy, cutover or rollback. Future automatic production deployment is not enabled.

Keep Cloudflare Pages project cinagroup, its domains, DNS records and previous verified deployment as the rollback origin. Keep direct Pages Git integration disconnected. Production uses its own CMS D1/R2/KV and retains the existing production contact D1 and Turnstile widget. Preview resources remain separate.

A failed cutover returns the exact domains to retained Pages by removing only the owned Worker routes. Preserve D1, R2 and the encryption key; routing recovery does not roll back data writes.
