-- Migration: disparos
-- Creates message_templates and dispatch_logs tables

-- Trigger function for updated_at (idempotent)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Templates de mensagem
CREATE TABLE IF NOT EXISTS message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  subject text CHECK (channel != 'email' OR subject IS NOT NULL),
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TRIGGER message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Logs de disparo
CREATE TABLE IF NOT EXISTS dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES message_templates(id) ON DELETE SET NULL,
  lead_id text NOT NULL,
  lead_snapshot jsonb,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_msg text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);
