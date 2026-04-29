import { Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/landing/contact";

const benefits = [
  {
    title: "Redução de custos fixos",
    desc: "Menos investimento em infraestrutura e equipamentos próprios.",
  },
  {
    title: "Time de especialistas à distância",
    desc: "Sem precisar contratar e manter radiologistas em horário integral.",
  },
  {
    title: "Flexibilidade operacional",
    desc: "Otimize os recursos da sua clínica conforme a demanda real.",
  },
  {
    title: "Tecnologia que escala",
    desc: "Conectividade que cresce com você — sem nova obra ou compra de equipamento.",
  },
];

export const EconomySection = () => (
  <section id="economia" className="py-24 gradient-light">
    <div className="mx-auto max-w-7xl px-4 md:px-8">
      <div className="grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-primary">Economia</span>
          <h2 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            Reduza custos sem comprometer a qualidade.
          </h2>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Telerradiologia bem implementada não é só sobre velocidade —
            é sobre viabilidade financeira da sua clínica ou hospital no longo prazo.
          </p>
          <Button
            asChild
            size="lg"
            className="mt-8 bg-primary text-primary-foreground hover:bg-primary/90 h-12 px-6"
          >
            <a href={whatsappLink()} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="mr-2 h-5 w-5" />
              Solicitar proposta
            </a>
          </Button>
        </div>

        <ul className="space-y-4">
          {benefits.map(({ title, desc }) => (
            <li
              key={title}
              className="flex gap-4 rounded-2xl bg-card border border-border p-5 shadow-sm"
            >
              <div className="flex-none rounded-full bg-primary/10 h-7 w-7 flex items-center justify-center mt-0.5">
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground mt-1">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);
