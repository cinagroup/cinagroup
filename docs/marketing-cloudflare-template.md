# CinaGroup marketing-cloudflare frontend

The frontend uses [cinagroup/emdash marketing-cloudflare](https://github.com/cinagroup/emdash/tree/4e1b6393d6036e852bfcc494405f8d8eb9f09ddb/templates/marketing-cloudflare), pinned at `4e1b6393d6036e852bfcc494405f8d8eb9f09ddb`. Its MIT notice is retained in `vendor/marketing-cloudflare/LICENSE`.

The template's Inter typography, light/dark design tokens, indigo/pink gradients, isometric hero illustration, header/footer shell, Hero, Features and Pricing components drive the public frontend. All eight home pages use one shared renderer with the existing localized business copy. Pricing preserves written-quote, scope, timeline, inclusions, exclusions and third-party-cost disclosures. Existing product, service, contact, legal and archive pages share the shell and theme. Contact keeps its real Turnstile-protected submission flow.

Integration changes belong in `src/styles/marketing/theme.css`. Default template tokens remain in `tokens.css`. The template components use local frontend value types because the currently deployed CMS schema and editorial policy remain authoritative. This change does not seed demo pages, change authentication, import content, or upgrade the CMS. Demonstration testimonials, fixed subscription prices and customer counts are not business evidence and are not published.

The former article paths, reciprocal language alternates, publication rules, RSS, sitemap and security headers remain covered by the production validation workflow. Preview deployment and production release remain explicitly dispatched operations under the production runbook.

## Visual acceptance

The reference template and rendered implementation were compared at 1280 × 800. The phone layout was verified at 390 × 844 using a temporary browser device viewport. The frontend-only local harness rendered the actual site components; Cloudflare runtime behavior was separately verified by the Linux production workflow.

| Reference detail                                       | Result                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Inter typography and heavy gradient headline           | Preserved; desktop hero 56px and phone hero 40px.                                           |
| Indigo/pink logo and primary buttons                   | Preserved from template tokens and button styles.                                           |
| Isometric hero artwork                                 | Original SVG retained; split layout on desktop, image above text on phone.                  |
| Wide shell, white background and muted supporting copy | Preserved with template spacing and light/dark colors.                                      |
| Feature grid and pricing cards                         | Template components retained; quote disclosures and actual product links integrated.        |
| Three footer theme choices                             | Light, dark and system have accessible pressed state; selections persist across navigation. |

Intentional content differences: Acme becomes CinaGroup; the demonstration headline, paragraph and CTA labels become current localized product and workflow copy. Navigation retains the existing product, service, archive, company and language routes. Pricing uses the existing three engagement scopes and written-quote terms. Demonstration testimonials, customer counts and fixed subscription amounts are omitted because they are not supported by CinaGroup business evidence.

Browser checks passed for desktop navigation dropdowns, all eight language options, Chinese routing, dark-mode persistence, system/light selection, phone menu opening/Escape closing, pricing navigation and contact-field rendering. The phone home, contact and pricing pages had no horizontal overflow; pricing cards stack within the 390px viewport. Production CI at source commit `25dc058e1351abdade86b434d57ee64d9b32f3c9` passed types, lint, formatting, contact/i18n/CMS/auth tests, source/evidence/content/build audits, Worker dry deployment/startup and compiled response checks ([run 37113046905](https://github.com/cinagroup/cinagroup/actions/runs/37113046905)).
