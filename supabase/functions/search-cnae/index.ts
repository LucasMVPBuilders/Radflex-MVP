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

// Grupos de estados para buscas geográficas em batches (batch 1+, sem filtro manual)
const STATE_BATCHES: string[][] = [
  ['São Paulo', 'Rio de Janeiro', 'Minas Gerais'],
  ['Rio Grande do Sul', 'Paraná', 'Santa Catarina'],
  ['Bahia', 'Pernambuco', 'Ceará'],
  ['Goiás', 'Distrito Federal', 'Mato Grosso', 'Mato Grosso do Sul'],
  ['Pará', 'Amazonas', 'Maranhão', 'Piauí'],
  ['Espírito Santo', 'Rio Grande do Norte', 'Paraíba', 'Alagoas'],
  ['Tocantins', 'Rondônia', 'Acre', 'Roraima', 'Amapá', 'Sergipe'],
];

// Mapa de sigla → nome completo para o Google Places
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
const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 90000;

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
    const { cnae, estado, page = 1, batch = 0, estados, requiredFields = [] }: {
      cnae: string; estado?: string; page?: number; batch?: number; estados?: string[]; requiredFields?: string[];
    } = await req.json();

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
    const descricoes = CNAE_DESCRIPTIONS[cnaeClean] || [cnae];

    // Prioridade: estados[] manual > batch automático > nacional
    let searchStrings: string[];
    if (estados && estados.length > 0) {
      // Filtro manual: busca exatamente nos estados selecionados pelo usuário
      const stateNames = estados.map((uf) => UF_NAMES[uf] ?? uf);
      searchStrings = descricoes.flatMap((d) => stateNames.map((nome) => `${d} ${nome}`));
    } else if (batch > 0) {
      // Sem filtro manual: percorre grupos de estados automaticamente
      const groupIndex = (batch - 1) % STATE_BATCHES.length;
      const stateGroup = STATE_BATCHES[groupIndex];
      searchStrings = descricoes.flatMap((d) => stateGroup.map((uf) => `${d} ${uf}`));
    } else {
      // Busca inicial: nacional ou por estado único legado
      const estadoLabel = estado ? ` ${estado} Brasil` : ' Brasil';
      searchStrings = descricoes.map((d) => `${d}${estadoLabel}`);
    }

    // Para compatibilidade com o resto do código (logs, DB)
    const searchString = searchStrings[0];

    const actorInput = {
      searchStringsArray: searchStrings,
      maxCrawledPlacesPerSearch: 100,
      countryCode: 'br',
      language: 'pt',
    };

    console.log(`Disparando run para CNAE: ${cnae}`);

    const runRes = await fetch(`${APIFY_BASE}/acts/${ACTOR_ID}/runs?token=${apifyToken}&memory=256`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(actorInput),
    });

    if (!runRes.ok) {
      const errText = await runRes.text();
      console.error('Erro ao disparar run:', errText.slice(0, 300));
      return new Response(
        JSON.stringify({ success: false, error: `Erro ao iniciar Apify: ${runRes.status}` }),
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

    const deadline = Date.now() + MAX_WAIT_MS;
    let status = 'RUNNING';

    while (Date.now() < deadline && (status === 'RUNNING' || status === 'READY')) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${apifyRunId}?token=${apifyToken}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        status = statusData?.data?.status || 'UNKNOWN';
        console.log(`Run status: ${status}`);
      }
    }

    if (status !== 'SUCCEEDED') {
      console.error(`Run terminou com status: ${status}`);
      return new Response(
        JSON.stringify({ success: false, error: `Run Apify terminou com status: ${status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const itemsRes = await fetch(
      `${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyToken}&limit=300`,
    );

    if (!itemsRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao buscar resultados do dataset.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allPlaces: ApifyPlace[] = await itemsRes.json();
    console.log(`Dataset retornou ${allPlaces.length} lugares`);

    // Filtra pelos campos obrigatórios definidos pelo usuário
    // Campos suportados vindos do Google Places: phone, website, rating
    const places = requiredFields.length === 0 ? allPlaces : allPlaces.filter((p) => {
      if (requiredFields.includes('has_phone') && !p.phone) return false;
      if (requiredFields.includes('has_website') && !p.website) return false;
      if (requiredFields.includes('has_rating') && !(p.totalScore && p.totalScore > 0)) return false;
      return true;
    });
    console.log(`Após filtro de qualidade: ${places.length} lugares (${allPlaces.length - places.length} descartados)`);

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

    let savedRunId: string | null = null;

    if (!supabase) {
      console.warn('Supabase client not configured. Skipping persistence of scraping data.');
    } else {
      try {
        const { data: runInsert, error: runError } = await supabase
          .from('scraping_runs')
          .insert({
            source: 'search-cnae-apify',
            filters_json: {
              cnae,
              estado: estado || null,
              page,
              searchString,
              apifyRunId,
              datasetId,
            },
          })
          .select('id')
          .single();

        if (runError) {
          console.error('Error inserting scraping_run:', runError);
        } else {
          savedRunId = runInsert?.id ?? null;
        }

        if (savedRunId) {
          const { error: filterError } = await supabase.from('cnae_filters').insert({
            run_id: savedRunId,
            cnae_code: cnae,
            cnae_description: descricao,
            uf: estado || null,
            raw: {
              cnae,
              estado: estado || null,
              page,
              searchString,
              actorInput,
            },
          });

          if (filterError) {
            console.error('Error inserting cnae_filters:', filterError);
          }
        }

        if (savedRunId && leads.length > 0) {
          // Busca placeIds já salvos para este CNAE para evitar duplicatas
          const { data: existingRows } = await supabase
            .from('leads')
            .select('raw')
            .eq('cnae_code', cnae);

          const existingPlaceIds = new Set(
            (existingRows ?? []).map((r: any) => r.raw?.id).filter(Boolean)
          );

          const newLeads = leads.filter((l) => l.id && !existingPlaceIds.has(l.id));
          console.log(`${leads.length} leads scrapeados, ${newLeads.length} novos (${leads.length - newLeads.length} duplicatas ignoradas)`);

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

          if (leadsError) {
            console.error('Error inserting leads:', leadsError);
          }
        }
      } catch (dbError) {
        console.error('Unexpected error while saving scraping data:', dbError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        leads,
        total: leads.length,
        pages: 1,
        currentPage: page,
        savedRunId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Erro:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Erro ao buscar leads' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

interface Lead {
  id: string;
  companyName: string;
  cnae: string;
  cnpj: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  estimatedRevenue: number;
  status: string;
  website?: string;
  address?: string;
  rating?: number;
  reviewsCount?: number;
}

interface ApifyPlace {
  placeId?: string;
  title: string;
  address?: string;
  phone?: string;
  website?: string;
  totalScore?: number;
  reviewsCount?: number;
}

// Endereços do Google Places no Brasil: "Rua X, 123 - Bairro, Cidade - SP, Brasil"
// O padrão "Cidade - UF" aparece como penúltimo segmento separado por vírgula
function extractCity(address: string): string {
  if (!address) return '';
  const parts = address.split(',').map((part) => part.trim());
  // Penúltimo segmento contém "Cidade - UF" ou apenas "Cidade"
  const segment = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  // Remove o sufixo " - UF" caso exista
  return segment.replace(/\s*-\s*[A-Z]{2}$/, '').trim();
}

const BR_STATES = new Set([
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]);

function extractState(address: string, fallback?: string): string {
  if (!address) return fallback || '';
  // Procura padrão "- UF," ou "- UF " ao final do segmento de cidade
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
