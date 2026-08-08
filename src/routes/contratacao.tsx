import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Header } from "@/components/scnet/header";
import { Footer, WhatsFloat } from "@/components/scnet/sections";
import { Blobs } from "@/components/scnet/shared";
import { ContractWizard } from "@/components/scnet/contract-wizard";
import { readContractHandoffCookie, type ContractHandoff } from "@/lib/contract-handoff";

const searchSchema = z.object({
  nome: z.string().optional(),
  whatsapp: z.string().optional(),
  plano: z.string().optional(),
  preco: z.string().optional(),
  intencao: z.string().optional(),
});

const title = "Contratação online — SCNET";

export const Route = createFileRoute("/contratacao")({
  validateSearch: searchSchema,
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
  // A URL é a fonte primária; o cookie só completa o que faltar nela.
  const [handoff, setHandoff] = useState<ContractHandoff>(search);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const cookie = readContractHandoffCookie();
    setHandoff((prev) => {
      const merged: ContractHandoff = {};
      for (const key of ["nome", "whatsapp", "plano", "preco", "intencao"] as const) {
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
              Contratação online da sua fibra SCNET
            </h1>
            <p className="mt-3 font-body text-lg text-primary-foreground/90">
              Quatro passos rápidos: plano, endereço, cadastro e agendamento da instalação.
            </p>
          </div>
        </section>

        <section className="relative -mt-10 pb-24">
          <div className="mx-auto max-w-6xl px-4">
            {ready && <ContractWizard handoff={handoff} />}
          </div>
        </section>
      </main>
      <Footer />
      <WhatsFloat />
    </div>
  );
}
