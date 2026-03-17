import { useState, useMemo, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { LeadsTable } from "@/components/LeadsTable";
import { LeadDetail } from "@/components/LeadDetail";
import { TopBar } from "@/components/TopBar";
import { Lead, CnaeCode } from "@/data/types";
import { searchLeadsByCnae } from "@/lib/api/searchLeads";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, SlidersHorizontal, Phone, Mail, Globe, Star, PhoneOff, CheckCircle2 } from "lucide-react";

const QUALITY_FILTERS: {
  id: string;
  label: string;
  icon: React.ElementType;
  pred: (l: Lead) => boolean;
  // true = filtro é enviado à Edge Function (campo disponível no Google Places)
  // false = filtro apenas client-side (ex: email que o Google não fornece)
  searchable: boolean;
}[] = [
  { id: "has_phone",   label: "Com telefone",  icon: Phone,        pred: (l) => !!l.phone,                     searchable: true  },
  { id: "has_website", label: "Com site",       icon: Globe,        pred: (l) => !!l.website,                   searchable: true  },
  { id: "has_rating",  label: "Com avaliação",  icon: Star,         pred: (l) => !!l.rating && l.rating > 0,    searchable: true  },
  { id: "has_email",   label: "Com email",      icon: Mail,         pred: (l) => !!l.email,                     searchable: false },
  { id: "no_contact",  label: "Sem contato",    icon: PhoneOff,     pred: (l) => !l.phone && !l.email,          searchable: false },
  { id: "complete",    label: "Completos",      icon: CheckCircle2, pred: (l) => !!l.phone && !!l.website,      searchable: false },
];

// IDs que podem ser passados à Edge Function
const SEARCHABLE_IDS = new Set(QUALITY_FILTERS.filter((f) => f.searchable).map((f) => f.id));

const BR_STATES = [
  { uf: "AC", nome: "Acre" }, { uf: "AL", nome: "Alagoas" }, { uf: "AP", nome: "Amapá" },
  { uf: "AM", nome: "Amazonas" }, { uf: "BA", nome: "Bahia" }, { uf: "CE", nome: "Ceará" },
  { uf: "DF", nome: "Distrito Federal" }, { uf: "ES", nome: "Espírito Santo" }, { uf: "GO", nome: "Goiás" },
  { uf: "MA", nome: "Maranhão" }, { uf: "MT", nome: "Mato Grosso" }, { uf: "MS", nome: "Mato Grosso do Sul" },
  { uf: "MG", nome: "Minas Gerais" }, { uf: "PA", nome: "Pará" }, { uf: "PB", nome: "Paraíba" },
  { uf: "PR", nome: "Paraná" }, { uf: "PE", nome: "Pernambuco" }, { uf: "PI", nome: "Piauí" },
  { uf: "RJ", nome: "Rio de Janeiro" }, { uf: "RN", nome: "Rio Grande do Norte" },
  { uf: "RS", nome: "Rio Grande do Sul" }, { uf: "RO", nome: "Rondônia" }, { uf: "RR", nome: "Roraima" },
  { uf: "SC", nome: "Santa Catarina" }, { uf: "SP", nome: "São Paulo" }, { uf: "SE", nome: "Sergipe" },
  { uf: "TO", nome: "Tocantins" },
];

const Index = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  const [cnaeCodes, setCnaeCodes] = useState<CnaeCode[]>([]);
  const [activeCnaes, setActiveCnaes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [savedLeads, setSavedLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"session" | "saved">("session");
  // Rastreia em qual batch cada CNAE está (0 = busca inicial, 1+ = por região)
  const [cnaeBatchMap, setCnaeBatchMap] = useState<Record<string, number>>({});
  // Estados selecionados para o filtro de "buscar mais" (vazio = geral)
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  // Filtros de qualidade/completude dos leads (vazio = mostrar todos)
  const [qualityFilters, setQualityFilters] = useState<string[]>([]);

  // Carrega filtros CNAE do Supabase na montagem
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("cnae_filters")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) { console.error(error); return; }
      const codes: CnaeCode[] = (data ?? []).map((r) => ({
        code: r.code,
        shortName: r.short_name,
        description: r.description ?? r.short_name,
      }));
      setCnaeCodes(codes);
      setActiveCnaes((data ?? []).filter((r) => r.is_active).map((r) => r.code));
    };
    load();
  }, []);

  useEffect(() => {
    if (mode !== "saved") return;

    let cancelled = false;

    const loadSavedLeads = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("leads")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500);

        if (cancelled) return;

        if (error) {
          console.error(error);
          toast.error("Erro ao carregar leads salvos.");
          return;
        }

        const mapped: Lead[] = (data || []).map((row: any) => ({
          id: row.id,
          companyName: row.company_name ?? "Empresa",
          cnae: row.cnae_code ?? "",
          estimatedRevenue: Number(row.faturamento_est ?? 0),
          city: row.raw?.city ?? row.raw?.estabelecimento?.cidade?.nome ?? "",
          state: row.uf ?? "",
          phone: row.raw?.phone ?? "",
          email: row.raw?.email ?? "",
          status: (row.status as Lead["status"]) ?? "found",
          cnpj: row.raw?.cnpj ?? row.id,
          website: row.raw?.website ?? undefined,
          address: row.raw?.address ?? undefined,
          rating: row.raw?.rating ?? undefined,
          reviewsCount: row.raw?.reviewsCount ?? undefined,
        }));

        setSavedLeads(mapped);
      } catch (err: any) {
        if (cancelled) return;
        console.error(err);
        toast.error("Erro inesperado ao carregar leads salvos.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSavedLeads();
    return () => { cancelled = true; };
  }, [mode]);

  const toggleCnae = async (code: string) => {
    const nowActive = !activeCnaes.includes(code);
    setActiveCnaes((prev) =>
      nowActive ? [...prev, code] : prev.filter((c) => c !== code)
    );
    await supabase.from("cnae_filters").update({ is_active: nowActive }).eq("code", code);
  };

  const fetchLeadsForCnae = useCallback(async (
    code: string,
    append = false,
    batch = 0,
    estados?: string[],
    requiredFields?: string[],
  ) => {
    setLoading(true);
    try {
      const { leads } = await searchLeadsByCnae(code, undefined, 1, batch, estados, requiredFields);
      setAllLeads((prev) => {
        if (append) {
          const existingIds = new Set(prev.map((l) => l.id));
          const newLeads = leads.filter((l) => !existingIds.has(l.id));
          return [...prev, ...newLeads];
        }
        const withoutOld = prev.filter((l) => l.cnae !== code);
        return [...withoutOld, ...leads];
      });
      if (leads.length > 0) {
        toast.success(`${leads.length} leads encontrados para CNAE ${code}`);
      } else {
        toast.info(`Nenhum lead novo encontrado para CNAE ${code}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao buscar CNAE ${code}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMoreLeads = useCallback((estados?: string[]) => {
    if (activeCnaes.length === 0) {
      toast.info("Adicione um CNAE para buscar mais leads.");
      return;
    }
    const requiredFields = qualityFilters.filter((id) => SEARCHABLE_IDS.has(id));
    if (estados && estados.length > 0) {
      activeCnaes.forEach((code) => fetchLeadsForCnae(code, true, 0, estados, requiredFields));
    } else {
      activeCnaes.forEach((code) => {
        const nextBatch = (cnaeBatchMap[code] ?? 0) + 1;
        setCnaeBatchMap((prev) => ({ ...prev, [code]: nextBatch }));
        fetchLeadsForCnae(code, true, nextBatch, undefined, requiredFields);
      });
    }
  }, [activeCnaes, cnaeBatchMap, qualityFilters, fetchLeadsForCnae]);

  const addCnae = useCallback(
    async (code: string, name: string) => {
      const requiredFields = qualityFilters.filter((id) => SEARCHABLE_IDS.has(id));
      if (cnaeCodes.some((c) => c.code === code)) {
        toast.info("Esse CNAE já está na lista. Buscando leads...");
        setActiveCnaes((prev) => (prev.includes(code) ? prev : [...prev, code]));
        await supabase.from("cnae_filters").update({ is_active: true }).eq("code", code);
        fetchLeadsForCnae(code, false, 0, undefined, requiredFields);
        return;
      }
      const newCnae: CnaeCode = { code, shortName: name, description: name };
      setCnaeCodes((prev) => [...prev, newCnae]);
      setActiveCnaes((prev) => [...prev, code]);
      await supabase.from("cnae_filters").upsert({ code, short_name: name, description: name, is_active: true });
      fetchLeadsForCnae(code, false, 0, undefined, requiredFields);
    },
    [cnaeCodes, qualityFilters, fetchLeadsForCnae]
  );

  const removeCnae = useCallback(async (code: string) => {
    setCnaeCodes((prev) => prev.filter((c) => c.code !== code));
    setActiveCnaes((prev) => prev.filter((c) => c !== code));
    setAllLeads((prev) => prev.filter((l) => l.cnae !== code));
    await supabase.from("cnae_filters").delete().eq("code", code);
    toast("CNAE removido.");
  }, []);

  const baseLeads = mode === "session" ? allLeads : savedLeads;

  const filteredLeads = useMemo(() => {
    const activePredicates = QUALITY_FILTERS
      .filter((f) => qualityFilters.includes(f.id))
      .map((f) => f.pred);

    return baseLeads.filter((lead) => {
      if (activeCnaes.length > 0 && !activeCnaes.includes(lead.cnae)) return false;
      if (search && !lead.companyName.toLowerCase().includes(search.toLowerCase())) return false;
      if (activePredicates.length > 0 && !activePredicates.every((pred) => pred(lead))) return false;
      return true;
    });
  }, [baseLeads, activeCnaes, search, qualityFilters]);

  const handleExportCsv = useCallback(() => {
    if (filteredLeads.length === 0) {
      toast.info("Nenhum lead para exportar.");
      return;
    }

    const headers = [
      "Empresa",
      "CNAE",
      "CNPJ",
      "Cidade",
      "UF",
      "Email",
      "Telefone",
      "Faturamento Estimado",
      "Status",
    ];

    const rows = filteredLeads.map((lead) => [
      lead.companyName,
      lead.cnae,
      lead.cnpj,
      lead.city,
      lead.state,
      lead.email,
      lead.phone,
      String(lead.estimatedRevenue),
      lead.status,
    ]);

    const csvContent =
      [headers, ...rows]
        .map((row) =>
          row
            .map((cell) => {
              const value = cell ?? "";
              const normalized = String(value).replace(/"/g, '""');
              return `"${normalized}"`;
            })
            .join(";")
        )
        .join("\n");

    // BOM UTF-8 garante que o Excel brasileiro abra com acentos corretos
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "radiflex_leads.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("CSV exportado com sucesso.");
  }, [filteredLeads]);

  const escapeHtml = (value: string | number | undefined | null): string => {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  const handleExportPdf = useCallback(() => {
    if (filteredLeads.length === 0) {
      toast.info("Nenhum lead para exportar.");
      return;
    }

    const popup = window.open("", "_blank", "width=1024,height=768");
    if (!popup) {
      toast.error("Não foi possível abrir a janela de impressão.");
      return;
    }

    const htmlRows = filteredLeads
      .map(
        (lead) => `
        <tr>
          <td>${escapeHtml(lead.companyName)}</td>
          <td>${escapeHtml(lead.cnae)}</td>
          <td>${escapeHtml(lead.cnpj)}</td>
          <td>${escapeHtml(lead.city)}</td>
          <td>${escapeHtml(lead.state)}</td>
          <td>${escapeHtml(lead.email)}</td>
          <td>${escapeHtml(lead.phone)}</td>
          <td>${escapeHtml(lead.estimatedRevenue)}</td>
          <td>${escapeHtml(lead.status)}</td>
        </tr>`
      )
      .join("");

    popup.document.write(`
      <html>
        <head>
          <title>Leads - RadiFlex</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            h1 { font-size: 20px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
            th { background: #f4f4f5; }
          </style>
        </head>
        <body>
          <h1>Leads exportados - RadiFlex</h1>
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>CNAE</th>
                <th>CNPJ</th>
                <th>Cidade</th>
                <th>UF</th>
                <th>Email</th>
                <th>Telefone</th>
                <th>Faturamento Est.</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${htmlRows}
            </tbody>
          </table>
        </body>
      </html>
    `);
    popup.document.close();
    popup.focus();
    popup.print();

    toast.success("Abra a janela de impressão para salvar como PDF.");
  }, [filteredLeads]);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        activeFilter={activeCnaes}
        onToggleCnae={toggleCnae}
        cnaeCodes={cnaeCodes}
        onAddCnae={addCnae}
        onRemoveCnae={removeCnae}
        totalLeads={filteredLeads.length}
        onExportCsv={handleExportCsv}
        onExportPdf={handleExportPdf}
      />
      <main className="ml-64 p-6">
        <TopBar
          search={search}
          onSearchChange={setSearch}
          resultCount={filteredLeads.length}
          loading={loading}
          mode={mode}
          onModeChange={setMode}
          onLogout={handleLogout}
        />
        {/* Barra de filtros de qualidade — sempre visível para pré-definir antes de buscar */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="text-xs text-muted-foreground font-medium shrink-0">
            {baseLeads.length === 0 ? "Pré-filtrar:" : "Mostrar:"}
          </span>
          {QUALITY_FILTERS.map((f) => {
            const isActive = qualityFilters.includes(f.id);
            const count = baseLeads.filter(f.pred).length;
            const hasLeads = baseLeads.length > 0;
            const Icon = f.icon;
            return (
              <button
                key={f.id}
                title={f.searchable ? "Aplicado na busca e na exibição" : "Aplicado apenas na exibição"}
                onClick={() =>
                  setQualityFilters((prev) =>
                    isActive ? prev.filter((id) => id !== f.id) : [...prev, f.id]
                  )
                }
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                }`}
              >
                <Icon className="h-3 w-3" />
                {f.label}
                {f.searchable && (
                  <span className={`text-[10px] font-bold ${isActive ? "opacity-70" : "opacity-40"}`} title="Afeta a busca">
                    ●
                  </span>
                )}
                {hasLeads && (
                  <span className={`text-[10px] ${isActive ? "opacity-80" : "opacity-60"}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          {qualityFilters.length > 0 && (
            <button
              onClick={() => setQualityFilters([])}
              className="text-xs text-muted-foreground hover:text-foreground underline ml-1"
            >
              limpar
            </button>
          )}
        </div>

        {mode === "session" && activeCnaes.length > 0 && (
          <div className="flex justify-end mb-3">
            <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" disabled={loading} className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Buscar mais leads
                  {selectedStates.length > 0 && (
                    <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
                      {selectedStates.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium">Filtrar por estado</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Sem seleção: busca em todo o Brasil
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => setSelectedStates(BR_STATES.map((s) => s.uf))}
                  >
                    Selecionar todos
                  </button>
                  <span className="text-xs text-muted-foreground">·</span>
                  <button
                    className="text-xs text-muted-foreground hover:underline"
                    onClick={() => setSelectedStates([])}
                  >
                    Limpar
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
                  {BR_STATES.map(({ uf, nome }) => (
                    <label
                      key={uf}
                      className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                    >
                      <Checkbox
                        checked={selectedStates.includes(uf)}
                        onCheckedChange={(checked) =>
                          setSelectedStates((prev) =>
                            checked ? [...prev, uf] : prev.filter((s) => s !== uf)
                          )
                        }
                      />
                      <span className="font-mono text-[10px] text-muted-foreground w-5">{uf}</span>
                      <span className="truncate">{nome}</span>
                    </label>
                  ))}
                </div>

                <Button
                  size="sm"
                  className="w-full gap-2"
                  disabled={loading}
                  onClick={() => {
                    setFilterPopoverOpen(false);
                    fetchMoreLeads(selectedStates.length > 0 ? selectedStates : undefined);
                  }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                  {selectedStates.length > 0
                    ? `Buscar em ${selectedStates.length} estado${selectedStates.length > 1 ? "s" : ""}`
                    : "Buscar em todo o Brasil"}
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        )}
        <LeadsTable leads={filteredLeads} onSelectLead={setSelectedLead} loading={loading} />
      </main>
      <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
};

export default Index;
