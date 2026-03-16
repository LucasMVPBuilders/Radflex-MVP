import { useState, useMemo, useCallback } from "react";
import { AppSidebar } from "@/components/AppSidebar";
import { LeadsTable } from "@/components/LeadsTable";
import { LeadDetail } from "@/components/LeadDetail";
import { TopBar } from "@/components/TopBar";
import { Lead, CnaeCode } from "@/data/types";
import { searchLeadsByCnae } from "@/lib/api/searchLeads";
import { toast } from "sonner";

const Index = () => {
  const [cnaeCodes, setCnaeCodes] = useState<CnaeCode[]>([]);
  const [activeCnaes, setActiveCnaes] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);

  const toggleCnae = (code: string) => {
    setActiveCnaes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
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
    (code: string, name: string) => {
      if (cnaeCodes.some((c) => c.code === code)) {
        toast.info("Esse CNAE já está na lista. Buscando leads...");
        setActiveCnaes((prev) => (prev.includes(code) ? prev : [...prev, code]));
        fetchLeadsForCnae(code);
        return;
      }
      const newCnae: CnaeCode = { code, shortName: name, description: name };
      setCnaeCodes((prev) => [...prev, newCnae]);
      setActiveCnaes((prev) => [...prev, code]);
      fetchLeadsForCnae(code);
    },
    [cnaeCodes, fetchLeadsForCnae]
  );

  const removeCnae = useCallback((code: string) => {
    setCnaeCodes((prev) => prev.filter((c) => c.code !== code));
    setActiveCnaes((prev) => prev.filter((c) => c !== code));
    setAllLeads((prev) => prev.filter((l) => l.cnae !== code));
    toast("CNAE removido.");
  }, []);

  const filteredLeads = useMemo(() => {
    return allLeads.filter((lead) => {
      if (!activeCnaes.includes(lead.cnae)) return false;
      if (search && !lead.companyName.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [allLeads, activeCnaes, search]);

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar
        activeFilter={activeCnaes}
        onToggleCnae={toggleCnae}
        cnaeCodes={cnaeCodes}
        onAddCnae={addCnae}
        onRemoveCnae={removeCnae}
        totalLeads={filteredLeads.length}
      />
      <main className="ml-64 p-6">
        <TopBar
          search={search}
          onSearchChange={setSearch}
          resultCount={filteredLeads.length}
          loading={loading}
        />
        <LeadsTable leads={filteredLeads} onSelectLead={setSelectedLead} loading={loading} />
      </main>
      <LeadDetail lead={selectedLead} onClose={() => setSelectedLead(null)} />
    </div>
  );
};

export default Index;
