import { Instagram, MessageCircle } from "lucide-react";
import { RadFlexLogo } from "@/components/RadFlexLogo";
import { CONTACT, whatsappLink } from "@/lib/landing/contact";

export const LandingFooter = () => (
  <footer className="bg-navy text-navy-foreground">
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-14">
      <div className="grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <RadFlexLogo variant="dark" />
          <p className="mt-5 text-sm text-navy-foreground/70 leading-relaxed max-w-md">
            Telerradiologia para clínicas e hospitais em todo o Brasil.
            Laudos médicos à distância com agilidade, precisão e suporte humanizado.
          </p>

          <div className="mt-6 flex items-center gap-3">
            <a
              href={CONTACT.instagram.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Instagram ${CONTACT.instagram.handle}`}
              className="inline-flex items-center gap-2 rounded-full border border-navy-foreground/15 bg-navy-foreground/5 px-3.5 py-2 text-sm text-navy-foreground/85 hover:bg-navy-foreground/10 hover:text-white transition-colors"
            >
              <Instagram className="h-4 w-4" />
              {CONTACT.instagram.handle}
            </a>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-navy-foreground/60">
            Contato
          </p>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a
                href={whatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-navy-foreground/90 hover:text-white transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                {CONTACT.phoneDisplay}
              </a>
            </li>
            <li className="text-navy-foreground/70">{CONTACT.domain}</li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-navy-foreground/60">
            Responsável Técnico
          </p>
          <ul className="mt-4 space-y-1 text-sm text-navy-foreground/80 font-mono-data">
            <li>{CONTACT.responsavelTecnico.nome}</li>
            <li>{CONTACT.responsavelTecnico.crm}</li>
            <li>{CONTACT.responsavelTecnico.rqe}</li>
          </ul>
        </div>
      </div>

      <div className="mt-12 pt-6 border-t border-navy-foreground/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-2 text-xs text-navy-foreground/60">
        <p>© {new Date().getFullYear()} RadFlex Diagnósticos. Todos os direitos reservados.</p>
        <p>
          Diretor Técnico Médico: {CONTACT.responsavelTecnico.nome}
          {" · "}
          {CONTACT.responsavelTecnico.crm}
          {" | "}
          {CONTACT.responsavelTecnico.rqe}
        </p>
      </div>
    </div>
  </footer>
);
