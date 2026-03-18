-- Migration: pipeline
-- Creates editable kanban stages, pipeline leads and conversation messages

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  position integer NOT NULL,
  color text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pipeline_stages_updated_at ON pipeline_stages;
CREATE TRIGGER pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS pipeline_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL UNIQUE,
  dispatch_log_id uuid REFERENCES dispatch_logs(id) ON DELETE SET NULL,
  current_stage_id uuid NOT NULL REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  primary_channel text NOT NULL CHECK (primary_channel IN ('whatsapp', 'email')),
  contact_phone text,
  contact_email text,
  latest_message_preview text,
  latest_message_at timestamptz,
  latest_direction text CHECK (latest_direction IN ('inbound', 'outbound')),
  unread_count integer NOT NULL DEFAULT 0,
  lead_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS pipeline_leads_updated_at ON pipeline_leads;
CREATE TRIGGER pipeline_leads_updated_at
  BEFORE UPDATE ON pipeline_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_lead_id uuid NOT NULL REFERENCES pipeline_leads(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  provider_message_id text UNIQUE,
  body text NOT NULL,
  status text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_stages_position_idx
  ON pipeline_stages(position);

CREATE INDEX IF NOT EXISTS pipeline_leads_stage_idx
  ON pipeline_leads(current_stage_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS pipeline_leads_latest_message_idx
  ON pipeline_leads(latest_message_at DESC);

CREATE INDEX IF NOT EXISTS pipeline_leads_contact_phone_idx
  ON pipeline_leads(contact_phone);

CREATE INDEX IF NOT EXISTS conversation_messages_pipeline_lead_idx
  ON conversation_messages(pipeline_lead_id, created_at ASC);

INSERT INTO pipeline_stages (key, name, position, color, is_system, is_active)
VALUES
  ('dispatch_started', 'Disparo iniciado', 0, '#5B2ECC', true, true),
  ('replied', 'Respondeu', 1, '#0EA5E9', true, true),
  ('qualified', 'Qualificado', 2, '#10B981', true, true),
  ('proposal', 'Proposta', 3, '#F59E0B', true, true),
  ('closed', 'Fechado', 4, '#EF4444', true, true)
ON CONFLICT (key) DO NOTHING;
