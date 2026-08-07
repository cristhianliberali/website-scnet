import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/scnet/header";
import { Footer, WhatsFloat } from "@/components/scnet/sections";
import { Blobs, waLink } from "@/components/scnet/shared";
import { readContractHandoffCookie } from "@/lib/contract-handoff";

const searchSchema = z.object({
  nome: z.string().optional(),
  whatsapp: z.string().optional(),
  plano: z.string().optional(),
  preco: z.string().optional(),
  intencao: z.string().optional(),
});

const title = "Recebemos seus dados — SCNET";

export const Route = createFileRoute("/contratacao")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title },
      {
        name: "description",
        content: "Recebemos seus dados. A equipe SCNET vai te chamar no WhatsApp em instantes.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Contratacao,
});

const intentLabels: Record<string, string> = {
  quero_contratar: "Quero contratar",
  ja_sou_cliente: "Já sou cliente",
};

function Contratacao() {
  const search = Route.useSearch();
  // URL is the primary source; the cookie only fills in anything missing
  // from it (e.g. someone reloaded a link that dropped the query string).
  const [data, setData] = useState(search);

  useEffect(() => {
    const cookie = readContractHandoffCookie();
    setData((prev) => ({
      nome: prev.nome || cookie.nome,
      whatsapp: prev.whatsapp || cookie.whatsapp,
      plano: prev.plano || cookie.plano,
      preco: prev.preco || cookie.preco,
      intencao: prev.intencao || cookie.intencao,
    }));
  }, []);

  const firstName = data.nome?.trim().split(/\s+/)[0];
  const waMessage = data.plano
    ? `Oi! Sou ${data.nome ?? ""}. Quero contratar o ${data.plano} da SCNET.`
    : `Oi! Sou ${data.nome ?? ""}. Quero contratar a internet da SCNET.`;

  return (
    <div className="min-h-screen bg-background font-body">
      <Header />
      <main>
        <section className="gradient-brand relative overflow-hidden py-28 pt-36">
          <Blobs />
          <div className="relative mx-auto max-w-2xl px-4 text-center">
            <CheckCircle2 className="mx-auto size-16 text-zap" strokeWidth={1.5} />
            <h1 className="mt-5 font-display text-3xl font-extrabold tracking-tight text-primary-foreground sm:text-4xl">
              {firstName ? `Show, ${firstName}!` : "Show!"} Recebemos seus dados.
            </h1>
            <p className="mt-4 font-body text-lg text-primary-foreground/90">
              Nosso time vai te chamar no WhatsApp em instantes pra confirmar a cobertura e fechar
              sua contratação.
            </p>

            <div className="mt-8 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-6 text-left shadow-2xl backdrop-blur-md">
              {data.nome && <Row label="Nome" value={data.nome} />}
              {data.whatsapp && <Row label="WhatsApp" value={data.whatsapp} />}
              {data.plano && (
                <Row
                  label="Plano"
                  value={data.preco ? `${data.plano} — R$ ${data.preco}/mês` : data.plano}
                />
              )}
              {data.intencao && (
                <Row label="Intenção" value={intentLabels[data.intencao] ?? data.intencao} />
              )}
            </div>

            <Button variant="whats" size="hero" className="mt-8" asChild>
              <a target="_blank" rel="noopener" href={waLink(waMessage)}>
                <MessageCircle /> Falar agora no WhatsApp
              </a>
            </Button>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsFloat />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-primary-foreground/10 py-2.5 last:border-0">
      <span className="font-ui text-sm font-semibold text-primary-foreground/70">{label}</span>
      <span className="font-body text-sm text-primary-foreground">{value}</span>
    </div>
  );
}
