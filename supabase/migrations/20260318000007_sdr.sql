-- SDR Qualificação (prompt dinâmico + decisão qualificado/desqualificado)

-- Config de prompt
CREATE TABLE IF NOT EXISTS sdr_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Default',
  prompt text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Reutiliza a função de updated_at já existente no projeto; cria caso ainda não exista.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sdr_prompts_updated_at ON sdr_prompts;
CREATE TRIGGER sdr_prompts_updated_at
  BEFORE UPDATE ON sdr_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Campos de resultado no lead
ALTER TABLE pipeline_leads
  ADD COLUMN IF NOT EXISTS sdr_last_summary text,
  ADD COLUMN IF NOT EXISTS sdr_last_reason text,
  ADD COLUMN IF NOT EXISTS sdr_last_json jsonb,
  ADD COLUMN IF NOT EXISTS sdr_last_run_at timestamptz;

-- Etapa padrão para desqualificado (usada pelo SDR)
INSERT INTO pipeline_stages (key, name, position, color, is_system, is_active)
VALUES
  ('desqualified', 'Desqualificado', 5, '#6B7280', false, true)
ON CONFLICT (key) DO NOTHING;

-- RLS (MVP): libera acesso total para `anon` e `authenticated`
ALTER TABLE sdr_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "all_sdr_prompts" ON sdr_prompts;
CREATE POLICY "all_sdr_prompts"
  ON sdr_prompts
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

