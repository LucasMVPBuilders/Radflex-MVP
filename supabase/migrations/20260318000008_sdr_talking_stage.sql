-- Stage do SDR conversando

INSERT INTO pipeline_stages (key, name, position, color, is_system, is_active)
VALUES
  ('sdr_talking', 'Em contato', 1, '#A855F7', false, true)
ON CONFLICT (key) DO NOTHING;

