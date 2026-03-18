-- Migration: fix_templates_rls
-- The previous RLS policies only covered anon role.
-- Since the app uses Supabase Auth, authenticated users need access too.

-- Drop old policies that only covered anon
DROP POLICY IF EXISTS "public_all_message_templates" ON message_templates;
DROP POLICY IF EXISTS "public_all_dispatch_logs" ON dispatch_logs;

-- message_templates: allow all operations for both anon and authenticated
CREATE POLICY "all_message_templates"
  ON message_templates
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- dispatch_logs: allow all operations for both anon and authenticated
CREATE POLICY "all_dispatch_logs"
  ON dispatch_logs
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
