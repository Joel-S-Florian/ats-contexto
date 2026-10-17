import { faq } from "@/content/es";
import { DemoForm } from "@/components/demo-form";
import { Faq } from "@/components/faq";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { Pricing } from "@/components/pricing";
import { Features, How, Problem, Trust } from "@/components/sections";

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faq.items.map((i) => ({
    "@type": "Question",
    name: i.q,
    acceptedAnswer: { "@type": "Answer", text: i.a },
  })),
};

export default function Page() {
  return (
    <>
      <Header />
      <main id="contenido">
        <Hero />
        <Problem />
        <How />
        <Features />
        <Trust />
        <Pricing />
        <Faq />
        <DemoForm />
      </main>
      <Footer />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </>
  );
}
