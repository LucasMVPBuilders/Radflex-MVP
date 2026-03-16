import { Search, BarChart3, Download, Plus, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface CnaeItem {
  code: string;
  shortName: string;
  description: string;
}

interface SidebarNavProps {
  activeFilter: string[];
  onToggleCnae: (code: string) => void;
  cnaeCodes: CnaeItem[];
  onAddCnae: (code: string, name: string) => void;
  onRemoveCnae: (code: string) => void;
  totalLeads: number;
}

export const AppSidebar = ({ activeFilter, onToggleCnae, cnaeCodes, onAddCnae, onRemoveCnae, totalLeads }: SidebarNavProps) => {
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const handleAdd = () => {
    const code = newCode.trim();
    const name = newName.trim() || code;
    if (!code) return;
    onAddCnae(code, name);
    setNewCode("");
    setNewName("");
    setShowAdd(false);
  };

  return (
    <aside className="w-64 bg-navy text-navy-foreground flex flex-col h-screen fixed left-0 top-0 z-30">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-primary-foreground tracking-tight">RF</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">RadiFlex</span>
        </div>
        <p className="text-xs text-sidebar-muted mt-1">Prospecção por CNAE</p>
      </div>

      {/* Stats */}
      <div className="px-5 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 text-xs text-sidebar-muted uppercase tracking-wider mb-2">
          <BarChart3 className="h-3.5 w-3.5" />
          Resumo
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-2xl font-semibold">{totalLeads}</div>
            <div className="text-xs text-sidebar-muted">Leads</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{cnaeCodes.length}</div>
            <div className="text-xs text-sidebar-muted">CNAEs</div>
          </div>
        </div>
      </div>

      {/* CNAE Filters */}
      <div className="px-5 py-4 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs text-sidebar-muted uppercase tracking-wider">
            <Search className="h-3.5 w-3.5" />
            Filtros CNAE
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-sidebar-muted hover:text-sidebar-foreground transition-colors"
            title="Adicionar CNAE"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Add CNAE form */}
        {showAdd && (
          <div className="mb-3 p-3 rounded bg-sidebar-accent space-y-2">
            <Input
              placeholder="Código (ex: 8640-2/05)"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="h-8 text-xs bg-navy border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-muted"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Input
              placeholder="Nome curto (opcional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-xs bg-navy border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-muted"
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <Button size="sm" className="w-full h-7 text-xs" onClick={handleAdd}>
              Adicionar e Buscar
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          {cnaeCodes.map((cnae) => {
            const isActive = activeFilter.includes(cnae.code);
            return (
              <div key={cnae.code} className="group relative">
                <button
                  onClick={() => onToggleCnae(cnae.code)}
                  className={`w-full text-left px-3 py-2.5 rounded transition-colors text-sm ${
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent"
                  }`}
                >
                  <span className="font-mono-data text-xs block">{cnae.code}</span>
                  <span className="text-xs opacity-80 leading-tight block mt-0.5">{cnae.shortName}</span>
                </button>
                <button
                  onClick={() => onRemoveCnae(cnae.code)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-sidebar-muted hover:text-destructive transition-all"
                  title="Remover CNAE"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-sidebar-border">
        <button className="flex items-center gap-2 text-xs text-sidebar-muted hover:text-sidebar-foreground transition-colors w-full">
          <Download className="h-3.5 w-3.5" />
          Exportar todos (CSV)
        </button>
      </div>
    </aside>
  );
};
