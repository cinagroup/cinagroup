import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

import { handleContactRequest } from '../../server/contact-core.js';

export const prerender = false;

const handleContact: APIRoute = ({ request, locals }) =>
  handleContactRequest({
    request,
    env,
    waitUntil: (promise: Promise<unknown>) => locals.cfContext.waitUntil(promise),
  });

export const GET = handleContact;
export const POST = handleContact;
export const ALL = handleContact;
