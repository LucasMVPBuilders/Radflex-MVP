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
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const [userRes, runsHistory] = await Promise.all([
      fetch(`${APIFY_BASE}/users/me?token=${apifyToken}`),
      fetchRunsHistory(),
    ]);

    const userData = userRes.ok ? await userRes.json() : null;

    // Limites da conta em créditos USD (cents)
    const planLimitCents: number = userData?.data?.plan?.monthlyUsageCreditsCents ?? 0;
    const usedCents: number = userData?.data?.monthlyUsage?.totalCreditsCents ?? 0;
    const remainingCents = Math.max(0, planLimitCents - usedCents);
    const usagePercent = planLimitCents > 0 ? (usedCents / planLimitCents) * 100 : 0;

    const { totalCuThisMonth, recentRuns, avgCuPerRun } = runsHistory;

    // Estimativa: ~$0.004 USD por compute unit (Apify pricing)
    const CU_COST_USD = 0.004;
    const estimatedSearchesRemaining =
      avgCuPerRun > 0 && remainingCents > 0
        ? Math.floor(remainingCents / 100 / (avgCuPerRun * CU_COST_USD))
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
          totalCuThisMonth: Math.round(totalCuThisMonth * 100) / 100,
          avgCuPerRun: Math.round(avgCuPerRun * 100) / 100,
          estimatedSearchesRemaining,
          recentRuns,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('Erro apify-usage:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

async function fetchRunsHistory() {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data } = await supabase
    .from('scraping_runs')
    .select('compute_units, filters_json, created_at')
    .gte('created_at', firstDayOfMonth)
    .not('compute_units', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);

  const runs = data ?? [];
  const totalCuThisMonth = runs.reduce((sum: number, r: any) => sum + (r.compute_units ?? 0), 0);
  const avgCuPerRun = runs.length > 0 ? totalCuThisMonth / runs.length : 0;

  const recentRuns = runs.slice(0, 10).map((r: any) => ({
    cnae: r.filters_json?.cnae ?? '—',
    estado: r.filters_json?.estado ?? 'Nacional',
    computeUnits: r.compute_units,
    createdAt: r.created_at,
  }));

  return { totalCuThisMonth, recentRuns, avgCuPerRun };
}
