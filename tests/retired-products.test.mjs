import assert from 'node:assert/strict';
import test from 'node:test';
import { retiredProductRedirect, isRetiredProductLink } from '../src/emdash/retired-products.ts';

test('old product URLs redirect to the matching locale homepage without affecting other routes or sources', () => {
  for (const locale of ['en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr']) {
    const prefix = locale === 'en' ? '' : '/' + locale;
    const destination = prefix + '/';
    for (const suffix of ['', '/', '/setup/']) {
      assert.equal(retiredProductRedirect(prefix + '/cinaclaw' + suffix), destination);
      assert.equal(isRetiredProductLink('https://cinagroup.com' + prefix + '/cinaclaw' + suffix + '?source=old'), true);
    }
  }
  assert.equal(retiredProductRedirect('/en/cinaclaw/'), '/');
  assert.equal(retiredProductRedirect('/zh/%63inaclaw/'), '/zh/');
  for (const path of ['/cinaseek/', '/cinaskill/', '/blog/cinaclaw-news/', '/cinaclaw-other/', '/_emdash/admin/'])
    assert.equal(retiredProductRedirect(path), undefined);
  assert.equal(isRetiredProductLink('https://github.com/cinagroup/cinaclaw'), false);
});
