-- Migration: leads_rls
-- Enables RLS on leads table and grants full access to anon + authenticated roles.

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_leads"
  ON leads
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
