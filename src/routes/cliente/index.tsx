import { createFileRoute, redirect } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/scnet/header";
import { Footer, WhatsFloat } from "@/components/scnet/sections";
import { Blobs } from "@/components/scnet/shared";
import { ClienteLogin } from "@/components/scnet/cliente-login";
import { getSessaoCliente } from "@/lib/cliente-auth";

const title = "Área do cliente — SCNET";

export const Route = createFileRoute("/cliente/")({
  // já logado não precisa ver a tela de login
  beforeLoad: async () => {
    const sessao = await getSessaoCliente();
    if (sessao) throw redirect({ to: "/cliente/painel" });
  },
  head: () => ({
    meta: [
      { title },
      {
        name: "description",
        content: "Acesse a área do cliente SCNET com seu CPF/CNPJ ou com o login e senha do SAC.",
      },
      { property: "og:title", content: title },
      { property: "og:description", content: "Entre na área do cliente SCNET." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ClienteLoginPage,
});

function ClienteLoginPage() {
  return (
    <div className="min-h-screen bg-background font-body">
      <Header />
      <main>
        <section className="gradient-brand relative overflow-hidden pb-16 pt-32">
          <Blobs />
          <div className="relative mx-auto max-w-3xl px-4 text-center">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-primary-foreground sm:text-4xl">
              Área do cliente
            </h1>
            <p className="mt-3 font-body text-lg text-primary-foreground/90">
              Entre com o documento do seu cadastro ou com o login e senha do SAC.
            </p>
          </div>
        </section>

        <section className="relative -mt-10 pb-24">
          <div className="mx-auto max-w-lg px-4">
            <ClienteLogin />
          </div>
        </section>
      </main>
      <Footer />
      <WhatsFloat />
      <Toaster />
    </div>
  );
}
