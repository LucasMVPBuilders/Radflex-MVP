# Design: Página de Disparos em Massa

**Data:** 2026-03-16
**Status:** Aprovado

---

## Visão Geral

Nova página `/disparos` que permite ao usuário selecionar leads (da sessão ou salvos no Supabase), compor mensagens com templates dinâmicos e disparar em massa via **WhatsApp** ou **Email** usando a API Twilio (WhatsApp via Twilio Messaging, Email via Twilio SendGrid).

---

## 1. Estrutura de Dados (Supabase)

### Tabela `message_templates`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Identificador único |
| `name` | text | Nome do template (ex: "Apresentação Clínica") |
| `channel` | text | `'whatsapp'` ou `'email'` |
| `subject` | text | Assunto (apenas para canal `email`, nullable) |
| `body` | text | Corpo da mensagem com variáveis `{{nomeEmpresa}}` etc. |
| `created_at` | timestamptz | Data de criação |

### Tabela `dispatch_logs`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid (PK) | Identificador único |
| `template_id` | uuid (FK) | Referência ao template usado |
| `lead_id` | text | ID do lead (referência a `leads.id`) |
| `channel` | text | `'whatsapp'` ou `'email'` |
| `status` | text | `'pending'` \| `'sent'` \| `'failed'` \| `'cancelled'` |
| `error_msg` | text | Mensagem de erro (nullable) |
| `sent_at` | timestamptz | Momento do envio (nullable) |
| `created_at` | timestamptz | Data de criação do log |

### Variáveis de template disponíveis
- `{{nomeEmpresa}}` → `lead.companyName`
- `{{cidade}}` → `lead.city`
- `{{estado}}` → `lead.state`
- `{{telefone}}` → `lead.phone`
- `{{email}}` → `lead.email`
- `{{cnae}}` → `lead.cnae`

---

## 2. Arquitetura de Componentes

### Rota nova
- **Path:** `/disparos`
- **Arquivo:** `src/pages/Disparos.tsx`
- **Acesso:** Link na sidebar (`AppSidebar`) com ícone `Send` do lucide-react

### Componentes novos
```
src/
  pages/
    Disparos.tsx              # Orquestrador de estado da página
  components/
    disparos/
      LeadSelector.tsx        # Área 1: seleção de leads com checkboxes
      TemplateEditor.tsx      # Área 2: CRUD de templates + preview
      DispatchProgress.tsx    # Área 3: progresso em tempo real + controles
```

### Layout da página `/disparos`

```
┌─────────────────────────────────────────────────────┐
│  1. SELEÇÃO DE LEADS                                │
│     Fonte: [Salvos] [Sessão]  Busca + filtro CNAE   │
│     Tabela com checkboxes — seleção individual      │
│     ou "Selecionar todos os filtrados"              │
├─────────────────────────────────────────────────────┤
│  2. CONFIGURAÇÃO DO DISPARO                         │
│     Canal: [WhatsApp] [Email]                       │
│     Template: [dropdown de templates] + [Novo]      │
│     Editor: nome, assunto (email), body             │
│     Preview com dados do 1º lead selecionado        │
├─────────────────────────────────────────────────────┤
│  3. EXECUÇÃO                                        │
│     Botão [Iniciar Disparo]                         │
│     Lista em tempo real: empresa | status           │
│     Botões [Pausar] [Cancelar]                      │
│     Resumo final: X enviados, Y falhas              │
└─────────────────────────────────────────────────────┘
```

---

## 3. Fluxo de Dados e Lógica de Disparo

### Fluxo completo
```
Usuário seleciona leads + escolhe/cria template
        ↓
[Iniciar Disparo]
        ↓
Frontend cria fila local: lead[] com status "pending"
        ↓
Loop sequencial (1 lead por vez, ~500ms de intervalo):
  1. Interpola variáveis no body (e subject) do template
  2. Chama Edge Function `send-message` com channel + to + message
  3. Atualiza status do lead na UI (sent / failed)
  4. Persiste resultado em dispatch_logs via Supabase client
        ↓
[Pausar]   → seta isPausedRef = true, loop aguarda
[Retomar]  → seta isPausedRef = false, loop continua
[Cancelar] → seta isCancelledRef = true, marca restantes como 'cancelled'
        ↓
Exibe resumo: X enviados com sucesso, Y falhas
```

### Controle de pausa/cancelamento
Implementado via React `ref` (não state) para evitar stale closures em loops assíncronos:
```ts
const isPausedRef = useRef(false);
const isCancelledRef = useRef(false);
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

### Persistência de templates
CRUD direto via Supabase client no frontend (sem Edge Function adicional).

---

## 4. Modificações em Arquivos Existentes

### `supabase/functions/send-message/index.ts`
- Adicionar `channel: 'email'` ao tipo `Channel`
- Adicionar função `sendEmailViaTwilioSendGrid()` usando a API REST do SendGrid (endpoint separado do Twilio SMS, mesma conta Twilio)
- Novas env vars necessárias: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`

### `src/components/AppSidebar.tsx`
- Adicionar item de navegação "Disparos" com ícone `Send` e link `/disparos`
- Recebe prop `currentPath` ou usa `useLocation()` para highlight ativo

### `src/App.tsx`
- Adicionar rota `<Route path="/disparos" element={<Disparos />} />`

---

## 5. Migrações SQL Necessárias

```sql
-- message_templates
CREATE TABLE message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  subject text,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- dispatch_logs
CREATE TABLE dispatch_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES message_templates(id) ON DELETE SET NULL,
  lead_id text NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_msg text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);
```

---

## 6. Escopo Fora deste Design (futuro)

- Agendamento de disparos (data/hora futura)
- Retry automático de falhas
- Histórico completo de campanhas com relatórios
- Limite de rate por canal (anti-spam)
