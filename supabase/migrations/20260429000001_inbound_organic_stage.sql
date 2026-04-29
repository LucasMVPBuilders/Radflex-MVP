-- Stage para inbound organico (lead que mandou mensagem sem ter sido disparado)
-- Necessario porque o twilio-webhook agora cria pipeline_lead automaticamente
-- quando recebe inbound de um numero sem dispatch previo (link wa.me, anuncio, etc).

-- Position 0 (mesmo do dispatch_started) porque ambos sao entradas do funil:
-- dispatch_started = lead que voce contatou; inbound_organic = lead que te contatou.
INSERT INTO pipeline_stages (key, name, position, color, is_system, is_active)
VALUES
  ('inbound_organic', 'Inbound novo', 0, '#06B6D4', true, true)
ON CONFLICT (key) DO NOTHING;
