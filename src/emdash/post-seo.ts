export interface PublicPostSeo {
  title?: string;
  description?: string;
  image?: string;
  imageMediaId?: string;
  canonical?: string;
  noIndex: boolean;
}

const text = (value: unknown, limit: number): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const result = value.trim();
  return result &&
    result.length <= limit &&
    ![...result].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    ? result
    : undefined;
};

/** Content SEO can customize public metadata, while origins remain pinned to this site. */
function siteUrl(value: unknown): string | undefined {
  const input = text(value, 2048);
  if (!input || /[\s\\<>]/.test(input) || input.startsWith('//')) return undefined;
  try {
    const url = new URL(input, 'https://cinagroup.com');
    if (url.origin !== 'https://cinagroup.com' || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

export function publicPostSeo(value: unknown): PublicPostSeo | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const data = value as Record<string, unknown>;
  const image = text(data.image, 2048);
  const imageMediaId = image && /^[0-9A-HJKMNP-TV-Z]{26}$/.test(image) ? image : undefined;
  return {
    title: text(data.title, 240),
    description: text(data.description, 2000),
    image: imageMediaId ? undefined : siteUrl(image),
    imageMediaId,
    canonical: siteUrl(data.canonical),
    noIndex: data.noIndex === true,
  };
}
