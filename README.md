# Radiflex — LeadScout

Plataforma de prospecção B2B por CNAE. Busca empresas reais do Google Maps via **Apify** e exibe leads qualificados com telefone, website, avaliação e endereço completo.

---

## Índice

- [Visão Geral](#visão-geral)
- [Stack Tecnológica](#stack-tecnológica)
- [Arquitetura](#arquitetura)
- [Fluxo de Dados](#fluxo-de-dados)
- [Infraestrutura — Supabase](#infraestrutura--supabase)
- [Integração Apify](#integração-apify)
- [Estrutura de Pastas](#estrutura-de-pastas)
- [Tipos de Dados](#tipos-de-dados)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Secrets do Supabase](#secrets-do-supabase)
- [Como Rodar Localmente](#como-rodar-localmente)
- [Como Usar o App](#como-usar-o-app)
- [Histórico de Decisões](#histórico-de-decisões)

---

## Visão Geral

O **Radiflex LeadScout** permite que equipes comerciais descubram empresas por código CNAE usando dados reais do Google Maps. O usuário adiciona um CNAE na sidebar, o sistema dispara um scraping via Apify e retorna até 20 empresas com dados enriquecidos.

**Casos de uso principais:**
- Prospecção de clínicas de radiologia, tomografia e ultrassonografia (CNAEs `8640-2/05`, `8640-2/04`, `8640-2/07`)
- Qualquer setor com código CNAE válido
- Exportação futura para CRM

---

## Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 |
| UI | shadcn/ui + Radix UI + Tailwind CSS |
| Animações | Framer Motion |
| Ícones | Lucide React |
| Notificações | Sonner (toast) |
| Backend (BaaS) | Supabase (Edge Functions + Secrets) |
| Scraping | Apify — Actor `compass/crawler-google-places` |
| Runtime Edge | Deno (dentro das Edge Functions Supabase) |
| Testes | Vitest + Testing Library + Playwright |
| Build | Vite + SWC |

---

## Arquitetura

```
┌─────────────────────────────────────────────┐
│               Frontend (React)              │
│                                             │
│  AppSidebar → adiciona CNAE                 │
│      ↓                                      │
│  Index.tsx → chama searchLeadsByCnae()      │
│      ↓                                      │
│  src/lib/api/searchLeads.ts                 │
│      ↓  (supabase.functions.invoke)         │
└─────────────────────────────────────────────┘
                     ↓ HTTPS
┌─────────────────────────────────────────────┐
│       Supabase Edge Function (Deno)         │
│       search-cnae  [verify_jwt: false]      │
│                                             │
│  1. Lê APIFY_API_TOKEN dos secrets          │
│  2. Monta query de busca por CNAE           │
│  3. Dispara run assíncrono no Apify         │
│  4. Polling até run.status = SUCCEEDED      │
│  5. Busca itens do dataset                  │
│  6. Mapeia para formato Lead[]              │
└─────────────────────────────────────────────┘
                     ↓ REST API
┌─────────────────────────────────────────────┐
│           Apify Platform                    │
│   Actor: compass/crawler-google-places      │
│   Input: searchStringsArray, countryCode    │
│   Output: Google Places com nome, tel,      │
│           endereço, website, rating         │
└─────────────────────────────────────────────┘
```

---

## Fluxo de Dados

1. Usuário digita código CNAE (ex: `8640-2/05`) + nome curto na sidebar
2. `addCnae()` em `Index.tsx` chama `fetchLeadsForCnae(code)`
3. `searchLeadsByCnae(cnae, estado?)` invoca a Edge Function via SDK Supabase
4. A Edge Function:
   - Mapeia o código CNAE limpo (ex: `8640205`) para uma descrição legível
   - Monta query: `"clínica radiologia diagnóstico imagem SP Brasil"`
   - Dispara POST em `https://api.apify.com/v2/acts/compass~crawler-google-places/runs`
   - Faz polling a cada 4s até `status = SUCCEEDED` (máx 90s)
   - Busca resultados em `GET /datasets/{datasetId}/items`
   - Converte para `Lead[]` com faturamento estimado por número de reviews
5. Frontend recebe `{ success, leads[], total }` e renderiza na `LeadsTable`
6. Clique em "Detalhes" abre painel `LeadDetail` com todos os campos

---

## Infraestrutura — Supabase

- **Projeto ID:** `cxrhpfywlbtcsrgxydhn`
- **URL:** `https://cxrhpfywlbtcsrgxydhn.supabase.co`
- **Edge Function:** `search-cnae` (versão 7, `verify_jwt: false`)
- **Secret configurado:** `APIFY_API_TOKEN`

### Edge Function `search-cnae`

| Campo | Valor |
|-------|-------|
| Slug | `search-cnae` |
| Versão atual | 7 |
| JWT obrigatório | Não (público) |
| Timeout máx | 90s (polling interno) |
| Memória Apify | 256 MB por run |

**Endpoint:**
```
POST https://cxrhpfywlbtcsrgxydhn.supabase.co/functions/v1/search-cnae
Content-Type: application/json
apikey: <SUPABASE_PUBLISHABLE_KEY>

Body: { "cnae": "8640-2/05", "estado": "SP" }
```

**Resposta de sucesso:**
```json
{
  "success": true,
  "leads": [...],
  "total": 20,
  "pages": 1,
  "currentPage": 1
}
```

---

## Integração Apify

- **Actor usado:** `compass/crawler-google-places`
- **Token:** configurado como secret `APIFY_API_TOKEN` no Supabase
- **Modo de chamada:** assíncrono (dispara run → polling → busca dataset)
- **Campos retornados por lugar:**
  - `placeId` — ID único do Google Place
  - `title` — nome da empresa
  - `address` — endereço completo
  - `phone` — telefone com DDD
  - `website` — site oficial
  - `totalScore` — nota no Google (0–5)
  - `reviewsCount` — número de avaliações

**Parâmetros enviados ao Actor:**
```json
{
  "searchStringsArray": ["clínica radiologia diagnóstico imagem SP Brasil"],
  "maxCrawledPlacesPerSearch": 20,
  "countryCode": "br"
}
```

**Lógica de estimativa de faturamento** (sem acesso a dados financeiros reais):

| Reviews | Faturamento estimado |
|---------|---------------------|
| > 500 | R$ 3M – R$ 8M |
| > 200 | R$ 1,5M – R$ 4,5M |
| > 50 | R$ 500K – R$ 2M |
| > 10 | R$ 200K – R$ 700K |
| ≤ 10 | R$ 100K – R$ 400K |

---

## Estrutura de Pastas

```
src/
├── components/
│   ├── AppSidebar.tsx      # Sidebar fixa: filtros CNAE, stats, form adicionar
│   ├── LeadsTable.tsx      # Tabela ordenável de leads
│   ├── LeadDetail.tsx      # Painel lateral com detalhes (website, rating, etc.)
│   ├── TopBar.tsx          # Barra superior com busca e contador
│   ├── NavLink.tsx         # Componente de link de navegação
│   └── ui/                 # Componentes shadcn/ui (49 componentes)
├── data/
│   ├── types.ts            # Interfaces: Lead, CnaeCode, Filters
│   └── mockLeads.ts        # Dados mock (não usado no fluxo principal)
├── lib/
│   ├── api/
│   │   └── searchLeads.ts  # Camada de serviço: chama Edge Function
│   └── utils.ts            # Utilitários (cn, etc.)
├── integrations/
│   └── supabase/
│       └── client.ts       # Instância do cliente Supabase
├── pages/
│   └── Index.tsx           # Página principal: orquestra estado e chamadas
├── hooks/                  # Hooks customizados
└── test/                   # Testes Vitest
```

---

## Tipos de Dados

### `Lead`
```typescript
interface Lead {
  id: string;              // placeId do Google ou índice
  companyName: string;     // nome da empresa
  cnae: string;            // código CNAE buscado
  estimatedRevenue: number;// estimativa em R$ baseada em reviews
  city: string;            // cidade extraída do endereço
  state: string;           // UF extraída do endereço
  phone: string;           // telefone com DDD
  email: string;           // vazio (Google Places não expõe)
  status: "new" | "found" | "exported";
  cnpj: string;            // vazio (não disponível via Google Places)
  website?: string;        // site oficial
  address?: string;        // endereço completo
  rating?: number;         // nota Google (0–5)
  reviewsCount?: number;   // número de avaliações
}
```

### `CnaeCode`
```typescript
interface CnaeCode {
  code: string;        // ex: "8640-2/05"
  description: string; // descrição completa
  shortName: string;   // nome curto para exibição
}
```

---

## Variáveis de Ambiente

Arquivo `.env` na raiz do projeto (não versionado):

```env
VITE_SUPABASE_PROJECT_ID="seu-project-id"
VITE_SUPABASE_PUBLISHABLE_KEY="sua-publishable-key"
VITE_SUPABASE_URL="https://seu-project-id.supabase.co"
```

---

## Secrets do Supabase

Configurados em: **Dashboard → Project → Edge Functions → Secrets**

| Secret | Descrição |
|--------|-----------|
| `APIFY_API_TOKEN` | Token da API Apify para scraping do Google Places |

> **Atenção:** O secret `CNPJWS_API_TOKEN` (modelo anterior) foi **removido** e substituído pelo `APIFY_API_TOKEN`. A Edge Function não depende mais da API CNPJ.ws.

---

## Como Rodar Localmente

```sh
# 1. Clonar o repositório
git clone <URL_DO_REPO>
cd Radiflex

# 2. Instalar dependências
npm install
# ou com bun:
bun install

# 3. Criar arquivo de variáveis de ambiente
cp .env.example .env
# Preencher com as chaves do Supabase

# 4. Iniciar servidor de desenvolvimento
npm run dev
# Disponível em http://localhost:5173

# 5. Rodar testes unitários
npm test

# 6. Build de produção
npm run build
```

---

## Como Usar o App

1. **Adicionar um CNAE:** clique no `+` na sidebar → preencha o código (ex: `8640-2/05`) e um nome curto → clique em "Adicionar e Buscar"
2. **Aguardar:** o scraping leva entre 40–90 segundos (indicador de loading na TopBar)
3. **Visualizar leads:** a tabela exibe empresa, CNAE, faturamento estimado, UF e contatos
4. **Filtrar:** use a barra de busca para filtrar por nome da empresa
5. **Ver detalhes:** clique em qualquer linha ou no botão "Detalhes" para abrir o painel lateral com website, endereço completo, rating e número de avaliações
6. **Múltiplos CNAEs:** adicione quantos CNAEs quiser — cada um busca de forma independente
7. **Toggle de filtro:** clique no CNAE na sidebar para mostrar/ocultar seus leads
8. **Remover CNAE:** passe o mouse sobre o CNAE na sidebar e clique no `×`

---

## Histórico de Decisões

### ADR-001 — Migração de CNPJ.ws para Apify (2026-03-16)

**Contexto:** A integração original usava a API comercial CNPJ.ws para buscar empresas por CNAE. O modelo requeria token pago e retornava apenas CNPJs que precisavam de enriquecimento via API pública.

**Decisão:** Substituir completamente pela API da Apify usando o Actor `compass/crawler-google-places`, que retorna dados enriquecidos diretamente do Google Maps (nome, telefone, website, endereço, rating).

**Consequências:**
- ✅ Dados mais ricos (telefone, website, rating em uma única chamada)
- ✅ Sem necessidade de enriquecimento adicional via BrasilAPI
- ✅ Funciona para qualquer setor, não apenas saúde
- ⚠️ CNPJ não disponível (Google Places não expõe)
- ⚠️ Tempo de resposta maior (40–90s vs ~5s) — resolvido com polling assíncrono
- ⚠️ Estimativa de faturamento baseada em reviews (heurística, não dado real)

### ADR-002 — Chamada assíncrona com polling (2026-03-16)

**Contexto:** O endpoint `run-sync` da Apify tem timeout de ~55s que não é suficiente para o Actor concluir.

**Decisão:** Usar fluxo assíncrono: POST para criar o run → polling do status a cada 4s → GET do dataset quando `SUCCEEDED`.

**Parâmetros:**
- Intervalo de polling: 4 segundos
- Timeout máximo: 90 segundos
- Memória do Actor: 256 MB

### ADR-003 — Edge Function sem JWT (2026-03-16)

**Contexto:** O frontend chama a Edge Function diretamente com a chave pública (`publishable key`). Não há autenticação de usuário implementada.

**Decisão:** Manter `verify_jwt: false` para simplificar o MVP. Em produção, considerar autenticação por usuário autenticado no Supabase.

---

*Última atualização: 2026-03-16 | Projeto: Radiflex LeadScout*
