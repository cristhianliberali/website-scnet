import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Header } from "@/components/scnet/header";
import { Footer, WhatsFloat } from "@/components/scnet/sections";
import { Blobs } from "@/components/scnet/shared";
import { getSessaoCliente, logoutCliente } from "@/lib/cliente-auth";

const title = "Painel do cliente — SCNET";

export const Route = createFileRoute("/cliente/painel")({
  // sem sessão válida não há painel: volta para o login
  loader: async () => {
    const sessao = await getSessaoCliente();
    if (!sessao) throw redirect({ to: "/cliente" });
    return { sessao };
  },
  head: () => ({
    meta: [{ title }, { name: "robots", content: "noindex" }],
  }),
  component: PainelCliente,
});

function PainelCliente() {
  const { sessao } = Route.useLoaderData();
  const navigate = useNavigate();

  async function sair() {
    await logoutCliente();
    void navigate({ to: "/cliente" });
  }

  const primeiroNome = sessao.nome.split(" ")[0] ?? sessao.nome;

  return (
    <div className="min-h-screen bg-background font-body">
      <Header />
      <main>
        <section className="gradient-brand relative overflow-hidden pb-16 pt-32">
          <Blobs />
          <div className="relative mx-auto max-w-5xl px-4">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-primary-foreground sm:text-4xl">
              Olá, {primeiroNome}
            </h1>
            <p className="mt-3 font-body text-lg text-primary-foreground/90">
              Documento {sessao.documento}
            </p>
          </div>
        </section>

        <section className="relative -mt-10 pb-24">
          <div className="mx-auto max-w-5xl px-4">
            <div className="w-full rounded-2xl border border-border bg-white p-6 shadow-xl sm:p-8">
              <p className="font-display text-xl font-extrabold text-brand-deep">
                Seu painel está a caminho
              </p>
              <p className="mt-2 font-body text-muted-foreground">
                Em breve você vai encontrar aqui suas faturas, os dados do seu plano e a abertura de
                chamados. Por enquanto, nosso atendimento no WhatsApp resolve tudo isso para você.
              </p>

              <Button type="button" variant="outline" className="mt-6" onClick={() => void sair()}>
                <LogOut className="size-4" />
                Sair
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsFloat />
      <Toaster />
    </div>
  );
}
