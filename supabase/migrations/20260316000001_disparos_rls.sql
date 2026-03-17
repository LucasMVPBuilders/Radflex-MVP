-- Migration: disparos_rls
-- Enables public (anon) access on message_templates and dispatch_logs
-- This app does not use Supabase Auth, so anon role needs full access.

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatch_logs ENABLE ROW LEVEL SECURITY;

-- message_templates: allow all operations for anon
CREATE POLICY "public_all_message_templates"
  ON message_templates
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- dispatch_logs: allow all operations for anon
CREATE POLICY "public_all_dispatch_logs"
  ON dispatch_logs
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
