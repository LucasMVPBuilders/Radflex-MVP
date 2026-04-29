import { Stethoscope } from "lucide-react";
import { CONTACT } from "@/lib/landing/contact";

export const AboutSection = () => (
  <section id="sobre" className="py-24">
    <div className="mx-auto max-w-7xl px-4 md:px-8">
      <div className="grid lg:grid-cols-5 gap-12 items-start">
        <div className="lg:col-span-3">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Sobre a RadFlex
          </span>
          <h2 className="mt-3 text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
            Diagnósticos ágeis com a confiança de uma equipe humana.
          </h2>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            A RadFlex é uma operação de telerradiologia que conecta clínicas e hospitais
            de todo o Brasil a um time de radiologistas especializados.
          </p>
          <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
            Mais do que tecnologia, oferecemos atendimento humanizado, suporte direto
            entre médicos e o compromisso de entregar laudos no tempo que importa para o paciente.
          </p>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl gradient-primary p-8 text-white shadow-lg">
            <div className="inline-flex rounded-xl bg-white/15 p-2.5 backdrop-blur">
              <Stethoscope className="h-5 w-5 text-white" />
            </div>
            <p className="mt-5 text-xs font-bold uppercase tracking-wider text-white/70">
              Responsável Técnico
            </p>
            <p className="mt-2 text-2xl font-extrabold leading-tight">
              {CONTACT.responsavelTecnico.nome}
            </p>
            <p className="mt-1 text-sm text-white/85">Diretor Técnico Médico</p>
            <div className="mt-6 pt-6 border-t border-white/15 space-y-1 font-mono-data text-sm text-white/90">
              <p>{CONTACT.responsavelTecnico.crm}</p>
              <p>{CONTACT.responsavelTecnico.rqe}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);
