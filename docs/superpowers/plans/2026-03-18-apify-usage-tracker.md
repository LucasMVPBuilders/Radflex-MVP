# Apify Usage Tracker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar no TopBar um badge com CUs Apify restantes + popover com progresso, histórico por busca e estimativa de buscas restantes.

**Architecture:** Modificamos `handlePoll()` para capturar `computeUnits` de cada run e salvar em `scraping_runs`. Uma nova Edge Function `apify-usage` retorna os limites da conta (via `/v2/users/me`) + soma de CUs do mês (via DB). O frontend usa um hook com polling de 5 min que alimenta um `UsagePopover` na TopBar.

**Tech Stack:** React 18, TypeScript, Supabase Edge Functions (Deno), Apify REST API, shadcn/ui (Popover, Progress), Lucide icons

---

## Chunk 1: Database & Edge Function de dados

### Task 1: Migration — coluna `compute_units` em `scraping_runs`

**Files:**
- Create: `supabase/migrations/20260318000000_add_compute_units_to_scraping_runs.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- supabase/migrations/20260318000000_add_compute_units_to_scraping_runs.sql
ALTER TABLE scraping_runs
  ADD COLUMN IF NOT EXISTS compute_units NUMERIC DEFAULT NULL;
```

- [ ] **Step 2: Aplicar migration via Supabase MCP**

Usar `mcp__claude_ai_Supabase__apply_migration` com o conteúdo acima no projeto correto.

- [ ] **Step 3: Verificar schema**

Usar `mcp__claude_ai_Supabase__execute_sql`:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'scraping_runs';
```
Esperado: coluna `compute_units` com tipo `numeric`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260318000000_add_compute_units_to_scraping_runs.sql
git commit -m "feat: add compute_units column to scraping_runs"
```

---

### Task 2: Modificar `search-cnae` para salvar CUs ao finalizar run

**Files:**
- Modify: `supabase/functions/search-cnae/index.ts`

`★ Insight ─────────────────────────────────────`
O Apify retorna `stats.computeUnits` no objeto do run quando seu status é `SUCCEEDED`. Já estamos buscando esse status em `handlePoll()` via `/v2/actor-runs/{runId}` — então os dados de CU estão disponíveis nessa mesma resposta, sem custo extra de chamada de API.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Extrair `computeUnits` do `statusData` em `handlePoll()`**

Localizar a linha após `const status: string = statusData?.data?.status || 'UNKNOWN';` e adicionar:
```typescript
const computeUnits: number | null = statusData?.data?.stats?.computeUnits ?? null;
```

- [ ] **Step 2: Passar `computeUnits` para `persistLeads()`**

Alterar a chamada de `persistLeads` no bloco `if (supabase && leads.length > 0)`:
```typescript
persistLeads(leads, cnae, estado, page, apifyRunId, datasetId, computeUnits).catch(...)
```

- [ ] **Step 3: Atualizar assinatura de `persistLeads` para aceitar e salvar CUs**

```typescript
async function persistLeads(
  leads: Lead[],
  cnae: string,
  estado: string | undefined,
  page: number,
  apifyRunId: string,
  datasetId: string,
  computeUnits: number | null,  // <- novo parâmetro
) {
  if (!supabase) return;

  const { data: runInsert, error: runError } = await supabase
    .from('scraping_runs')
    .insert({
      source: 'search-cnae-apify',
      filters_json: { cnae, estado: estado || null, page, apifyRunId, datasetId },
      compute_units: computeUnits,  // <- nova coluna
    })
    .select('id')
    .single();
  // ... resto igual
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/search-cnae/index.ts
git commit -m "feat: capture and persist compute_units per Apify run"
```

---

### Task 3: Criar Edge Function `apify-usage`

**Files:**
- Create: `supabase/functions/apify-usage/index.ts`

`★ Insight ─────────────────────────────────────`
A API do Apify em `/v2/users/me` retorna `plan.monthlyUsageCreditsCents` (limite) e `monthlyUsage.totalCreditsCents` (uso atual). Porém créditos em USD são menos intuitivos para o usuário do que "compute units". Por isso exibimos **ambos**: CUs reais do nosso histórico DB + crédito USD da conta Apify como contexto de limite.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Criar o arquivo da Edge Function**

```typescript
// supabase/functions/apify-usage/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APIFY_BASE = 'https://api.apify.com/v2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apifyToken = Deno.env.get('APIFY_API_TOKEN');
    if (!apifyToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token Apify não configurado.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Busca info da conta no Apify
    const [userRes, runsHistoryResult] = await Promise.all([
      fetch(`${APIFY_BASE}/users/me?token=${apifyToken}`),
      fetchRunsHistory(),
    ]);

    const userData = userRes.ok ? await userRes.json() : null;

    // Limites do plano (em créditos USD cents)
    const planLimitCents: number = userData?.data?.plan?.monthlyUsageCreditsCents ?? 0;
    const usedCents: number = userData?.data?.monthlyUsage?.totalCreditsCents ?? 0;
    const remainingCents = Math.max(0, planLimitCents - usedCents);
    const usagePercent = planLimitCents > 0 ? (usedCents / planLimitCents) * 100 : 0;

    // 2. Histórico de runs deste mês (do nosso DB)
    const { totalCuThisMonth, recentRuns, avgCuPerRun } = runsHistoryResult;

    // 3. Estimativa de buscas restantes baseada no custo médio real
    const estimatedSearchesRemaining = avgCuPerRun > 0
      ? Math.floor((remainingCents / 100) / (avgCuPerRun * 0.004)) // ~$0.004 por CU
      : null;

    return new Response(
      JSON.stringify({
        success: true,
        account: {
          planLimitCents,
          usedCents,
          remainingCents,
          usagePercent: Math.round(usagePercent * 10) / 10,
          planName: userData?.data?.plan?.id ?? 'unknown',
        },
        history: {
          totalCuThisMonth,
          avgCuPerRun: Math.round(avgCuPerRun * 100) / 100,
          estimatedSearchesRemaining,
          recentRuns,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Erro apify-usage:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function fetchRunsHistory() {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Soma CUs do mês atual
  const { data: monthData } = await supabase
    .from('scraping_runs')
    .select('compute_units, filters_json, created_at')
    .gte('created_at', firstDayOfMonth)
    .not('compute_units', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const runs = monthData ?? [];
  const totalCuThisMonth = runs.reduce((sum: number, r: any) => sum + (r.compute_units || 0), 0);
  const avgCuPerRun = runs.length > 0 ? totalCuThisMonth / runs.length : 0;

  const recentRuns = runs.slice(0, 10).map((r: any) => ({
    cnae: r.filters_json?.cnae ?? '—',
    estado: r.filters_json?.estado ?? 'Nacional',
    computeUnits: r.compute_units,
    createdAt: r.created_at,
  }));

  return { totalCuThisMonth, recentRuns, avgCuPerRun };
}
```

- [ ] **Step 2: Deploy via Supabase MCP**

Usar `mcp__claude_ai_Supabase__deploy_edge_function` com:
- function_name: `apify-usage`
- entrypoint_path: `supabase/functions/apify-usage/index.ts`

- [ ] **Step 3: Testar chamada manual**

```bash
curl -X GET "https://<PROJECT_REF>.supabase.co/functions/v1/apify-usage" \
  -H "Authorization: Bearer <ANON_KEY>"
```
Esperado: JSON com `success: true`, campos `account` e `history`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/apify-usage/index.ts
git commit -m "feat: create apify-usage edge function"
```

---

## Chunk 2: Frontend — Hook + Componentes UI

### Task 4: Criar hook `useApifyUsage`

**Files:**
- Create: `src/hooks/useApifyUsage.ts`

- [ ] **Step 1: Criar o hook com polling de 5 minutos**

```typescript
// src/hooks/useApifyUsage.ts
import { useState, useEffect, useCallback } from 'react';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

export interface ApifyRunRecord {
  cnae: string;
  estado: string;
  computeUnits: number;
  createdAt: string;
}

export interface ApifyUsageData {
  account: {
    planLimitCents: number;
    usedCents: number;
    remainingCents: number;
    usagePercent: number;
    planName: string;
  };
  history: {
    totalCuThisMonth: number;
    avgCuPerRun: number;
    estimatedSearchesRemaining: number | null;
    recentRuns: ApifyRunRecord[];
  };
}

export function useApifyUsage() {
  const [data, setData] = useState<ApifyUsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsage = useCallback(async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/apify-usage`, {
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error ?? 'Erro ao buscar uso');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Busca imediata ao montar
  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  // Polling a cada 5 minutos
  useEffect(() => {
    const interval = setInterval(fetchUsage, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchUsage]);

  return { data, loading, error, refresh: fetchUsage };
}
```

- [ ] **Step 2: Verificar que `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` estão no `.env`**

```bash
grep -E "VITE_SUPABASE" .env
```
Se não existirem, adicionar ao `.env.local`:
```
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<ANON_KEY>
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useApifyUsage.ts
git commit -m "feat: add useApifyUsage hook with 5-min polling"
```

---

### Task 5: Criar componente `UsagePopover`

**Files:**
- Create: `src/components/UsagePopover.tsx`

`★ Insight ─────────────────────────────────────`
Usar o componente `Popover` do shadcn/ui (que usa Radix) em vez de `dropdown` é a escolha certa aqui: o Popover não fecha ao clicar dentro dele, permitindo scroll no histórico de runs. Já o alerta visual de 85%+ usa a lógica de "semáforo" (verde → amarelo → vermelho) diretamente no className, sem precisar de biblioteca extra.
`─────────────────────────────────────────────────`

- [ ] **Step 1: Criar o componente**

```typescript
// src/components/UsagePopover.tsx
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Activity, AlertTriangle, RefreshCw } from 'lucide-react';
import { ApifyUsageData, ApifyRunRecord } from '@/hooks/useApifyUsage';

interface UsagePopoverProps {
  data: ApifyUsageData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function usageColor(percent: number): string {
  if (percent >= 85) return 'text-red-500';
  if (percent >= 60) return 'text-yellow-500';
  return 'text-emerald-500';
}

function progressColor(percent: number): string {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 60) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

export function UsagePopover({ data, loading, error, onRefresh }: UsagePopoverProps) {
  const percent = data?.account.usagePercent ?? 0;
  const isAlert = percent >= 85;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-colors hover:bg-muted"
          title="Uso Apify"
        >
          {isAlert ? (
            <AlertTriangle className={`h-3.5 w-3.5 ${usageColor(percent)}`} />
          ) : (
            <Activity className={`h-3.5 w-3.5 ${usageColor(percent)}`} />
          )}
          <span className={usageColor(percent)}>
            {loading && !data ? '...' : `${percent.toFixed(0)}%`}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-4 space-y-4" align="end">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Uso Apify</p>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}

        {data && (
          <>
            {/* Barra de progresso */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Créditos usados</span>
                <span>
                  {formatCents(data.account.usedCents)} / {formatCents(data.account.planLimitCents)}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${progressColor(percent)}`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {formatCents(data.account.remainingCents)} restantes — plano {data.account.planName}
              </p>
            </div>

            {/* Alerta */}
            {isAlert && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                <p className="text-xs text-red-600 dark:text-red-400">
                  Você usou {percent.toFixed(0)}% do limite mensal.
                </p>
              </div>
            )}

            {/* Estimativa */}
            {data.history.estimatedSearchesRemaining !== null && (
              <div className="text-xs space-y-0.5">
                <p className="font-medium">Estimativa restante</p>
                <p className="text-muted-foreground">
                  ~{data.history.estimatedSearchesRemaining} buscas (média de{' '}
                  {data.history.avgCuPerRun.toFixed(2)} CU/busca)
                </p>
                <p className="text-muted-foreground">
                  {data.history.totalCuThisMonth.toFixed(2)} CUs usados este mês
                </p>
              </div>
            )}

            {/* Histórico */}
            {data.history.recentRuns.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium">Últimas buscas</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {data.history.recentRuns.map((run: ApifyRunRecord, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs py-1 border-b border-border/50 last:border-0"
                    >
                      <span className="text-muted-foreground">
                        CNAE {run.cnae} · {run.estado}
                      </span>
                      <span className="font-mono font-medium">
                        {run.computeUnits.toFixed(2)} CU
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.history.recentRuns.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                Nenhuma busca registrada este mês ainda.
              </p>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Verificar que `@/components/ui/popover` e `@/components/ui/progress` existem**

```bash
ls src/components/ui/popover.tsx src/components/ui/progress.tsx
```

Se não existirem, instalar via shadcn:
```bash
npx shadcn@latest add popover progress
```

- [ ] **Step 3: Commit**

```bash
git add src/components/UsagePopover.tsx
git commit -m "feat: add UsagePopover component with progress, history and alert"
```

---

### Task 6: Integrar `UsagePopover` no `TopBar`

**Files:**
- Modify: `src/components/TopBar.tsx`
- Modify: `src/pages/Index.tsx`

- [ ] **Step 1: Atualizar interface `TopBarProps` para aceitar dados de uso**

```typescript
import { UsagePopover } from '@/components/UsagePopover';
import { ApifyUsageData } from '@/hooks/useApifyUsage';

interface TopBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  resultCount: number;
  loading?: boolean;
  mode: "session" | "saved";
  onModeChange: (mode: "session" | "saved") => void;
  onLogout?: () => void;
  // Novos props de uso
  usageData: ApifyUsageData | null;
  usageLoading: boolean;
  usageError: string | null;
  onRefreshUsage: () => void;
}
```

- [ ] **Step 2: Adicionar `<UsagePopover>` antes do botão de logout no JSX do TopBar**

Na `div` com `className="flex items-center gap-3"`, adicionar antes de `{onLogout && ...}`:
```tsx
<UsagePopover
  data={usageData}
  loading={usageLoading}
  error={usageError}
  onRefresh={onRefreshUsage}
/>
```

- [ ] **Step 3: Atualizar `Index.tsx` para usar o hook e passar props ao `TopBar`**

Adicionar import e hook no topo do componente `Index`:
```typescript
import { useApifyUsage } from '@/hooks/useApifyUsage';

// dentro do componente:
const { data: usageData, loading: usageLoading, error: usageError, refresh: refreshUsage } = useApifyUsage();
```

Atualizar o `<TopBar ... />` para incluir as novas props:
```tsx
<TopBar
  // ... props existentes
  usageData={usageData}
  usageLoading={usageLoading}
  usageError={usageError}
  onRefreshUsage={refreshUsage}
/>
```

- [ ] **Step 4: Testar no browser**

```bash
npm run dev
```
- Badge deve aparecer na TopBar com % de uso
- Clique deve abrir popover com barra de progresso
- Após 5 min deve atualizar automaticamente
- Botão de refresh manual deve funcionar

- [ ] **Step 5: Commit final**

```bash
git add src/components/TopBar.tsx src/pages/Index.tsx
git commit -m "feat: wire ApifyUsage into TopBar with badge and popover"
```

---

## Resumo de arquivos

| Ação | Arquivo |
|------|---------|
| Criar | `supabase/migrations/20260318000000_add_compute_units_to_scraping_runs.sql` |
| Modificar | `supabase/functions/search-cnae/index.ts` |
| Criar | `supabase/functions/apify-usage/index.ts` |
| Criar | `src/hooks/useApifyUsage.ts` |
| Criar | `src/components/UsagePopover.tsx` |
| Modificar | `src/components/TopBar.tsx` |
| Modificar | `src/pages/Index.tsx` |
