import { Cable, Send, FileCheck2 } from "lucide-react";

const steps = [
  {
    num: "01",
    icon: Cable,
    title: "Integração",
    desc: "Conectamos a RadFlex aos sistemas e equipamentos da sua clínica ou hospital. Zero ruptura no fluxo atual.",
  },
  {
    num: "02",
    icon: Send,
    title: "Envio do exame",
    desc: "Suas imagens chegam à nossa equipe pelo PACS Inteligente, com processamento digital e priorização automática.",
  },
  {
    num: "03",
    icon: FileCheck2,
    title: "Laudo entregue",
    desc: "Radiologistas especializados emitem o laudo em poucas horas. Disponível direto na sua plataforma, a qualquer momento.",
  },
];

export const HowItWorks = () => (
  <section id="como-funciona" className="py-24 bg-secondary/40">
    <div className="mx-auto max-w-7xl px-4 md:px-8">
      <div className="max-w-2xl">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">Como funciona</span>
        <h2 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
          Da imagem ao laudo, sem fricção.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
          Um fluxo desenhado para não pedir nada a mais da sua equipe.
        </p>
      </div>

      <div className="mt-14 grid md:grid-cols-3 gap-6">
        {steps.map(({ num, icon: Icon, title, desc }) => (
          <div
            key={num}
            className="relative rounded-2xl bg-card border border-border p-7 shadow-sm hover:shadow-md transition-shadow"
          >
            <span className="font-mono-data text-xs text-primary font-bold tracking-wider">
              PASSO {num}
            </span>
            <div className="mt-4 inline-flex rounded-xl gradient-primary p-3">
              <Icon className="h-6 w-6 text-white" />
            </div>
            <h3 className="mt-5 text-xl font-bold text-foreground">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
