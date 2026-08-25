import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/scnet/header";
import type { SelectedPlan } from "@/components/scnet/contract-form";
import { fetchPlanos } from "@/lib/fetch-planos";
import { estadoAreaCliente } from "@/lib/area-cliente";
import { planosVisiveis } from "@/lib/plans";
import {
  Hero,
  SocialBar,
  Diferenciais,
  Planos,
  Beneficios,
  Empresas,
  Depoimentos,
  Faq,
  CtaFinal,
  Footer,
  CtaFlutuante,
} from "@/components/scnet/sections";

const title = "SCNET — Internet fibra óptica no Oeste e Litoral de SC";
const description =
  "Wi-Fi rápido e estável na casa toda. Planos de fibra a partir de R$ 109,90/mês, roteador incluso e suporte local. Assine em minutos.";

// `passthrough` preserva as UTMs e os click ids na URL — só o codigo_oferta é
// lido aqui, para liberar os planos de campanha.
const searchSchema = z.object({ codigo_oferta: z.string().optional() }).passthrough();

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ codigoOferta: search.codigo_oferta }),
  // Planos vêm do Postgres no servidor, então já saem renderizados no HTML.
  // O filtro de campanha roda aqui, e não na tela, para que um plano de oferta
  // sem o código na URL não trafegue nem escondido no HTML.
  /*
   * O estado da área do cliente entra aqui porque o formulário precisa dele no
   * momento do clique em "Já sou cliente" — buscar naquele instante custaria
   * uma ida ao servidor no meio de um envio.
   */
  loader: async ({ deps }) => {
    const [planos, areaCliente] = await Promise.all([fetchPlanos(), estadoAreaCliente()]);
    return { planos: planosVisiveis(planos, deps.codigoOferta), areaCliente };
  },
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
  const { planos, areaCliente } = Route.useLoaderData();
  const { codigo_oferta: codigoOferta } = Route.useSearch();
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
        <Empresas />
        <Depoimentos />
        <CtaFinal
          selectedPlan={selectedPlan}
          codigoOferta={codigoOferta}
          areaClienteAtiva={areaCliente.ativa}
        />
        {/* Dúvidas fecham a página, depois do formulário de contratação. */}
        <Faq />
      </main>
      <Footer />
      <CtaFlutuante />
      <Toaster />
    </div>
  );
}
