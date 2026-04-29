import { MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CONTACT, whatsappLink } from "@/lib/landing/contact";

export const CTASection = () => (
  <section className="py-24">
    <div className="mx-auto max-w-7xl px-4 md:px-8">
      <div className="relative overflow-hidden rounded-3xl gradient-dark p-12 md:p-16 shadow-xl">
        <div aria-hidden className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-purple-400/20 blur-3xl" />
        <div aria-hidden className="absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-purple-300/20 blur-3xl" />

        <div className="relative max-w-2xl">
          <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Pronto para acelerar seus laudos?
          </h2>
          <p className="mt-5 text-lg text-white/80 leading-relaxed">
            Fale agora com nossa equipe e descubra como a RadFlex pode otimizar
            o atendimento da sua clínica ou hospital — onde você estiver.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-3">
            <Button
              asChild
              size="lg"
              className="bg-white text-primary hover:bg-white/90 font-semibold text-base h-12 px-6"
            >
              <a href={whatsappLink()} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-5 w-5" />
                Falar no WhatsApp
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white font-semibold text-base h-12 px-6"
            >
              <a href={`tel:+${CONTACT.phoneRaw}`}>
                <Phone className="mr-2 h-5 w-5" />
                {CONTACT.phoneDisplay}
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  </section>
);
