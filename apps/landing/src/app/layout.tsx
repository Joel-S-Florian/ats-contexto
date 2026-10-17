import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { plans, planKeys } from "@ats/shared";
import { brand, hero } from "@/content/es";
import { SITE_URL } from "@/lib-site";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

const description =
  "ATS para empresas dominicanas: recibe postulaciones en tu página de empleo, preselecciona con reglas o IA explicada y gestiona entrevistas, evaluación y contratación en un solo lugar.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${brand.name}: ${hero.title}`, template: `%s | ${brand.name}` },
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_DO",
    siteName: brand.name,
    title: `${brand.name}: ${hero.title}`,
    description,
    url: SITE_URL,
  },
  twitter: { card: "summary_large_image", title: brand.name, description },
  robots: { index: true, follow: true },
};

// Datos estructurados (SEO): organización y producto con sus planes, generados desde la misma fuente de precios.
const jsonLd = [
  { "@context": "https://schema.org", "@type": "Organization", name: brand.name, url: SITE_URL },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: brand.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description,
    offers: planKeys.map((k) => ({
      "@type": "Offer",
      name: plans[k].name,
      price: plans[k].priceUsd,
      priceCurrency: "USD",
      url: `${SITE_URL}/#planes`,
    })),
  },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-DO" className={inter.variable} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body>
        <a href="#contenido" className="skip-link">
          Saltar al contenido
        </a>
        {children}
      </body>
    </html>
  );
}
