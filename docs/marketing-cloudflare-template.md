# CinaGroup marketing-cloudflare frontend

The frontend uses [cinagroup/emdash marketing-cloudflare](https://github.com/cinagroup/emdash/tree/4e1b6393d6036e852bfcc494405f8d8eb9f09ddb/templates/marketing-cloudflare), pinned at `4e1b6393d6036e852bfcc494405f8d8eb9f09ddb`. Its MIT notice is retained in `vendor/marketing-cloudflare/LICENSE`.

The template's Inter typography, light/dark design tokens, indigo/pink gradients, isometric hero illustration, header/footer shell, Hero, Features and Pricing components drive the public frontend. All eight home pages use one shared renderer with the existing localized business copy. Pricing preserves written-quote, scope, timeline, inclusions, exclusions and third-party-cost disclosures. Existing product, service, contact, legal and archive pages share the shell and theme. Contact keeps its real Turnstile-protected submission flow.

Integration changes belong in `src/styles/marketing/theme.css`. Default template tokens remain in `tokens.css`. The template components use local frontend value types because the currently deployed CMS schema and editorial policy remain authoritative. This change does not seed demo pages, change authentication, import content, or upgrade the CMS. Demonstration testimonials, fixed subscription prices and customer counts are not business evidence and are not published.

The former article paths, reciprocal language alternates, publication rules, RSS, sitemap and security headers remain covered by the production validation workflow. Preview deployment and production release remain explicitly dispatched operations under the production runbook.
