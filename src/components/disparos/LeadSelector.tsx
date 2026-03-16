import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Lead } from "@/data/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface LeadSelectorProps {
  selectedIds: Set<string>;
  // Always pass the full currently-loaded leads list as second arg so the parent
  // can replace (not accumulate) its local copy on every source switch.
  onSelectionChange: (ids: Set<string>, leads: Lead[]) => void;
  sessionLeads: Lead[];
}

export function LeadSelector({
  selectedIds,
  onSelectionChange,
  sessionLeads,
}: LeadSelectorProps) {
  const [source, setSource] = useState<"session" | "saved">("saved");
  const [savedLeads, setSavedLeads] = useState<Lead[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (source !== "saved") return;
    setLoadingSaved(true);
    (supabase as any)
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }: any) => {
        if (error) {
          toast.error("Erro ao carregar leads salvos.");
          return;
        }
        const mapped: Lead[] = (data ?? []).map((row: any) => ({
          id: row.id,
          companyName: row.company_name ?? "Empresa",
          cnae: row.cnae_code ?? "",
          estimatedRevenue: Number(row.faturamento_est ?? 0),
          city: row.raw?.city ?? "",
          state: row.uf ?? "",
          phone: row.raw?.phone ?? "",
          email: row.raw?.email ?? "",
          status: row.status ?? "found",
          cnpj: row.raw?.cnpj ?? row.id,
          website: row.raw?.website,
          address: row.raw?.address,
          rating: row.raw?.rating,
          reviewsCount: row.raw?.reviewsCount,
        }));
        setSavedLeads(mapped);
      })
      .finally(() => setLoadingSaved(false));
  }, [source]);

  const baseLeads = source === "saved" ? savedLeads : sessionLeads;

  const filtered = useMemo(
    () =>
      baseLeads.filter((l) =>
        l.companyName.toLowerCase().includes(search.toLowerCase())
      ),
    [baseLeads, search]
  );

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelectionChange(next, baseLeads);
  };

  const selectAll = () => {
    const next = new Set(selectedIds);
    filtered.forEach((l) => next.add(l.id));
    onSelectionChange(next, baseLeads);
  };

  const clearAll = () => onSelectionChange(new Set(), baseLeads);

  return (
    <div className="space-y-3">
      {/* Source toggle */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={source === "saved" ? "default" : "outline"}
          onClick={() => setSource("saved")}
        >
          Salvos
        </Button>
        <Button
          size="sm"
          variant={source === "session" ? "default" : "outline"}
          onClick={() => setSource("session")}
        >
          Sessão atual
        </Button>
      </div>

      {/* Search + actions */}
      <div className="flex gap-2">
        <Input
          placeholder="Buscar empresa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 text-sm"
        />
        <Button size="sm" variant="outline" onClick={selectAll}>
          Selecionar todos ({filtered.length})
        </Button>
        {selectedIds.size > 0 && (
          <Button size="sm" variant="ghost" onClick={clearAll}>
            Limpar
          </Button>
        )}
      </div>

      {/* Selected count badge */}
      {selectedIds.size > 0 && (
        <Badge variant="secondary">
          {selectedIds.size} lead{selectedIds.size !== 1 ? "s" : ""} selecionado
          {selectedIds.size !== 1 ? "s" : ""}
        </Badge>
      )}

      {/* Lead list */}
      <ScrollArea className="h-56 rounded border">
        {loadingSaved ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
            Carregando leads...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground p-4">
            {source === "session"
              ? "Leads de sessão disponíveis apenas na página principal."
              : "Nenhum lead encontrado."}
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map((lead) => (
              <label
                key={lead.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
              >
                <Checkbox
                  checked={selectedIds.has(lead.id)}
                  onCheckedChange={() => toggle(lead.id)}
                />
                <span className="flex-1 truncate">{lead.companyName}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {lead.city}
                </span>
              </label>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
