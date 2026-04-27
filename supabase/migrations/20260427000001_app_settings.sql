-- Migration: app_settings
-- Single-row config table. Edge Functions read these values at send time so the
-- user can change WhatsApp/SMS senders and the SendGrid email without redeploying
-- secrets. Sensitive tokens (TWILIO_AUTH_TOKEN, SENDGRID_API_KEY) stay in
-- Supabase Secrets, not in this table.

CREATE TABLE IF NOT EXISTS app_settings (
  id                    boolean PRIMARY KEY DEFAULT true,  -- enforces singleton
  twilio_whatsapp_from  text,
  twilio_sms_from       text,
  sendgrid_from_email   text,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = true)
);

DROP TRIGGER IF EXISTS app_settings_updated_at ON app_settings;
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed the single row so the UI always has something to read/write.
INSERT INTO app_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_app_settings" ON app_settings;
CREATE POLICY "all_app_settings"
  ON app_settings
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
