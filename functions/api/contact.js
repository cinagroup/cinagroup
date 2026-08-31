// @ts-check

import { handleContactRequest } from '../../src/server/contact-core.js';

/** @typedef {import('../env.js').ContactPagesEnv} ContactPagesEnv */

/** @param {EventContext<ContactPagesEnv, string, unknown>} context */
export function onRequest(context) {
  return handleContactRequest(context);
}
