-- Migration: pipeline_rls
-- Enables public (anon) access for MVP pipeline tables

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all_pipeline_stages"
  ON pipeline_stages
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public_all_pipeline_leads"
  ON pipeline_leads
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public_all_conversation_messages"
  ON conversation_messages
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
