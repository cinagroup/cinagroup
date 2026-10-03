/** Frontend values adapted from marketing-cloudflare at 4e1b639. Existing CMS schema stays authoritative. */
export interface HeroValue {
  anchor_id?: string;
  headline: string;
  subheadline?: string;
  primary_cta_label?: string;
  primary_cta_url?: string;
  secondary_cta_label?: string;
  secondary_cta_url?: string;
  image?: { id: string; src: string; alt?: string; width?: number; height?: number } | null;
  centered?: boolean;
}
export interface FeaturesValue {
  anchor_id?: string;
  headline?: string;
  subheadline?: string;
  link_label?: string;
  features: Array<{ icon: string; title: string; description: string; role?: string; href?: string }>;
}
export interface QuoteDisclosure {
  budget: string;
  timeline: string;
  included: string;
  excluded: string;
  labels?: { budget: string; timeline: string; included: string; excluded: string };
}
export interface PricingValue {
  anchor_id?: string;
  headline?: string;
  plans: Array<{
    name: string;
    price?: string;
    period?: string;
    description?: string;
    features: string;
    cta_label: string;
    cta_url: string;
    highlighted?: boolean;
    badge?: string;
    quote?: QuoteDisclosure;
  }>;
}
export interface FAQValue {
  anchor_id?: string;
  headline?: string;
  items: Array<{ question: string; answer: string }>;
}
