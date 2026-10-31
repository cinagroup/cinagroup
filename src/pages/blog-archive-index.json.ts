import type { APIRoute } from 'astro';
import { fetchBlogArchiveIndex } from '~/utils/blog-archive-data';

export const prerender = true;

export const GET: APIRoute = async () => {
  const entries = await fetchBlogArchiveIndex();

  return new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
};
