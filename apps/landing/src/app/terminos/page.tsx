import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { legal } from "@/content/es";

export const metadata: Metadata = {
  title: "Términos del servicio",
  alternates: { canonical: "/terminos" },
};
export default function Page() {
  return <LegalPage doc={legal.terms} />;
}
