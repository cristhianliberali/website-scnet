import { createFileRoute, redirect } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/scnet/header";
import { Footer } from "@/components/scnet/sections";
import { Blobs } from "@/components/scnet/shared";
import { ClienteLogin } from "@/components/scnet/cliente-login";
import { AreaClienteDesligada } from "@/components/scnet/area-cliente-desligada";
import { getSessaoCliente } from "@/lib/cliente-auth";
import { estadoAreaCliente } from "@/lib/area-cliente";

const title = "Área do cliente — SCNET";

export const Route = createFileRoute("/cliente/")({
  // já logado não precisa ver a tela de login
  beforeLoad: async () => {
    const sessao = await getSessaoCliente();
    if (sessao) throw redirect({ to: "/cliente/painel" });
  },
  /*
   * O interruptor da área de membros. Conferido aqui, e não dentro do
   * componente, porque desligada a tela de login não deve nem ser montada: um
   * formulário que aparece e não funciona faz o cliente tentar, errar e desistir
   * — em vez de ir direto para quem resolve.
   */
  loader: async () => ({ areaCliente: await estadoAreaCliente() }),
  head: () => ({
    meta: [
      { title },
      {
        name: "description",
        content:
          "Acesse a área do cliente SCNET com seu CPF/CNPJ ou com seu e-mail ou telefone e senha.",
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
  const { areaCliente } = Route.useLoaderData();

  if (!areaCliente.ativa) {
    return (
      <div className="min-h-screen bg-background font-body">
        <Header />
        <main className="pt-24">
          <AreaClienteDesligada mensagem={areaCliente.mensagem} origem="login" />
        </main>
        <Footer />
      </div>
    );
  }

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
              Entre com o documento do seu cadastro ou com seu e-mail ou telefone e senha.
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
      <Toaster />
    </div>
  );
}
