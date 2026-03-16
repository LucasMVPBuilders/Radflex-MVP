import { Lead } from "@/data/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Mail, Phone, ExternalLink, ChevronUp, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

interface LeadsTableProps {
  leads: Lead[];
  onSelectLead: (lead: Lead) => void;
  loading?: boolean;
}

type SortKey = "companyName" | "estimatedRevenue" | "state" | "cnae";
type SortDir = "asc" | "desc";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value);

export const LeadsTable = ({ leads, onSelectLead, loading }: LeadsTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>("estimatedRevenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...leads].sort((a, b) => {
    const valA = a[sortKey];
    const valB = b[sortKey];
    const mod = sortDir === "asc" ? 1 : -1;
    if (typeof valA === "number" && typeof valB === "number") return (valA - valB) * mod;
    return String(valA).localeCompare(String(valB)) * mod;
  });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />;
  };

  const statusBadge = (status: Lead["status"]) => {
    switch (status) {
      case "found":
        return <Badge className="bg-success/15 text-success border-0 text-xs font-medium">Lead Found</Badge>;
      case "new":
        return <Badge className="bg-primary/15 text-primary border-0 text-xs font-medium">Novo</Badge>;
      case "exported":
        return <Badge variant="secondary" className="text-xs font-medium">Exportado</Badge>;
    }
  };

  return (
    <div className="bg-card rounded border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {(
                [
                  ["companyName", "Empresa"],
                  ["cnae", "CNAE"],
                  ["estimatedRevenue", "Faturamento Est."],
                  ["state", "UF"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th
                  key={key}
                  className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors select-none"
                  onClick={() => handleSort(key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {label}
                    <SortIcon col={key} />
                  </span>
                </th>
              ))}
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Contato
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Buscando leads...
                  </div>
                </td>
              </tr>
            )}
            {sorted.map((lead) => (
              <tr
                key={lead.id}
                className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => onSelectLead(lead)}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{lead.companyName}</div>
                  <div className="text-xs text-muted-foreground">{lead.city}{lead.city && lead.state ? ', ' : ''}{lead.state}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono-data text-xs text-muted-foreground">{lead.cnae}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-success">{formatCurrency(lead.estimatedRevenue)}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{lead.state}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title={lead.email}
                      >
                        <Mail className="h-4 w-4" />
                      </a>
                    )}
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-muted-foreground hover:text-primary transition-colors"
                        title={lead.phone}
                      >
                        <Phone className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">{statusBadge(lead.status)}</td>
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectLead(lead);
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Detalhes
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && sorted.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Nenhum lead encontrado com os filtros selecionados.
        </div>
      )}
    </div>
  );
};
