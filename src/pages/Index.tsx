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

  const fetchLeadsForCnae = useCallback(async (code: string) => {
    setLoading(true);
    try {
      const { leads } = await searchLeadsByCnae(code);
      setAllLeads((prev) => {
        // Remove old leads for this CNAE, add new ones
        const withoutOld = prev.filter((l) => l.cnae !== code);
        return [...withoutOld, ...leads];
      });
      if (leads.length > 0) {
        toast.success(`${leads.length} leads encontrados para CNAE ${code}`);
      } else {
        toast.info(`Nenhum lead encontrado para CNAE ${code}`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Erro ao buscar CNAE ${code}: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const addCnae = useCallback(
    async (code: string, name: string) => {
      if (cnaeCodes.some((c) => c.code === code)) {
        toast.info("Esse CNAE já está na lista. Buscando leads...");
        setActiveCnaes((prev) => (prev.includes(code) ? prev : [...prev, code]));
        await supabase.from("cnae_filters").update({ is_active: true }).eq("code", code);
        fetchLeadsForCnae(code);
        return;
      }
      const newCnae: CnaeCode = { code, shortName: name, description: name };
      setCnaeCodes((prev) => [...prev, newCnae]);
      setActiveCnaes((prev) => [...prev, code]);
      await supabase.from("cnae_filters").upsert({ code, short_name: name, description: name, is_active: true });
      fetchLeadsForCnae(code);
    },
    [cnaeCodes, fetchLeadsForCnae]
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
    return baseLeads.filter((lead) => {
      if (activeCnaes.length > 0 && !activeCnaes.includes(lead.cnae)) return false;
      if (search && !lead.companyName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [baseLeads, activeCnaes, search]);

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
        <LeadsTable leads={filteredLeads} onSelectLead={setSelectedLead} loading={loading} />
      </main>
      <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
};

export default Index;
