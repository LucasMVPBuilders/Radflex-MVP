import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CNAE_DESCRIPTIONS: Record<string, string[]> = {
  '8640205': ['clínica de radiologia', 'diagnóstico por imagem', 'raio-x diagnóstico'],
  '8640207': ['ultrassonografia', 'clínica de ultrassom', 'doppler vascular'],
  '8640204': ['tomografia computadorizada', 'clínica de tomografia', 'ressonância magnética'],
};

const STATE_BATCHES: string[][] = [
  ['São Paulo', 'Rio de Janeiro', 'Minas Gerais'],
  ['Rio Grande do Sul', 'Paraná', 'Santa Catarina'],
  ['Bahia', 'Pernambuco', 'Ceará'],
  ['Goiás', 'Distrito Federal', 'Mato Grosso', 'Mato Grosso do Sul'],
  ['Pará', 'Amazonas', 'Maranhão', 'Piauí'],
  ['Espírito Santo', 'Rio Grande do Norte', 'Paraíba', 'Alagoas'],
  ['Tocantins', 'Rondônia', 'Acre', 'Roraima', 'Amapá', 'Sergipe'],
];

const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

const APIFY_BASE = 'https://api.apify.com/v2';
const ACTOR_ID = 'compass~crawler-google-places';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // Modo polling: frontend pergunta se o run terminou
    if (body.mode === 'poll') {
      return handlePoll(body);
    }

    // Modo start: inicia o run e retorna runId imediatamente
    return handleStart(body);
  } catch (error: any) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Erro ao processar requisição' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleStart(body: any) {
  const { cnae, estado, page = 1, batch = 0, estados, requiredFields = [], searchTerms } = body;

  if (!cnae) {
    return new Response(
      JSON.stringify({ success: false, error: 'CNAE é obrigatório' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const apifyToken = Deno.env.get('APIFY_API_TOKEN');
  if (!apifyToken) {
    return new Response(
      JSON.stringify({ success: false, error: 'Token Apify não configurado.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const cnaeClean = cnae.replace(/[-\/]/g, '');
  const descricoes = CNAE_DESCRIPTIONS[cnaeClean]
    || (searchTerms?.length ? searchTerms : null)
    || [cnae];

  let searchStrings: string[];
  if (estados && estados.length > 0) {
    const stateNames = estados.map((uf: string) => UF_NAMES[uf] ?? uf);
    searchStrings = descricoes.flatMap((d) => stateNames.map((nome) => `${d} ${nome}`));
  } else if (batch > 0) {
    const groupIndex = (batch - 1) % STATE_BATCHES.length;
    const stateGroup = STATE_BATCHES[groupIndex];
    searchStrings = descricoes.flatMap((d) => stateGroup.map((uf) => `${d} ${uf}`));
  } else {
    const estadoLabel = estado ? ` ${estado} Brasil` : ' Brasil';
    searchStrings = descricoes.map((d) => `${d}${estadoLabel}`);
  }

  const maxPerSearch = 25;
  const memoryMb = searchStrings.length > 6 ? 1024 : 512;

  const actorInput = {
    searchStringsArray: searchStrings,
    maxCrawledPlacesPerSearch: maxPerSearch,
    countryCode: 'br',
  };

  console.log(`Iniciando run: ${searchStrings.length} strings × ${maxPerSearch} lugares`);

  const runRes = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${apifyToken}&memory=${memoryMb}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(actorInput),
  });

  if (!runRes.ok) {
    const errText = await runRes.text();
    console.error(`Erro Apify ${runRes.status}:`, errText.slice(0, 500));
    return new Response(
      JSON.stringify({ success: false, error: `Erro ao iniciar Apify: ${runRes.status} — ${errText.slice(0, 200)}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const runData = await runRes.json();
  const apifyRunId: string = runData?.data?.id;
  const datasetId: string = runData?.data?.defaultDatasetId;

  if (!apifyRunId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Apify não retornou runId.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Run iniciado: ${apifyRunId}, dataset: ${datasetId}`);

  // Retorna imediatamente com o runId para o frontend fazer polling
  return new Response(
    JSON.stringify({
      success: true,
      status: 'started',
      apifyRunId,
      datasetId,
      cnae,
      estado,
      page,
      batch,
      requiredFields,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handlePoll(body: any) {
  const { apifyRunId, datasetId, cnae, estado, page = 1, batch = 0, requiredFields = [] } = body;

  if (!apifyRunId || !datasetId) {
    return new Response(
      JSON.stringify({ success: false, error: 'apifyRunId e datasetId são obrigatórios para polling.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const apifyToken = Deno.env.get('APIFY_API_TOKEN');

  // Verifica status do run
  const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${apifyRunId}?token=${apifyToken}`);
  if (!statusRes.ok) {
    return new Response(
      JSON.stringify({ success: false, error: 'Erro ao verificar status do run Apify.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const statusData = await statusRes.json();
  const status: string = statusData?.data?.status || 'UNKNOWN';
  const computeUnits: number | null = statusData?.data?.stats?.computeUnits ?? null;

  console.log(`Poll run ${apifyRunId}: ${status} (${computeUnits ?? '?'} CUs)`);

  // Run ainda em andamento — frontend vai tentar de novo em alguns segundos
  if (status === 'RUNNING' || status === 'READY') {
    return new Response(
      JSON.stringify({ success: true, status: 'running' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Run falhou
  if (status !== 'SUCCEEDED') {
    return new Response(
      JSON.stringify({ success: false, error: `Run Apify terminou com status: ${status}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Run finalizado — busca resultados
  const itemsRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyToken}&limit=5000`);
  if (!itemsRes.ok) {
    return new Response(
      JSON.stringify({ success: false, error: 'Erro ao buscar resultados do dataset.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const allPlaces: ApifyPlace[] = await itemsRes.json();
  console.log(`Dataset retornou ${allPlaces.length} lugares`);

  const places = requiredFields.length === 0 ? allPlaces : allPlaces.filter((p) => {
    if (requiredFields.includes('has_phone') && !p.phone) return false;
    if (requiredFields.includes('has_website') && !p.website) return false;
    if (requiredFields.includes('has_rating') && !(p.totalScore && p.totalScore > 0)) return false;
    return true;
  });

  const leads: Lead[] = places
    .filter((place) => place.title)
    .map((place, index) => ({
      id: place.placeId || String(index + 1),
      companyName: place.title,
      cnae,
      cnpj: '',
      city: extractCity(place.address || ''),
      state: extractState(place.address || '', estado),
      phone: place.phone || '',
      email: '',
      estimatedRevenue: estimateRevenue(place.reviewsCount, place.totalScore),
      status: 'found' as const,
      website: place.website || '',
      address: place.address || '',
      rating: place.totalScore || 0,
      reviewsCount: place.reviewsCount || 0,
    }));

  // Persiste no Supabase (assíncrono, não bloqueia resposta)
  if (supabase && leads.length > 0) {
    persistLeads(leads, cnae, estado, page, apifyRunId, datasetId, computeUnits).catch((e) =>
      console.error('Erro ao persistir leads:', e)
    );
  }

  return new Response(
    JSON.stringify({ success: true, status: 'done', leads, total: leads.length }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function persistLeads(
  leads: Lead[],
  cnae: string,
  estado: string | undefined,
  page: number,
  apifyRunId: string,
  datasetId: string,
  computeUnits: number | null = null,
) {
  if (!supabase) return;

  const { data: runInsert, error: runError } = await supabase
    .from('scraping_runs')
    .insert({
      source: 'search-cnae-apify',
      filters_json: { cnae, estado: estado || null, page, apifyRunId, datasetId },
      compute_units: computeUnits,
    })
    .select('id')
    .single();

  if (runError) { console.error('Error inserting scraping_run:', runError); return; }

  const savedRunId = runInsert?.id;
  if (!savedRunId) return;

  const { data: existingRows } = await supabase
    .from('leads')
    .select('raw')
    .eq('cnae_code', cnae);

  const existingPlaceIds = new Set(
    (existingRows ?? []).map((r: any) => r.raw?.id).filter(Boolean)
  );

  const newLeads = leads.filter((l) => l.id && !existingPlaceIds.has(l.id));

  if (newLeads.length === 0) return;

  const leadRows = newLeads.map((lead) => ({
    run_id: savedRunId,
    company_name: lead.companyName,
    cnae_code: lead.cnae,
    faturamento_est: String(lead.estimatedRevenue),
    uf: lead.state,
    contato: lead.phone || lead.website || '',
    status: lead.status,
    raw: lead,
  }));

  const { error: leadsError } = await supabase.from('leads').insert(leadRows);
  if (leadsError) console.error('Error inserting leads:', leadsError);
}

interface Lead {
  id: string; companyName: string; cnae: string; cnpj: string;
  city: string; state: string; phone: string; email: string;
  estimatedRevenue: number; status: string; website?: string;
  address?: string; rating?: number; reviewsCount?: number;
}

interface ApifyPlace {
  placeId?: string; title: string; address?: string;
  phone?: string; website?: string; totalScore?: number; reviewsCount?: number;
}

function extractCity(address: string): string {
  if (!address) return '';
  const parts = address.split(',').map((part) => part.trim());
  const segment = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  return segment.replace(/\s*-\s*[A-Z]{2}$/, '').trim();
}

const BR_STATES = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]);

function extractState(address: string, fallback?: string): string {
  if (!address) return fallback || '';
  const match = address.match(/-\s*([A-Z]{2})(?:\s*,|\s*$)/);
  if (match && BR_STATES.has(match[1])) return match[1];
  return fallback || '';
}

function estimateRevenue(reviews?: number, _rating?: number): number {
  const reviewCount = reviews || 0;
  if (reviewCount > 500) return 3000000 + Math.floor(Math.random() * 5000000);
  if (reviewCount > 200) return 1500000 + Math.floor(Math.random() * 3000000);
  if (reviewCount > 50) return 500000 + Math.floor(Math.random() * 1500000);
  if (reviewCount > 10) return 200000 + Math.floor(Math.random() * 500000);
  return 100000 + Math.floor(Math.random() * 300000);
}
