# CinaGroup marketing-cloudflare frontend

The frontend uses [cinagroup/emdash marketing-cloudflare](https://github.com/cinagroup/emdash/tree/4e1b6393d6036e852bfcc494405f8d8eb9f09ddb/templates/marketing-cloudflare), pinned at `4e1b6393d6036e852bfcc494405f8d8eb9f09ddb`. Its MIT notice is retained in `vendor/marketing-cloudflare/LICENSE`.

The template's Inter typography, light/dark design tokens, indigo/pink button gradients, isometric hero illustration, header/footer shell, Hero, Features and Pricing components drive the public frontend. The header and footer use the original [CinaBrand v2.1.1 lockups](cinabrand.md) through the shared `Logo.astro` component, including the matching white-lettering artwork in dark mode. All eight home pages use one shared renderer with the existing localized business copy. Pricing preserves written-quote, scope, timeline, inclusions, exclusions and third-party-cost disclosures. Existing product, service, contact, legal and archive pages share the shell and theme. Contact keeps its real Turnstile-protected submission flow.

Integration changes belong in `src/styles/marketing/theme.css`. Default template tokens remain in `tokens.css`. The template components use local frontend value types because the currently deployed CMS schema and editorial policy remain authoritative. This change does not seed demo pages, change authentication, import content, or upgrade the CMS. Demonstration testimonials, fixed subscription prices and customer counts are not business evidence and are not published.

The former article paths, reciprocal language alternates, publication rules, RSS, sitemap and security headers remain covered by the production validation workflow. Preview deployment and production release remain explicitly dispatched operations under the production runbook.

## Visual acceptance

The reference template and rendered implementation were compared at 1280 × 800. The phone layout was verified at 390 × 844 using a temporary browser device viewport. The frontend-only local harness rendered the actual site components; Cloudflare runtime behavior was separately verified by the Linux production workflow.

| Reference detail                                       | Result                                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Inter typography and heavy gradient headline           | Preserved; desktop hero 56px and phone hero 40px.                                           |
| Brand lockup and primary buttons                       | Official CinaBrand lockup restored; template button gradients preserved.                    |
| Isometric hero artwork                                 | Original SVG retained; split layout on desktop, image above text on phone.                  |
| Wide shell, white background and muted supporting copy | Preserved with template spacing and light/dark colors.                                      |
| Feature grid and pricing cards                         | Template components retained; quote disclosures and actual product links integrated.        |
| Three footer theme choices                             | Light, dark and system have accessible pressed state; selections persist across navigation. |

Intentional content differences: the Acme text logo becomes the official CinaBrand artwork; the demonstration headline, paragraph and CTA labels become current localized product and workflow copy. Navigation retains the existing product, service, archive, company and language routes. Pricing uses the existing three engagement scopes and written-quote terms. Demonstration testimonials, customer counts and fixed subscription amounts are omitted because they are not supported by CinaGroup business evidence.

Browser checks passed for desktop navigation dropdowns, all eight language options, Chinese routing, dark-mode persistence, system/light selection, phone menu opening/Escape closing, pricing navigation and contact-field rendering. The phone home, contact and pricing pages had no horizontal overflow; pricing cards stack within the 390px viewport. Production CI at source commit `25dc058e1351abdade86b434d57ee64d9b32f3c9` passed types, lint, formatting, contact/i18n/CMS/auth tests, source/evidence/content/build audits, Worker dry deployment/startup and compiled response checks ([run 37113046905](https://github.com/cinagroup/cinagroup/actions/runs/37113046905)).

## CinaBrand restoration acceptance

The marketing header and footer now reuse the existing `Logo.astro` rather than a typeset gradient company name. The reference is the unchanged v2.1.1 artwork listed in [cinabrand.md](cinabrand.md). Local Browser/IAB checks compared the original lettering and blue symbol, source image dimensions/hash, 832:288 display ratio, 56px height and safety padding, light/dark image visibility, and localized home links. Each location shows exactly one theme-appropriate image. No crop, additional radius, shadow, filter or recoloring is applied to the logo.

The actual header/footer components passed 24 phone checks across all eight languages: dark at 320px and 390px and light at 320px, with no horizontal overflow or incorrect logo size. Desktop rendering was checked at 1280px. Language switching and the mobile menu work; its two contact links remain reachable when the narrow-screen action-row CTA is hidden. Business headings and CTA copy are unchanged by this correction.
