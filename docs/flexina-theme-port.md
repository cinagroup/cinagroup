# Flexina appearance port for CinaGroup

The site uses an original Astro implementation of the Flexina visual preset, connected to the existing CinaGroup content and EmDash runtime. This is a presentation change; it does not import a WordPress database or add WooCommerce, newsletter delivery, customer accounts, or demo business claims.

## Sources and rights

- User-selected visual reference: https://preview.desertthemes.com/pro/flexina/ (inspected 2026-10-03). Its deployed theme is Atua Pro with the Flexina preset. The public theme style.css declares GPLv3-or-later. No theme source, scripts, demo photographs, logos, or decorative artwork are redistributed by this implementation.
- User-selected workflow: https://github.com/cinagroup/emdash/tree/main/skills/wordpress-theme-to-emdash, pinned to `4e1b6393d6036e852bfcc494405f8d8eb9f09ddb`. Discovery, design, template conversion, dynamic integration, and verification guidance were read, together with the canonical building-emdash-site skill and querying/rendering/site-feature references.
- CinaBrand assets are the existing authoritative files documented in `docs/cinabrand.md`; their bytes and 832×288 aspect ratio remain unchanged. Header always uses the normal wordmark on cyan, footer the original white wordmark on dark.
- DM Sans Variable and Red Hat Display Variable: Fontsource 5.2.8, SIL OFL 1.1, bundled and served locally. License texts are in `public/images/flexina/*-OFL.txt` and package licenses. These replace Inter for the public site.
- City and office photographs: original OpenAI ImageGen outputs generated for this project on 2026-10-03, encoded to WebP without content edits. They illustrate environments, and do not represent actual CinaGroup offices or employees. Filenames, sizes and SHA256 are recorded in `public/images/flexina/provenance.json`.
- Icons: existing project astro-icon / Tabler dependency. Geometric lines, outlines, slanted areas and footer decoration are original CSS.

Original-photo prompts: a modern international Asian commercial street, cool morning light, tall glass/stone towers, calm left area for white text; and a daylight office with pale oak desks, generic monitors and plants. Both exclude trademarks, signage, identifiable people and text.

## Discovery and design

Reference captures: 1440×900 desktop and 390×844 mobile. Browser automation uses the approved CUA interface. Local frontend verification renders the actual project components in a temporary Astro configuration without the Windows workerd runtime; it does not replace production routes or data.

The selected visual contracts are a full-width two-row header with cyan slanted logo/CTA areas; DM Sans body and Red Hat Display headings; primary #03c2f6 and secondary #42d7ff; 1252px containers; photographic hero with 60% black overlay and a 12-second fading carousel; 100px pill buttons; four numbered cards overlapping the hero by 65px; a photo/text about composition; dashed service-style cards; alternating white/gray sections; numbered workflow circles; cyan CTA band; a dark four-column footer; and centered photographic inner-page title banners.

## Mapping and content boundaries

| WordPress responsibility       | Astro / existing runtime                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Header/footer                  | `components/marketing/Header.astro`, `Footer.astro`, official `Logo.astro`, existing eight-language navigation                  |
| Front page                     | `LocalizedHomePage.astro` and `flexina/HeroSlider.astro`, with existing eight-language business copy                            |
| About/services/product details | Existing page routes and content, shared `CinaPageHero.astro` and theme CSS                                                     |
| Pricing                        | Existing plans and `PricingDisclosure.astro`, restyled `marketing/Pricing.astro`                                                |
| Blog archives and entries      | Existing governed disk archive/CMS public rendering; queries, status/locale filtering and HTMLRewriter markers remain unchanged |
| Forms / plugins                | Existing ContactSubmissionForm and /api/contact; EmDash admin and Access authentication stay intact                             |

The homepage shows all five real products, the existing three-step method and consultation CTA. No demo testimonials, partner logos, personnel, historical timeline, success percentages, sales statistics, store items or fixed subscription prices are published. The original demo's extra sections are omitted where the site has no approved factual content. The homepage does not invent a latest-news section from unverified archives.

## Deliberate visual differences

The official CinaBrand and all business text replace the Flexina wordmark and dummy copy. Original photographs replace unlicensed demo media. The header has only the real social links and email, with no invented telephone, shopping cart, store or fake search. On small screens, numbered cards are horizontally scrollable with scroll snap, so all four remain readable without an unsolicited auto-advancing card carousel. Long localized titles may increase hero height to avoid clipping. Primary cyan buttons use dark text for readable contrast; content links use darker cyan in light mode. Dark mode is an additional supported adaptation. Demo newsletter, player, progress percentages and pricing toggles are omitted because the current business does not provide those functions or values.

## Verification record

To be completed with the final matched-viewport screenshots, responsive checks, CI build/audits and production deployment proof.
