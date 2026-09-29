-- D1 cannot alter a CHECK constraint in place. Preserve existing submissions while
-- rebuilding the table with the Chinese locale accepted by the contact handler.
CREATE TABLE contact_submissions_zh (
  submission_id TEXT PRIMARY KEY NOT NULL,
  created_at TEXT NOT NULL,
  retention_until TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('en', 'zh', 'ja', 'ko', 'ru', 'es', 'pt', 'fr')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  subject TEXT NOT NULL CHECK (
    subject IN (
      'product-workflow',
      'search-knowledge',
      'automation',
      'api-model-gateway',
      'infrastructure-delivery',
      'other'
    )
  ),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'reviewing', 'closed')),
  notification_status TEXT NOT NULL DEFAULT 'not_configured' CHECK (
    notification_status IN ('not_configured', 'pending', 'sent')
  ),
  notification_attempted_at TEXT,
  notification_error TEXT,
  source_host TEXT NOT NULL
);

INSERT INTO contact_submissions_zh (
  submission_id, created_at, retention_until, locale, name, email, company,
  subject, message, status, notification_status, notification_attempted_at,
  notification_error, source_host
)
SELECT
  submission_id, created_at, retention_until, locale, name, email, company,
  subject, message, status, notification_status, notification_attempted_at,
  notification_error, source_host
FROM contact_submissions;

DROP TABLE contact_submissions;
ALTER TABLE contact_submissions_zh RENAME TO contact_submissions;

CREATE INDEX idx_contact_submissions_created_at
  ON contact_submissions (created_at DESC);

CREATE INDEX idx_contact_submissions_retention
  ON contact_submissions (retention_until);

CREATE INDEX idx_contact_submissions_notification
  ON contact_submissions (notification_status, created_at);
