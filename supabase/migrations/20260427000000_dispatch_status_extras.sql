-- Migration: dispatch_status_extras
-- Adds delivery/read/reply tracking columns and provider correlation to dispatch_logs.
-- Supports the new Histórico screen and the "do not redispatch" workflow.

-- 1. Drop the existing CHECK constraint to extend the allowed status set.
ALTER TABLE dispatch_logs DROP CONSTRAINT IF EXISTS dispatch_logs_status_check;

ALTER TABLE dispatch_logs
  ADD CONSTRAINT dispatch_logs_status_check
  CHECK (status IN (
    'pending', 'queued', 'sent', 'delivered', 'read',
    'replied', 'failed', 'cancelled', 'undelivered'
  ));

-- 2. New tracking columns
ALTER TABLE dispatch_logs
  ADD COLUMN IF NOT EXISTS delivered_at        timestamptz,
  ADD COLUMN IF NOT EXISTS read_at             timestamptz,
  ADD COLUMN IF NOT EXISTS replied_at          timestamptz,
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS provider_status     text,
  ADD COLUMN IF NOT EXISTS contact_value       text,  -- normalized phone or email used in send
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz NOT NULL DEFAULT now();

-- 3. Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS dispatch_logs_updated_at ON dispatch_logs;
CREATE TRIGGER dispatch_logs_updated_at
  BEFORE UPDATE ON dispatch_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 4. Indexes for the queries this migration unlocks
--    a) provider lookup from Twilio status callbacks
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_logs_provider_message_id_idx
  ON dispatch_logs(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

--    b) dedup lookup: "was this contact dispatched in the last N days?"
CREATE INDEX IF NOT EXISTS dispatch_logs_contact_recent_idx
  ON dispatch_logs(contact_value, channel, sent_at DESC)
  WHERE contact_value IS NOT NULL AND status = 'sent';

--    c) histórico screen ordering
CREATE INDEX IF NOT EXISTS dispatch_logs_created_at_idx
  ON dispatch_logs(created_at DESC);

--    d) filter by status
CREATE INDEX IF NOT EXISTS dispatch_logs_status_idx
  ON dispatch_logs(status, created_at DESC);

-- 5. Backfill contact_value from existing lead_snapshot rows so older logs
--    participate in dedup checks. Whatsapp logs use phone, email logs use email.
UPDATE dispatch_logs
SET contact_value = lead_snapshot->>'phone'
WHERE channel = 'whatsapp'
  AND contact_value IS NULL
  AND lead_snapshot ? 'phone';

UPDATE dispatch_logs
SET contact_value = lead_snapshot->>'email'
WHERE channel = 'email'
  AND contact_value IS NULL
  AND lead_snapshot ? 'email';
