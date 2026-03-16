# Design: Página de Disparos em Massa

**Data:** 2026-03-16
**Status:** Aprovado

---

## Visão Geral

Nova página `/disparos` que permite ao usuário selecionar leads (da sessão ou salvos no Supabase), compor mensagens com templates dinâmicos e disparar em massa via **WhatsApp** ou **Email** usando a API Twilio (WhatsApp via Twilio Messaging, Email via Twilio SendGrid).

---

## 1. Estrutura de Dados (Supabase)

### Tabela `message_templates`
| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text NOT NULL | Nome do template |
| `channel` | text NOT NULL | CHECK `IN ('whatsapp', 'email')` |
| `subject` | text | CHECK `(channel != 'email' OR subject IS NOT NULL)` |
| `body` | text NOT NULL | Corpo com variáveis `{{nomeEmpresa}}` etc. |
| `created_at` | timestamptz | `now()` |
| `updated_at` | timestamptz | `now()`, atualizado via trigger |

### Tabela `dispatch_logs`
| Coluna | Tipo | Notas |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `template_id` | uuid FK | `REFERENCES message_templates(id) ON DELETE SET NULL` |
| `lead_id` | text NOT NULL | Prefixado: `saved:{uuid}` ou `session:{placeId}` |
| `lead_snapshot` | jsonb | `{companyName, phone, email, city, state, cnae}` ao momento do disparo |
| `channel` | text NOT NULL | CHECK `IN ('whatsapp', 'email')` |
| `status` | text NOT NULL | CHECK `IN ('pending', 'sent', 'failed', 'cancelled')`, default `'pending'` |
| `error_msg` | text | Nullable |
| `sent_at` | timestamptz | Nullable; preenchido pelo frontend ao confirmar envio (precisão MVP) |
| `created_at` | timestamptz | `now()` |

**Convenção de `lead_id`:**
- Lead salvo no Supabase → `saved:{leads.id}` (ex: `saved:abc-123`)
- Lead de sessão → `session:{placeId}` (ex: `session:ChIJxyz`)
- Isso evita colisões e permite identificar a origem no histórico

**Nota sobre `status` em `dispatch_logs`:** O status `'sending'` existe apenas como estado transitório na UI (interface `DispatchItem`) e **nunca é gravado** no banco. Apenas `'pending'`, `'sent'`, `'failed'` e `'cancelled'` são persistidos.

**Nota sobre `sent_at`:** É um timestamp definido pelo frontend (não pelo servidor). Para fins de MVP, a precisão é suficiente; não deve ser usado para auditoria crítica.

### Variáveis de template disponíveis
| Variável | Campo do lead |
|----------|--------------|
| `{{nomeEmpresa}}` | `lead.companyName` |
| `{{cidade}}` | `lead.city` |
| `{{estado}}` | `lead.state` |
| `{{telefone}}` | `lead.phone` (após normalização E.164) |
| `{{email}}` | `lead.email` |
| `{{cnae}}` | `lead.cnae` |

---

## 2. Arquitetura de Componentes

### Rota nova
- **Path:** `/disparos`
- **Arquivo:** `src/pages/Disparos.tsx`
- **Acesso:** Link na sidebar com ícone `Send` do lucide-react

### Sidebar em múltiplas páginas
`AppSidebar` recebe props opcionais para os controles específicos da página Index (filtros CNAE, exportação etc.). Quando renderizado em `/disparos`, essas props serão omitidas / passadas como vazias. A navegação entre páginas usa o componente `NavLink` existente em `src/components/NavLink.tsx` (wrapper de `react-router-dom` com suporte a `isActive`/`isPending`), evitando `<a href>` que quebraria o roteamento client-side.

### Componentes novos
```
src/
  pages/
    Disparos.tsx                    # Orquestrador de estado
  components/
    disparos/
      LeadSelector.tsx              # Seleção de leads com checkboxes
      TemplateEditor.tsx            # CRUD de templates + preview
      DispatchProgress.tsx          # Progresso em tempo real
```

### Contratos de tipos
```ts
interface DispatchItem {
  lead: Lead;
  // 'sending' é UI-only — NUNCA gravado em dispatch_logs
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  error?: string;
}

interface DispatchProgressProps {
  items: DispatchItem[];
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  sentCount: number;
  failedCount: number;
  isRunning: boolean;
}
```

### Layout da página `/disparos`

```
┌─────────────────────────────────────────────────────┐
│  1. SELEÇÃO DE LEADS                                │
│     Fonte: [Salvos] [Sessão]  Busca + filtro CNAE   │
│     Tabela com checkboxes — seleção individual      │
│     Botão "Selecionar todos os filtrados"           │
│     Botão de disparo desabilitado se 0 selecionados │
├─────────────────────────────────────────────────────┤
│  2. CONFIGURAÇÃO DO DISPARO                         │
│     Canal: [WhatsApp] [Email]                       │
│     Template: [dropdown de templates] + [Novo]      │
│     Editor: nome, assunto (email), body             │
│     Preview com dados do 1º lead selecionado        │
│     Aviso: "X leads sem telefone serão pulados"     │
│     Aviso: "X leads sem email serão pulados"        │
├─────────────────────────────────────────────────────┤
│  3. EXECUÇÃO                                        │
│     Botão [Iniciar Disparo] (disabled se 0 leads)   │
│     Lista em tempo real: empresa | status           │
│     Botões [Pausar] [Retomar] [Cancelar]            │
│     Resumo final: X enviados, Y falhas, Z pulados   │
└─────────────────────────────────────────────────────┘
```

---

## 3. Fluxo de Dados e Lógica de Disparo

### Validações antes do disparo
1. Pelo menos 1 lead selecionado (botão desabilitado caso contrário)
2. Template selecionado ou criado
3. Aviso (não bloqueante) com contagem de leads sem o contato necessário

### Fluxo completo
```
Usuário seleciona leads + escolhe/cria template
        ↓
[Iniciar Disparo]
        ↓
Frontend cria fila local: DispatchItem[] com status "pending"
        ↓
Loop sequencial (1 lead por vez, ~500ms de intervalo):
  1. Normaliza contato via normalizeContact(lead, channel)
     → retorna null se inválido → pula lead (status: 'cancelled')
  2. Interpola variáveis: interpolate(template.body, lead)
  3. Chama Edge Function `send-message`:
     { channel, to, message, subject? (só email) }
  4. Atualiza DispatchItem na UI (sending → sent / failed)
  5. Persiste em dispatch_logs:
     { lead_id: prefixed, lead_snapshot, channel, status, sent_at?, error_msg? }
        ↓
[Pausar]   → isPausedRef = true; loop aguarda polling a cada 200ms
[Retomar]  → isPausedRef = false
[Cancelar] → isCancelledRef = true; itens restantes → 'cancelled'
        ↓
Resumo final: X enviados, Y falhas, Z pulados/cancelados
```

### Normalização de contato
```ts
function normalizeContact(lead: Lead, channel: 'whatsapp' | 'email'): string | null {
  if (channel === 'email') {
    return lead.email?.includes('@') ? lead.email : null;
  }
  // WhatsApp → E.164 brasileiro
  const digits = (lead.phone ?? '').replace(/\D/g, '');
  // Aceita 10 dígitos (fixo) ou 11 (celular com 9)
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  // Já com código do país (55 + 10/11 dígitos)
  if (digits.length === 12 || digits.length === 13) return `+${digits}`;
  return null; // inválido → pular
}
```

### Interpolação de variáveis
```ts
function interpolate(template: string, lead: Lead): string {
  return template
    .replace(/{{nomeEmpresa}}/g, lead.companyName)
    .replace(/{{cidade}}/g, lead.city)
    .replace(/{{estado}}/g, lead.state)
    .replace(/{{telefone}}/g, lead.phone ?? '')
    .replace(/{{email}}/g, lead.email ?? '')
    .replace(/{{cnae}}/g, lead.cnae);
}
```

### Controle de pausa/cancelamento
```ts
const isPausedRef = useRef(false);
const isCancelledRef = useRef(false);

// No loop, antes de cada envio:
while (isPausedRef.current && !isCancelledRef.current) {
  await sleep(200);
}
if (isCancelledRef.current) break;
```

---

## 4. Modificações em Arquivos Existentes

### `supabase/functions/send-message/index.ts`
- Atualizar tipo: `type Channel = 'whatsapp' | 'sms' | 'email'`
- Adicionar `subject?: string` ao `SendMessagePayload`
- Adicionar função `sendEmailViaSendGrid(to, subject, body)`:
  - Endpoint: `POST https://api.sendgrid.com/v3/mail/send`
  - Auth: `Authorization: Bearer ${SENDGRID_API_KEY}`
  - From: `SENDGRID_FROM_EMAIL`
  - O campo `to` para email = endereço de email do lead (string simples, sem prefixo)
- **Atualizar o guard de validação de canal** (linha ~94):
  - De: `!['whatsapp', 'sms'].includes(channel)`
  - Para: `!['whatsapp', 'sms', 'email'].includes(channel)`
- Novas env vars: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`

### `src/components/AppSidebar.tsx`
- Tornar props de Index opcionais (com defaults vazios)
- Adicionar link de navegação "Disparos" usando `NavLink` de `src/components/NavLink.tsx`
- Ícone: `Send` do lucide-react

### `src/App.tsx`
- Adicionar `import Disparos from './pages/Disparos.tsx'`
- Adicionar `<Route path="/disparos" element={<Disparos />} />`

---

## 5. Migrações SQL

```sql
-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- message_templates
CREATE TABLE message_templates (
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

-- dispatch_logs
CREATE TABLE dispatch_logs (
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
```

---

## 6. Escopo Fora deste Design (futuro)

- Autenticação e isolamento por usuário (multi-tenant)
- Agendamento de disparos (data/hora futura)
- Retry automático de falhas
- Deduplicação de envios (mesmo lead + template)
- Histórico completo de campanhas com relatórios
- Rate limiting por canal (anti-spam)
