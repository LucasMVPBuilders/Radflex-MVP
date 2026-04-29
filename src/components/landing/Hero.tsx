import { ArrowRight, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { whatsappLink } from "@/lib/landing/contact";

export const Hero = () => (
  <section id="top" className="relative overflow-hidden gradient-dark">
    <div aria-hidden className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-purple-400/20 blur-3xl" />
    <div aria-hidden className="absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-purple-300/20 blur-3xl" />

    <div className="relative mx-auto max-w-7xl px-4 md:px-8 py-24 md:py-32">
      <div className="max-w-3xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white/90 backdrop-blur">
          Telerradiologia · Cobertura nacional
        </span>

        <h1 className="mt-6 text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.05] tracking-tight text-white">
          Laudos médicos à distância,
          <br className="hidden md:block" />
          <span className="text-purple-200"> em qualquer lugar do Brasil.</span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg md:text-xl text-white/80 leading-relaxed">
          Conectamos clínicas e hospitais a uma equipe de radiologistas especializados.
          Diagnósticos ágeis, tecnologia avançada e suporte humanizado — 24 horas por dia.
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
            <a href="#como-funciona">
              Como funciona
              <ArrowRight className="ml-2 h-5 w-5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  </section>
);
