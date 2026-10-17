import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { legal } from "@/content/es";

export const metadata: Metadata = {
  title: "Política de privacidad",
  alternates: { canonical: "/privacidad" },
};
export default function Page() {
  return <LegalPage doc={legal.privacy} />;
}
