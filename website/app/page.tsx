import Board from "@/components/Board";
import FinalCta from "@/components/FinalCta";
import Hero from "@/components/Hero";
import LiveDemo from "@/components/LiveDemo";
import { Compat, Faq, FeatureRail, Manifesto, Marquee, QuickStart, Security, TryPrompts } from "@/components/Sections";

export default function Home() {
  return (
    <>
      <Hero />
      <Marquee />
      <Manifesto />
      <LiveDemo />
      <FeatureRail />
      <QuickStart />
      <TryPrompts />
      <Board />
      <Compat />
      <Security />
      <Faq />
      <FinalCta />
    </>
  );
}
