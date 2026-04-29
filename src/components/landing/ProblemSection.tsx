import { Hourglass, Users, AlertCircle } from "lucide-react";

const problems = [
  {
    icon: Hourglass,
    title: "Laudos atrasam",
    desc: "Pacientes esperam dias por um diagnóstico que deveria sair em horas.",
  },
  {
    icon: Users,
    title: "Filas longas",
    desc: "Salas de espera lotadas e pacientes frustrados — impactando a credibilidade da sua clínica.",
  },
  {
    icon: AlertCircle,
    title: "Equipe sobrecarregada",
    desc: "Médicos cobrindo plantões fora de hora e processos descentralizados.",
  },
];

export const ProblemSection = () => (
  <section id="problema" className="py-24">
    <div className="mx-auto max-w-7xl px-4 md:px-8">
      <div className="max-w-2xl">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">O problema</span>
        <h2 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
          Seu paciente não pode esperar.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
          Em clínicas e hospitais, cada minuto entre o exame e o laudo conta.
          Quando o processo é lento, a confiança na sua operação é a primeira a sofrer.
        </p>
      </div>

      <div className="mt-14 grid md:grid-cols-3 gap-6">
        {problems.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="rounded-2xl border border-border bg-card p-6 transition-shadow hover:shadow-md"
          >
            <div className="rounded-lg bg-secondary inline-flex p-2.5">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="mt-4 text-xl font-bold text-foreground">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
