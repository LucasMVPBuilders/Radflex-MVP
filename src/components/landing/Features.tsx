import { Database, ScanLine, Sparkles, Network, GraduationCap, Siren } from "lucide-react";

const features = [
  {
    icon: Database,
    title: "PACS Inteligente",
    desc: "Armazenamento e organização das imagens médicas em nuvem, com acesso rápido e seguro.",
  },
  {
    icon: ScanLine,
    title: "Radiologia Digital Avançada",
    desc: "Processamento digital que permite análises mais detalhadas e imagens de alta qualidade.",
  },
  {
    icon: Sparkles,
    title: "IA assistida",
    desc: "Inteligência artificial auxilia na identificação de padrões, dando suporte ao radiologista.",
  },
  {
    icon: Network,
    title: "Integração de sistemas",
    desc: "Conexão direta com o software da sua clínica — laudos não ficam descentralizados.",
  },
  {
    icon: GraduationCap,
    title: "Equipe capacitada",
    desc: "Radiologistas em capacitação contínua, acompanhando inovações e protocolos atuais.",
  },
  {
    icon: Siren,
    title: "Protocolo de Manchester",
    desc: "Priorização inteligente para urgências — casos mais graves recebem atenção primeiro.",
  },
];

export const Features = () => (
  <section id="diferenciais" className="py-24">
    <div className="mx-auto max-w-7xl px-4 md:px-8">
      <div className="max-w-2xl">
        <span className="text-xs font-bold uppercase tracking-wider text-primary">Diferenciais</span>
        <h2 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
          Tecnologia que entrega resultado.
        </h2>
        <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
          Cada peça da operação RadFlex é pensada para acelerar o diagnóstico
          sem comprometer a qualidade.
        </p>
      </div>

      <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="group rounded-2xl border border-border bg-card p-6 hover:border-primary/30 hover:shadow-md transition-all"
          >
            <div className="inline-flex rounded-xl bg-secondary p-2.5 group-hover:bg-primary/10 transition-colors">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <h3 className="mt-5 text-lg font-bold text-foreground">{title}</h3>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);
