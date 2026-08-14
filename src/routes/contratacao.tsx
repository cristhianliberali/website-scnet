import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/scnet/header";
import { Footer, WhatsFloat } from "@/components/scnet/sections";
import { Blobs } from "@/components/scnet/shared";
import { ContractWizard } from "@/components/scnet/contract-wizard";
import { readContractHandoffCookie, type ContractHandoff } from "@/lib/contract-handoff";
import { fetchPlanos } from "@/lib/fetch-planos";
import { planosVisiveis } from "@/lib/plans";

const searchSchema = z.object({
  nome: z.string().optional(),
  whatsapp: z.string().optional(),
  plano: z.string().optional(),
  preco: z.string().optional(),
  intencao: z.string().optional(),
  codigo_oferta: z.string().optional(),
});

const title = "Contratação online — SCNET";

export const Route = createFileRoute("/contratacao")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ codigoOferta: search.codigo_oferta }),
  // Mesma fonte e mesma regra da home: os planos ativos do Postgres, com os de
  // campanha liberados só pelo código que veio na URL.
  loader: async ({ deps }) => ({
    planos: planosVisiveis(await fetchPlanos(), deps.codigoOferta),
  }),
  head: () => ({
    meta: [
      { title },
      {
        name: "description",
        content:
          "Finalize sua contratação SCNET em poucos passos: escolha o plano, informe o endereço, envie os documentos e agende a instalação.",
      },
      { property: "og:title", content: title },
      {
        property: "og:description",
        content: "Contrate a fibra da SCNET online e agende sua instalação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Contratacao,
});

function Contratacao() {
  const search = Route.useSearch();
  const { planos } = Route.useLoaderData();
  // A URL é a fonte primária; o cookie só completa o que faltar nela.
  const [handoff, setHandoff] = useState<ContractHandoff>(search);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cookie = readContractHandoffCookie();
    setHandoff((prev) => {
      const merged: ContractHandoff = {};
      for (const key of [
        "nome",
        "whatsapp",
        "plano",
        "preco",
        "intencao",
        "codigo_oferta",
      ] as const) {
        const value = prev[key] || cookie[key];
        if (value) merged[key] = value;
      }
      return merged;
    });
    setReady(true);
  }, []);

  return (
    <div className="min-h-screen bg-background font-body">
      <Header />
      <main>
        <section className="gradient-brand relative overflow-hidden pb-16 pt-32">
          <Blobs />
          <div className="relative mx-auto max-w-3xl px-4 text-center">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-primary-foreground sm:text-4xl">
              Falta pouco para concluir seu pedido!
            </h1>
            <p className="mt-3 font-body text-lg text-primary-foreground/90">
              Quatro passos rápidos: plano, endereço, cadastro e, por fim, anexos e agendamento da
              instalação.
            </p>
          </div>
        </section>

        <section className="relative -mt-10 pb-24">
          {/* max-w-7xl: espaço para a grade de 4 colunas da etapa de planos */}
          <div className="mx-auto max-w-7xl px-4">
            {ready && <ContractWizard plans={planos} handoff={handoff} />}
          </div>
        </section>
      </main>
      <Footer />
      <WhatsFloat />
      <Toaster />
    </div>
  );
}
