import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { handleContactRequest } from '../src/server/contact-core.js';

const readMigration = (name) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
const previewHost = 'cinagroup-emdash-preview.account.workers.dev';

function d1Adapter(database) {
  return {
    prepare(sql) {
      const statement = database.prepare(sql);
      return {
        bind(...values) {
          return {
            async first() {
              return statement.get(...values) ?? null;
            },
            async run() {
              const result = statement.run(...values);
              return { success: true, meta: { changes: Number(result.changes) } };
            },
          };
        },
      };
    },
  };
}

test('contact migration preserves existing rows and accepts a Chinese preview submission', async () => {
  const database = new DatabaseSync(':memory:');

  try {
    database.exec(readMigration('0001_contact_submissions.sql'));
    const insert = database.prepare(`INSERT INTO contact_submissions (
      submission_id, created_at, retention_until, locale, name, email, subject, message, source_host
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const legacy = [
      'legacy-en-1',
      '2026-08-01T00:00:00.000Z',
      '2027-08-01T00:00:00.000Z',
      'en',
      'Existing contact',
      'existing@example.com',
      'other',
      'Preserve this row and its constraints.',
      'cinagroup.com',
    ];
    insert.run(...legacy);
    assert.throws(
      () => insert.run(...legacy.map((value, index) => (index === 0 ? 'legacy-zh-probe' : index === 3 ? 'zh' : value))),
      /CHECK constraint/
    );

    database.exec(readMigration('0002_contact_zh_locale.sql'));
    const preserved = database.prepare('SELECT * FROM contact_submissions WHERE submission_id = ?').get('legacy-en-1');
    assert.equal(preserved?.locale, 'en');
    assert.equal(preserved?.message, legacy[7]);
    assert.equal(preserved?.notification_status, 'not_configured');

    const request = new Request(`https://${previewHost}/api/contact`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Origin: `https://${previewHost}`,
      },
      body: JSON.stringify({
        submission_id: '0198f5d0-7c8c-7a31-9f00-123456789abc',
        locale: 'zh',
        name: 'Chinese contact',
        email: 'contact@example.com',
        subject: 'product-workflow',
        message: 'Please contact me about the product workflow.',
        website: '',
        'cf-turnstile-response': 'test-widget-token',
      }),
    });
    const response = await handleContactRequest(
      {
        request,
        env: {
          CONTACT_DB: d1Adapter(database),
          TURNSTILE_SECRET_KEY: 'test-secret-placeholder',
          TURNSTILE_PREVIEW_HOSTNAME: previewHost,
        },
        waitUntil() {},
      },
      {
        now: () => new Date('2026-09-29T00:00:00.000Z'),
        fetch: async () => Response.json({ success: true, action: 'contact', hostname: previewHost }),
      }
    );

    assert.equal(response.status, 201);
    assert.equal(
      database
        .prepare('SELECT locale FROM contact_submissions WHERE submission_id = ?')
        .get('0198f5d0-7c8c-7a31-9f00-123456789abc')?.locale,
      'zh'
    );
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM contact_submissions').get().count, 2);

    const invalidInsert = database.prepare(`INSERT INTO contact_submissions (
      submission_id, created_at, retention_until, locale, name, email, subject, message, source_host
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    assert.throws(
      () =>
        invalidInsert.run(
          ...legacy.map((value, index) => (index === 0 ? 'invalid-locale' : index === 3 ? 'de' : value))
        ),
      /CHECK constraint/
    );
    assert.throws(
      () =>
        invalidInsert.run(
          ...legacy.map((value, index) => (index === 0 ? 'invalid-subject' : index === 6 ? 'invalid' : value))
        ),
      /CHECK constraint/
    );

    const indexes = database
      .prepare("PRAGMA index_list('contact_submissions')")
      .all()
      .map((row) => row.name);
    assert.ok(indexes.includes('idx_contact_submissions_created_at'));
    assert.ok(indexes.includes('idx_contact_submissions_retention'));
    assert.ok(indexes.includes('idx_contact_submissions_notification'));
  } finally {
    database.close();
  }
});
