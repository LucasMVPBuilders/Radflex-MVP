import { Search, Loader2, LogOut } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface TopBarProps {
  search: string;
  onSearchChange: (val: string) => void;
  resultCount: number;
  loading?: boolean;
  mode: "session" | "saved";
  onModeChange: (mode: "session" | "saved") => void;
  onLogout?: () => void;
}

export const TopBar = ({ search, onSearchChange, resultCount, loading, mode, onModeChange, onLogout }: TopBarProps) => {
  return (
    <div className="flex items-center justify-between gap-4 mb-5">
      <div>
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          Leads por CNAE
          {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        </h1>
        <p className="text-sm text-muted-foreground">
          {resultCount} {resultCount === 1 ? "resultado" : "resultados"} encontrados
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex rounded-full bg-muted p-1 text-xs">
          <button
            className={`px-3 py-1 rounded-full transition-colors ${
              mode === "session" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            }`}
            onClick={() => onModeChange("session")}
          >
            Sessão atual
          </button>
          <button
            className={`px-3 py-1 rounded-full transition-colors ${
              mode === "saved" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
            }`}
            onClick={() => onModeChange("saved")}
          >
            Meus leads
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empresa..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 w-64 h-9 text-sm"
          />
        </div>
        {onLogout && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onLogout}
            title="Sair"
            className="text-muted-foreground hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
