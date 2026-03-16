const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cnae, estado, page = 1 } = await req.json();

    if (!cnae) {
      return new Response(
        JSON.stringify({ success: false, error: 'CNAE é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const cnaeClean = cnae.replace(/[-\/]/g, '');
    console.log(`Searching CNAE: ${cnae} (clean: ${cnaeClean}), estado: ${estado || 'todos'}, page: ${page}`);

    const apiToken = Deno.env.get('CNPJWS_API_TOKEN');
    
    if (!apiToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Token CNPJ.ws não configurado. Acesse cnpj.ws para obter um token gratuito.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CNPJ.ws commercial API - search by CNAE
    const params = new URLSearchParams({
      atividade_principal_id: cnaeClean,
      pagina: String(page),
      situacao_cadastral_id: '2', // ATIVA
    });

    if (estado) {
      // Map state abbreviation to CNPJ.ws estado_id
      const estadoMap: Record<string, string> = {
        'AC': '1', 'AL': '2', 'AP': '3', 'AM': '4', 'BA': '5',
        'CE': '6', 'DF': '7', 'ES': '8', 'GO': '9', 'MA': '10',
        'MT': '11', 'MS': '12', 'MG': '13', 'PA': '14', 'PB': '15',
        'PR': '16', 'PE': '17', 'PI': '18', 'RJ': '19', 'RN': '20',
        'RS': '21', 'RO': '22', 'RR': '23', 'SC': '24', 'SP': '25',
        'SE': '26', 'TO': '27',
      };
      const id = estadoMap[estado.toUpperCase()];
      if (id) params.set('estado_id', id);
    }

    const url = `https://comercial.cnpj.ws/pesquisa?${params.toString()}`;
    console.log('Requesting CNPJ.ws:', url);

    const response = await fetch(url, {
      headers: {
        'x_api_token': apiToken,
        'Accept': 'application/json',
      },
    });

    console.log(`CNPJ.ws status: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      console.error('CNPJ.ws error:', errText.slice(0, 300));
      return new Response(
        JSON.stringify({ success: false, error: `Erro da API CNPJ.ws: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const cnpjs: string[] = data.cnpjs || data.data || [];
    const pagination = data.paginacao || {};

    console.log(`Found ${cnpjs.length} CNPJs, total: ${pagination.total || 'unknown'}`);

    // Now fetch details for each CNPJ using the public API
    const leads: Lead[] = [];
    
    const detailPromises = cnpjs.slice(0, 20).map(async (cnpjNum: string) => {
      const cleanCnpj = cnpjNum.replace(/\D/g, '');
      try {
        // Use CNPJ.ws public API for details (free, rate limited)
        const detailUrl = `https://publica.cnpj.ws/cnpj/${cleanCnpj}`;
        const detailRes = await fetch(detailUrl, {
          headers: { 'Accept': 'application/json' },
        });

        if (detailRes.ok) {
          const c = await detailRes.json();
          const est = c.estabelecimento || {};
          return {
            id: cleanCnpj,
            companyName: est.nome_fantasia || c.razao_social || 'Empresa',
            cnae: cnae,
            cnpj: formatCnpj(cleanCnpj),
            city: est.cidade?.nome || '',
            state: est.estado?.sigla || '',
            phone: formatPhone(est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : ''),
            email: (est.correio_eletronico || '').toLowerCase().trim(),
            estimatedRevenue: estimateRevenueFromCapital(c.capital_social, c.porte?.descricao || ''),
            status: 'found' as const,
          };
        } else {
          // Fallback: use BrasilAPI
          const brUrl = `https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`;
          const brRes = await fetch(brUrl);
          if (brRes.ok) {
            const b = await brRes.json();
            return {
              id: cleanCnpj,
              companyName: b.nome_fantasia || b.razao_social || 'Empresa',
              cnae: cnae,
              cnpj: formatCnpj(cleanCnpj),
              city: b.municipio || '',
              state: b.uf || '',
              phone: formatPhone(b.ddd_telefone_1 || ''),
              email: (b.correio_eletronico || '').toLowerCase().trim(),
              estimatedRevenue: estimateRevenueFromCapital(b.capital_social, b.porte || ''),
              status: 'found' as const,
            };
          }
        }
      } catch (e) {
        console.log(`Failed to fetch details for ${cleanCnpj}:`, e.message);
      }
      return null;
    });

    const results = await Promise.all(detailPromises);
    for (const r of results) {
      if (r) leads.push(r);
    }

    console.log(`Total leads with details: ${leads.length}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        leads, 
        total: pagination.total || leads.length,
        pages: pagination.paginas || 1,
        currentPage: pagination.pagina || page,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
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
}

function formatCnpj(cnpj: string): string {
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length !== 14) return cnpj;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12)}`;
}

function formatPhone(phone: string): string {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '').replace(/^0+/, '');
  if (clean.length === 11) return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7)}`;
  if (clean.length === 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return phone;
}

function estimateRevenueFromCapital(capitalSocial: number | string | undefined, porte: string): number {
  const p = (porte || '').toLowerCase();
  if (p.includes('grande') || p.includes('demais')) return 5000000 + Math.floor(Math.random() * 10000000);
  if (p.includes('medio') || p.includes('médio')) return 1500000 + Math.floor(Math.random() * 3000000);
  if (p.includes('pequeno')) return 500000 + Math.floor(Math.random() * 1500000);
  if (p.includes('micro') || p.includes('mei')) return 100000 + Math.floor(Math.random() * 400000);
  
  const cap = typeof capitalSocial === 'number' ? capitalSocial : parseFloat(String(capitalSocial || '0'));
  if (cap > 1000000) return cap * 3;
  if (cap > 100000) return cap * 5;
  if (cap > 10000) return cap * 8;
  
  return 300000 + Math.floor(Math.random() * 1500000);
}
