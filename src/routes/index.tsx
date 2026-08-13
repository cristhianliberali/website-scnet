import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/scnet/header";
import type { SelectedPlan } from "@/components/scnet/contract-form";
import { fetchPlanos } from "@/lib/fetch-planos";
import {
  Hero,
  SocialBar,
  Diferenciais,
  Planos,
  Beneficios,
  ComoContratar,
  Empresas,
  Depoimentos,
  Faq,
  CtaFinal,
  Footer,
  WhatsFloat,
} from "@/components/scnet/sections";

const title = "SCNET — Internet fibra óptica no Oeste e Litoral de SC";
const description =
  "Wi-Fi rápido e estável na casa toda. Planos de fibra a partir de R$ 109,90/mês, roteador incluso e suporte local. Assine em minutos.";

export const Route = createFileRoute("/")({
  // Planos vêm do Postgres no servidor, então já saem renderizados no HTML.
  loader: async () => ({ planos: await fetchPlanos() }),
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { planos } = Route.useLoaderData();
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(null);

  return (
    <div className="min-h-screen bg-background font-body">
      <Header />
      <main>
        <Hero />
        <SocialBar />
        <Planos plans={planos} onSelectPlan={setSelectedPlan} />
        <Diferenciais />
        <Beneficios />
        <ComoContratar />
        <Empresas />
        <Depoimentos />
        <Faq />
        <CtaFinal selectedPlan={selectedPlan} />
      </main>
      <Footer />
      <WhatsFloat />
      <Toaster />
    </div>
  );
}
