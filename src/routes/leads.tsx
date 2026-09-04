import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Toaster } from "@/components/ui/sonner";
import { ContractForm, type SelectedPlan } from "@/components/scnet/contract-form";
import { Depoimentos } from "@/components/scnet/sections";
import {
  BarraFixaLeads,
  ComoFuncionaLeads,
  CtaFinalLeads,
  DiferenciaisLeads,
  DuvidasLeads,
  FooterLeads,
  HeaderLeads,
  HeroLeads,
  PlanosLeads,
} from "@/components/scnet/leads";
import { fetchPlanos } from "@/lib/fetch-planos";
import { estadoAreaCliente } from "@/lib/area-cliente";
import { ANCORA_FORMULARIO } from "@/lib/links";
import { menorPreco, planoWebhook, planosVisiveis } from "@/lib/plans";

const title = "Internet fibra com Wi-Fi na casa toda — SCNET";
const description =
  "Fibra óptica no Oeste e Litoral de SC com roteador Wi-Fi incluso e suporte local. Deixe seu WhatsApp e um consultor confirma a cobertura e agenda a instalação.";

/**
 * A página de tráfego pago.
 *
 * Os parâmetros que ela lê da URL, além das UTMs e click ids (capturados
 * pela raiz para todas as páginas):
 *
 * - `codigo_oferta` — libera os planos de campanha, como na home.
 * - `plano` — o nome do plano do anúncio ("Infinity"). Quando bate com um plano
 *   da grade, o formulário já abre com ele pinado: quem clicou num anúncio do
 *   Infinity não precisa escolher o Infinity de novo.
 *
 * `passthrough` preserva o resto da query na URL — é dela que o formulário lê
 * a `page` que vai ao webhook e ao Meta.
 */
const searchSchema = z
  .object({
    codigo_oferta: z.string().optional(),
    plano: z.string().optional(),
  })
  .passthrough();

export const Route = createFileRoute("/leads")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ codigoOferta: search.codigo_oferta }),
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
      // Página de anúncio: fora do índice para não concorrer com a home no
      // buscador. Os robôs do Meta e do Google Ads não dependem disto.
      { name: "robots", content: "noindex, follow" },
    ],
  }),
  component: Leads,
});

function Leads() {
  const { planos, areaCliente } = Route.useLoaderData();
  const { codigo_oferta: codigoOferta, plano: planoDaUrl } = Route.useSearch();

  // O plano do anúncio, quando a URL trouxe um que existe na grade.
  const planoInicial = useMemo<SelectedPlan | null>(() => {
    const nome = planoDaUrl?.trim().toLowerCase();
    if (!nome) return null;
    const plano = planos.find((p) => p.nome.trim().toLowerCase() === nome);
    return plano ? planoWebhook(plano) : null;
  }, [planos, planoDaUrl]);

  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan | null>(planoInicial);
  const precoMinimo = useMemo(() => menorPreco(planos), [planos]);

  return (
    <div className="min-h-screen bg-background font-body">
      <HeaderLeads />
      {/* pb no celular: espaço para a barra fixa não cobrir o rodapé. */}
      <main className="pb-24 lg:pb-0">
        <HeroLeads precoMinimo={precoMinimo}>
          {/* A âncora é a seção do formulário, e `scroll-mt` desconta o
              cabeçalho fixo — o topo do cartão nunca fica escondido. */}
          <div id={ANCORA_FORMULARIO} className="scroll-mt-20 sm:scroll-mt-24">
            <ContractForm
              selectedPlan={selectedPlan}
              codigoOferta={codigoOferta}
              areaClienteAtiva={areaCliente.ativa}
              origem="formulario_leads"
              titulo="Fale com um consultor agora"
              rodape="Sem compromisso. Resposta no WhatsApp em minutos."
            />
          </div>
        </HeroLeads>
        <DiferenciaisLeads />
        <PlanosLeads plans={planos} onSelectPlan={setSelectedPlan} />
        <ComoFuncionaLeads />
        <Depoimentos />
        <DuvidasLeads />
        <CtaFinalLeads precoMinimo={precoMinimo} />
      </main>
      <FooterLeads />
      <BarraFixaLeads precoMinimo={precoMinimo} />
      <Toaster />
    </div>
  );
}
