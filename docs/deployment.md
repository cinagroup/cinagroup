# Production deployment

GitHub Actions is the only supported production deployment chain for this repository. The workflow lives at
`.github/workflows/deploy.yml` and publishes the `dist` directory to the Cloudflare Pages project `cinagroup`.

## Event policy

- A pull request targeting `main` runs the full validation chain and never deploys.
- A manual workflow dispatch runs the full validation chain and never deploys.
- A push to `main` deploys only after every validation step succeeds.
- No local script, content automation, backup job, or Cloudflare direct Git build is an approved production path.

## Required validation order

The workflow installs the locked dependency graph with Node.js 22, then runs:

1. Astro type checks, ESLint, and Prettier checks.
2. Contact endpoint tests and Cloudflare Pages Functions checks.
3. Source-level blog, content-governance, evidence, and i18n route audits.
4. The production Astro build.
5. Public-evidence, content-governance, blog structured-data, and built-output audits against `dist`.
6. Deployment-secret presence checks on a `main` push only.
7. `wrangler pages deploy dist --project-name=cinagroup --branch=main`.

The deploy step requires these GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`, scoped for Cloudflare Pages deployment.
- `CLOUDFLARE_ACCOUNT_ID`, for the account that owns the `cinagroup` Pages project.

Secrets belong in GitHub repository settings and Cloudflare secret storage. Do not commit them or print their values in
workflow output.

## Dashboard invariant

Cloudflare Pages direct Git integration must be disconnected for this project. Git integration and GitHub Actions both
react to the same `main` commit and otherwise create duplicate production deployments.

Repository changes cannot enforce this dashboard setting. Before the next production push, a project administrator must
open **Workers & Pages → cinagroup → Settings → Git repository**, disconnect the repository integration, and verify that
the GitHub Actions workflow remains the only deployment source. This is a one-time dashboard action; do not delete the
Pages project, its custom domain, Functions bindings, D1 bindings, or secrets.

## Verification and recovery

After a production run, verify the workflow conclusion and sample `https://cinagroup.com/` plus the changed routes. If a
release is unhealthy, use the Pages deployment history to restore a previously verified deployment, then fix the source
and run the normal `main` workflow. Do not bypass the validation chain with an ad hoc production upload.
