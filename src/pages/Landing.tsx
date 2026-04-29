import { LandingHeader } from "@/components/landing/LandingHeader";
import { Hero } from "@/components/landing/Hero";
import { TrustBar } from "@/components/landing/TrustBar";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Features } from "@/components/landing/Features";
import { EconomySection } from "@/components/landing/EconomySection";
import { AboutSection } from "@/components/landing/AboutSection";
import { CTASection } from "@/components/landing/CTASection";
import { LandingFooter } from "@/components/landing/LandingFooter";

const Landing = () => (
  <div className="min-h-screen bg-background text-foreground">
    <LandingHeader />
    <main>
      <Hero />
      <TrustBar />
      <ProblemSection />
      <HowItWorks />
      <Features />
      <EconomySection />
      <AboutSection />
      <CTASection />
    </main>
    <LandingFooter />
  </div>
);

export default Landing;
