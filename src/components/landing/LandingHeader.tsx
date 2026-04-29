import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadFlexLogo } from "@/components/RadFlexLogo";
import { whatsappLink } from "@/lib/landing/contact";

const navItems = [
  { href: "#problema", label: "O problema" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#diferenciais", label: "Diferenciais" },
  { href: "#economia", label: "Economia" },
  { href: "#sobre", label: "Sobre" },
];

export const LandingHeader = () => (
  <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
      <a href="#top" aria-label="RadFlex">
        <RadFlexLogo variant="light" />
      </a>

      <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-muted-foreground">
        {navItems.map(({ href, label }) => (
          <a key={href} href={href} className="hover:text-foreground transition-colors">
            {label}
          </a>
        ))}
      </nav>

      <Button
        asChild
        className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
      >
        <a href={whatsappLink()} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Falar no WhatsApp</span>
          <span className="sm:hidden">WhatsApp</span>
        </a>
      </Button>
    </div>
  </header>
);
