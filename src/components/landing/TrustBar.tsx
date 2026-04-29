import { Clock, MapPin, Sparkles, ShieldCheck } from "lucide-react";

const items = [
  { icon: Clock, title: "Atendimento 24/7", desc: "Laudos a qualquer hora" },
  { icon: MapPin, title: "Cobertura nacional", desc: "Todo o território brasileiro" },
  { icon: Sparkles, title: "PACS Inteligente", desc: "Imagem digital e IA assistida" },
  { icon: ShieldCheck, title: "Equipe especializada", desc: "Radiologistas certificados" },
];

export const TrustBar = () => (
  <section className="border-y border-border bg-secondary/40">
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-10">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
        {items.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-start gap-3">
            <div className="flex-none rounded-lg bg-primary/10 p-2.5">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-foreground text-sm">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);
