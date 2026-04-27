# RadiFlex - Manual Completo da API de Scraping

Manual tecnico documentando toda a arquitetura de scraping de leads via Google Places (Apify).

---

## 1. Visao Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                             │
│                                                                     │
│  AppSidebar ──> Index.tsx ──> searchLeadsByCnae() ──> LeadsTable   │
│  (add CNAE)     (orquestra)   (src/lib/api/searchLeads.ts)          │
└────────────────────────────┬────────────────────────────────────────┘
                             │ supabase.functions.invoke("search-cnae")
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                SUPABASE EDGE FUNCTION                                │
│                supabase/functions/search-cnae/index.ts               │
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────────────┐  │
│  │  handleStart  │────>│  Apify API   │────>│ Retorna runId +    │  │
│  │  (inicia run) │     │  POST /runs  │     │ datasetId ao front │  │
│  └──────────────┘     └──────────────┘     └────────────────────┘  │
│                                                                     │
│  ┌──────────────┐     ┌──────────────┐     ┌────────────────────┐  │
│  │  handlePoll   │────>│ Apify status │────>│ Se SUCCEEDED:      │  │
│  │  (verifica)   │     │ GET /runs/id │     │ busca dataset,     │  │
│  │              │     │              │     │ mapeia leads,      │  │
│  │              │     │              │     │ persiste no DB     │  │
│  └──────────────┘     └──────────────┘     └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                             │
                             │ Persistencia assincrona
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     SUPABASE (PostgreSQL)                            │
│                                                                     │
│  scraping_runs ──> leads ──> cnae_filters                           │
│  (historico)       (dados)   (filtros ativos)                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Fluxo Completo Passo a Passo

### Passo 1: Usuario adiciona um CNAE

**Arquivo:** `src/pages/Index.tsx` - funcao `addCnae()`

```
Usuario digita CNAE na sidebar (ex: 8640205 - Radiologia)
  │
  ├── Salva no Supabase: tabela `cnae_filters` (upsert)
  ├── Adiciona ao estado local: cnaeCodes[] e activeCnaes[]
  └── Chama fetchLeadsForCnae(code, false, 0, ...)
```

Os campos salvos em `cnae_filters`:
- `code`: codigo CNAE (ex: "8640205")
- `short_name`: nome curto (ex: "Radiologia")
- `description`: descricao completa
- `is_active`: boolean (filtro ativo ou nao)

### Passo 2: Frontend chama a Edge Function (modo START)

**Arquivo:** `src/lib/api/searchLeads.ts` - funcao `searchLeadsByCnae()`

```typescript
const { data: startData, error: startError } = await supabase.functions.invoke("search-cnae", {
  body: { cnae, estado, page, batch, estados, requiredFields, searchTerms },
});
```

**Parametros enviados:**

| Parametro | Tipo | Descricao |
|-----------|------|-----------|
| `cnae` | string | Codigo CNAE (obrigatorio) |
| `estado` | string? | UF unica (ex: "SP") |
| `page` | number | Pagina (default: 1) |
| `batch` | number | Grupo de estados (0 = geral, 1-7 = por regiao) |
| `estados` | string[]? | UFs especificas selecionadas pelo usuario |
| `requiredFields` | string[]? | Filtros de qualidade: "has_phone", "has_website", "has_rating" |
| `searchTerms` | string[]? | Termos customizados de busca |

### Passo 3: Edge Function monta as search strings e inicia o Apify

**Arquivo:** `supabase/functions/search-cnae/index.ts` - funcao `handleStart()`

A Edge Function converte o CNAE em termos de busca do Google Places:

```
CNAE_DESCRIPTIONS = {
  '8640205': ['clinica de radiologia', 'diagnostico por imagem', 'raio-x diagnostico'],
  '8640207': ['ultrassonografia', 'clinica de ultrassom', 'doppler vascular'],
  '8640204': ['tomografia computadorizada', 'clinica de tomografia', 'ressonancia magnetica'],
}
```

**Logica de resolucao de termos (prioridade):**
1. Se o CNAE esta no dicionario `CNAE_DESCRIPTIONS` → usa as descricoes mapeadas
2. Se o frontend enviou `searchTerms` → usa esses termos
3. Senao → usa o proprio codigo CNAE como termo de busca

**Logica de estados (3 modos):**
1. `estados[]` preenchido → busca nos estados selecionados pelo usuario
2. `batch > 0` → busca por grupo regional (STATE_BATCHES)
3. Nenhum → busca geral "Brasil"

```
STATE_BATCHES = [
  ['Sao Paulo', 'Rio de Janeiro', 'Minas Gerais'],        // batch 1
  ['Rio Grande do Sul', 'Parana', 'Santa Catarina'],       // batch 2
  ['Bahia', 'Pernambuco', 'Ceara'],                        // batch 3
  ['Goias', 'Distrito Federal', 'Mato Grosso', 'MS'],     // batch 4
  ['Para', 'Amazonas', 'Maranhao', 'Piaui'],              // batch 5
  ['Espirito Santo', 'RN', 'Paraiba', 'Alagoas'],         // batch 6
  ['Tocantins', 'Rondonia', 'Acre', 'Roraima', 'AP', 'SE'] // batch 7
]
```

**Exemplo de search strings geradas:**
```
CNAE 8640205 + estados ['SP', 'RJ']:
→ ["clinica de radiologia Sao Paulo", "clinica de radiologia Rio de Janeiro",
   "diagnostico por imagem Sao Paulo", "diagnostico por imagem Rio de Janeiro",
   "raio-x diagnostico Sao Paulo", "raio-x diagnostico Rio de Janeiro"]
```

**Chamada ao Apify:**
```
POST https://api.apify.com/v2/acts/compass~crawler-google-places/runs
  ?token={APIFY_API_TOKEN}
  &memory={512 ou 1024}

Body:
{
  searchStringsArray: [...],        // strings montadas acima
  maxCrawledPlacesPerSearch: 25,    // max 25 lugares por termo
  countryCode: 'br'                 // restrito ao Brasil
}
```

**Regra de memoria:**
- <= 6 search strings → 512 MB
- > 6 search strings → 1024 MB

**Resposta retornada ao frontend:**
```json
{
  "success": true,
  "status": "started",
  "apifyRunId": "abc123...",
  "datasetId": "xyz789...",
  "cnae": "8640205",
  "estado": null,
  "page": 1,
  "batch": 0,
  "requiredFields": []
}
```

### Passo 4: Frontend faz polling ate o run terminar

**Arquivo:** `src/lib/api/searchLeads.ts`

```
Loop de polling:
  - Intervalo: 5 segundos (POLL_INTERVAL_MS = 5000)
  - Maximo: 72 tentativas (MAX_POLLS = 72)
  - Timeout total: 72 x 5s = 6 minutos

A cada iteracao:
  POST search-cnae { mode: "poll", apifyRunId, datasetId, ... }
    │
    ├── status: "running" → continua o loop
    ├── status: "done"    → retorna os leads (fim)
    └── erro              → throw Error (fim)
```

### Passo 5: Edge Function verifica status e busca resultados

**Arquivo:** `supabase/functions/search-cnae/index.ts` - funcao `handlePoll()`

```
1. GET https://api.apify.com/v2/actor-runs/{apifyRunId}?token=...
   → Verifica status: RUNNING | READY | SUCCEEDED | FAILED | ABORTED | TIMED-OUT

2. Se RUNNING ou READY:
   → Retorna { success: true, status: "running" }

3. Se SUCCEEDED:
   → GET https://api.apify.com/v2/datasets/{datasetId}/items?token=...&limit=5000
   → Filtra por requiredFields (has_phone, has_website, has_rating)
   → Mapeia para o formato Lead
   → Persiste no Supabase (assincrono, nao bloqueia resposta)
   → Retorna { success: true, status: "done", leads: [...], total: N }

4. Se FAILED/ABORTED/TIMED-OUT:
   → Retorna { success: false, error: "Run terminou com status: FAILED" }
```

### Passo 6: Mapeamento dos dados do Apify para Lead

O Apify retorna objetos do tipo `ApifyPlace`:

```typescript
interface ApifyPlace {
  placeId?: string;     // ID unico do Google Places
  title: string;        // Nome do estabelecimento
  address?: string;     // Endereco completo
  phone?: string;       // Telefone
  website?: string;     // Site
  totalScore?: number;  // Nota (0-5)
  reviewsCount?: number; // Numero de avaliacoes
}
```

Cada place e mapeado para o formato `Lead`:

```typescript
{
  id: place.placeId || String(index + 1),
  companyName: place.title,
  cnae: cnae,                                    // CNAE da busca
  cnpj: '',                                      // Google Places nao fornece CNPJ
  city: extractCity(place.address),              // Penultimo segmento do endereco
  state: extractState(place.address, estado),    // Regex "-XX" no endereco
  phone: place.phone || '',
  email: '',                                     // Google Places nao fornece email
  estimatedRevenue: estimateRevenue(place.reviewsCount, place.totalScore),
  status: 'found',
  website: place.website || '',
  address: place.address || '',
  rating: place.totalScore || 0,
  reviewsCount: place.reviewsCount || 0,
}
```

### Passo 7: Persistencia no Supabase

**Funcao:** `persistLeads()` (executada de forma assincrona, nao bloqueia a resposta)

```
1. Insere em `scraping_runs`:
   {
     source: 'search-cnae-apify',
     filters_json: { cnae, estado, page, apifyRunId, datasetId },
     compute_units: X.XX
   }

2. Consulta leads existentes para o CNAE:
   SELECT raw FROM leads WHERE cnae_code = '{cnae}'

3. Filtra duplicatas (por placeId):
   Compara lead.id com raw.id dos leads existentes

4. Insere apenas leads novos em `leads`:
   {
     run_id: savedRunId,
     company_name: lead.companyName,
     cnae_code: lead.cnae,
     faturamento_est: String(lead.estimatedRevenue),
     uf: lead.state,
     contato: lead.phone || lead.website || '',
     status: 'found',
     raw: lead                 // objeto completo para consulta futura
   }
```

---

## 3. Funcoes Auxiliares

### extractCity(address)

Extrai a cidade do endereco retornado pelo Google Places.

```
Entrada: "R. Exemplo, 123 - Centro, Maringa - PR, 87010-000, Brazil"
                                              ↑
Logica: Pega o penultimo segmento separado por virgula
        Remove o sufixo " - XX" (UF)

Saida: "Maringa"
```

### extractState(address, fallback)

Extrai a UF do endereco via regex.

```
Regex: /-\s*([A-Z]{2})(?:\s*,|\s*$)/
Entrada: "... Maringa - PR, 87010-000, Brazil"
Saida: "PR"

Se nao encontrar, retorna o fallback (estado da busca original)
Valida contra a lista de 27 UFs brasileiras
```

### estimateRevenue(reviews, rating)

Heuristica para estimar faturamento baseada no numero de avaliacoes.

```
> 500 reviews  → R$ 3.000.000 + random(5.000.000)
> 200 reviews  → R$ 1.500.000 + random(3.000.000)
> 50 reviews   → R$ 500.000 + random(1.500.000)
> 10 reviews   → R$ 200.000 + random(500.000)
<= 10 reviews  → R$ 100.000 + random(300.000)

IMPORTANTE: Esta e uma heuristica. Nao reflete faturamento real.
O parametro rating NAO e usado no calculo atual (prefixado com _).
```

---

## 4. Sistema de Monitoramento de Uso (Apify Usage)

### Edge Function: `apify-usage`

**Arquivo:** `supabase/functions/apify-usage/index.ts`

Consulta em paralelo:
1. **API Apify:** `GET /users/me` → creditos do plano, uso mensal
2. **Supabase:** tabela `scraping_runs` → historico de CUs consumidos

**Retorno:**
```json
{
  "success": true,
  "account": {
    "planLimitCents": 500,
    "usedCents": 234,
    "remainingCents": 266,
    "usagePercent": 46.8,
    "planName": "free"
  },
  "history": {
    "totalCuThisMonth": 12.34,
    "avgCuPerRun": 1.54,
    "estimatedSearchesRemaining": 42,
    "recentRuns": [
      { "cnae": "8640205", "estado": "Nacional", "computeUnits": 1.23, "createdAt": "..." }
    ]
  }
}
```

**Formula de buscas restantes:**
```
estimatedSearchesRemaining = remainingCents / 100 / (avgCuPerRun * 0.004)
                                                      └── custo por CU em USD
```

### Hook: `useApifyUsage`

**Arquivo:** `src/hooks/useApifyUsage.ts`

- Busca dados ao montar o componente
- Polling automatico a cada 5 minutos
- Usa fetch direto (nao supabase.functions.invoke) com anon key no header

### Widget: `UsagePopover`

**Arquivo:** `src/components/UsagePopover.tsx`

Exibe no TopBar:
- Badge com % de uso (verde/amarelo/vermelho)
- Barra de progresso dos creditos
- Alerta quando uso >= 85%
- Estimativa de buscas restantes
- Historico das ultimas 10 buscas com CUs consumidos

---

## 5. Esquema do Banco de Dados

### Tabela: `cnae_filters`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| code | text (PK) | Codigo CNAE |
| short_name | text | Nome curto |
| description | text | Descricao completa |
| is_active | boolean | Se o filtro esta ativo |
| created_at | timestamp | Data de criacao |

### Tabela: `scraping_runs`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | ID auto-gerado |
| source | text | Sempre 'search-cnae-apify' |
| filters_json | jsonb | { cnae, estado, page, apifyRunId, datasetId } |
| compute_units | float | CUs consumidos pelo run |
| created_at | timestamp | Data de criacao |

### Tabela: `leads`

| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | ID auto-gerado |
| run_id | uuid (FK) | Referencia ao scraping_run |
| company_name | text | Nome da empresa |
| cnae_code | text | Codigo CNAE |
| faturamento_est | text | Faturamento estimado (string) |
| uf | text | Sigla do estado |
| contato | text | Telefone ou website |
| status | text | Status do lead ('found') |
| raw | jsonb | Objeto Lead completo (usado para exibicao) |
| created_at | timestamp | Data de criacao |

---

## 6. Configuracao (Secrets do Supabase)

Secrets necessarios no **Supabase Dashboard > Edge Functions > Secrets**:

| Secret | Descricao | Onde obter |
|--------|-----------|------------|
| `APIFY_API_TOKEN` | Token de autenticacao da API Apify | console.apify.com > Settings > Integrations |
| `SUPABASE_URL` | URL do projeto Supabase | Ja configurado automaticamente |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de servico | Ja configurado automaticamente |

Variaveis de ambiente do frontend (`.env`):

| Variavel | Descricao |
|----------|-----------|
| `VITE_SUPABASE_URL` | URL do Supabase (para o SDK) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key do Supabase |

---

## 7. Actor Apify Usado

**Actor:** `compass~crawler-google-places`
**URL:** https://apify.com/compass/crawler-google-places

**Input enviado:**
```json
{
  "searchStringsArray": ["clinica de radiologia Sao Paulo", ...],
  "maxCrawledPlacesPerSearch": 25,
  "countryCode": "br"
}
```

**Output retornado (campos relevantes):**
```json
{
  "placeId": "ChIJ...",
  "title": "Clinica Radiologica ABC",
  "address": "R. Exemplo, 123 - Centro, Maringa - PR, 87010-000, Brazil",
  "phone": "+55 44 3025-1234",
  "website": "https://clinicaabc.com.br",
  "totalScore": 4.5,
  "reviewsCount": 127
}
```

---

## 8. Sistema de "Buscar Mais" (Batches)

O botao "Buscar mais" no frontend incrementa o batch para cada CNAE ativo:

```
Batch 0: Busca geral "Brasil" (ou estados selecionados)
Batch 1: SP, RJ, MG
Batch 2: RS, PR, SC
Batch 3: BA, PE, CE
Batch 4: GO, DF, MT, MS
Batch 5: PA, AM, MA, PI
Batch 6: ES, RN, PB, AL
Batch 7: TO, RO, AC, RR, AP, SE
Batch 8: Volta ao batch 1 (ciclo: groupIndex = (batch-1) % 7)
```

Cada batch acumula leads ao inves de substituir (parametro `append = true`).
Deduplicacao e feita no frontend por `lead.id` (placeId do Google).

---

## 9. Filtros de Qualidade

Filtros que podem ser aplicados na busca E na exibicao:

| ID | Label | Funciona na busca? | Descricao |
|----|-------|--------------------|-----------|
| `has_phone` | Com telefone | Sim | Filtra leads com telefone |
| `has_website` | Com site | Sim | Filtra leads com website |
| `has_rating` | Com avaliacao | Sim | Filtra leads com nota > 0 |
| `has_email` | Com email | Nao (client-side) | Google Places nao fornece email |
| `no_contact` | Sem contato | Nao (client-side) | Leads sem telefone e sem email |
| `complete` | Completos | Nao (client-side) | Leads com telefone E website |

Os filtros marcados como "Sim" sao enviados como `requiredFields` para a Edge Function,
que os aplica ANTES de retornar os leads (filtragem server-side).

---

## 10. Modos de Visualizacao

### Modo "Sessao" (session)
- Leads existem apenas na memoria do frontend (estado `allLeads`)
- Carregados via scraping (Apify)
- Perdidos ao recarregar a pagina
- Usados para exploracao rapida

### Modo "Meus Leads" (saved)
- Leads carregados do Supabase (tabela `leads`)
- Paginados: 100 por pagina
- Persistentes entre sessoes
- Suportam CRUD (criar, editar, deletar via LeadFormPanel)

---

## 11. Exportacao

### CSV
- Separador: `;` (padrao brasileiro para Excel)
- Encoding: UTF-8 com BOM (`\uFEFF`) para acentos no Excel
- Campos: Empresa, CNAE, CNPJ, Cidade, UF, Email, Telefone, Faturamento, Status

### PDF
- Abre popup com tabela HTML formatada
- Usa `window.print()` para o usuario salvar como PDF
- Nao depende de biblioteca externa

---

## 12. Troubleshooting

### Erro 500 no modo "start"
**Causa provavel:** Token Apify invalido ou creditos esgotados.
**Diagnostico:** Supabase Dashboard > Edge Functions > search-cnae > Logs.
Procure a linha: `Erro Apify {status}: {mensagem}`

### Erro 500 no modo "poll"
**Causa provavel:** Run do Apify falhou (FAILED/ABORTED/TIMED-OUT).
**Diagnostico:** Acesse console.apify.com > Runs para ver o status.

### "Tempo limite de busca excedido"
**Causa:** O run nao terminou em 6 minutos (72 polls x 5s).
**Solucao:** Reduza o numero de search strings (menos estados selecionados).

### Leads duplicados
**Prevencao server-side:** `persistLeads()` compara placeId com leads existentes.
**Prevencao client-side:** `fetchLeadsForCnae()` com `append=true` filtra por `lead.id`.

### CNAE sem descricao mapeada
Apenas 3 CNAEs tem descricoes no dicionario do backend:
- 8640205 (Radiologia)
- 8640207 (Ultrassonografia)
- 8640204 (Tomografia)

Para outros CNAEs, o sistema usa o `searchTerms` enviado pelo frontend
(campo `shortName` do CNAE) ou o proprio codigo como termo de busca.

---

## 13. Arquivos do Sistema

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/lib/api/searchLeads.ts` | Orquestra start + polling no frontend |
| `supabase/functions/search-cnae/index.ts` | Edge Function: inicia Apify, poll, mapeia leads, persiste |
| `supabase/functions/apify-usage/index.ts` | Edge Function: monitora creditos e historico |
| `src/hooks/useApifyUsage.ts` | Hook React: busca dados de uso com polling 5min |
| `src/components/UsagePopover.tsx` | Widget de uso do Apify no TopBar |
| `src/pages/Index.tsx` | Pagina principal: gerencia CNAEs, filtros, modos, busca |
| `src/data/types.ts` | Interfaces: Lead, CnaeCode, Filters |
| `src/components/AppSidebar.tsx` | Sidebar: lista CNAEs, adiciona/remove |
| `src/components/LeadsTable.tsx` | Tabela de leads com ordenacao e paginacao |
| `src/components/TopBar.tsx` | Barra superior: busca, modo, logout, usage badge |
