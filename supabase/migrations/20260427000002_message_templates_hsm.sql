-- Migration: message_templates_hsm
-- Adds support for WhatsApp HSM (Highly Structured Message) templates.
-- HSM templates are pre-approved by Meta and required to start conversations
-- outside the 24-hour window. They use Twilio's Content API (ContentSid +
-- ContentVariables) instead of free-form Body.

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS is_hsm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS content_sid text,
  ADD COLUMN IF NOT EXISTS variable_keys text[],
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'unknown';

-- HSM templates need a content_sid (the HX... id from Twilio Content Editor).
-- Freeform templates need a body. Exactly one path must be filled.
ALTER TABLE message_templates
  DROP CONSTRAINT IF EXISTS message_templates_hsm_or_body;
ALTER TABLE message_templates
  ADD CONSTRAINT message_templates_hsm_or_body
  CHECK (
    (is_hsm = true AND content_sid IS NOT NULL)
    OR (is_hsm = false AND body IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS message_templates_is_hsm_idx
  ON message_templates(is_hsm) WHERE is_hsm = true;
