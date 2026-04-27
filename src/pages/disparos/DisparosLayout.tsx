import { NavLink, Outlet } from "react-router-dom";
import { AppSidebar } from "@/components/AppSidebar";
import { Send, History, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/disparos/novo", label: "Novo Disparo", icon: Send },
  { to: "/disparos/historico", label: "Histórico", icon: History },
  { to: "/disparos/templates", label: "Templates", icon: FileText },
];

export default function DisparosLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 p-6 space-y-6">
        <header className="space-y-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Send className="h-6 w-6 text-primary" />
              Disparos
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Crie campanhas, acompanhe o histórico e gerencie templates de mensagem.
            </p>
          </div>
          <nav className="flex gap-1 border-b border-border">
            {TABS.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                    isActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </header>

        <Outlet />
      </main>
    </div>
  );
}
