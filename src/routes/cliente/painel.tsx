/**
 * O painel do cliente.
 *
 * **Como os dados chegam.** O loader desta rota faz uma única chamada,
 * `secao: "bootstrap"`, que traz o painel inteiro — cadastro, contratos,
 * faturas, notas, indicações, chamados e planos. Ela roda no servidor durante
 * o SSR, então a página já chega ao navegador com conteúdo, e o resultado
 * entra no cache do TanStack Query como `initialData`: a hidratação não
 * dispara uma segunda ida ao n8n.
 *
 * Daí em diante o cache manda. Abrir e fechar modais não custa nada; um F5
 * pega o retrato guardado na memória do servidor (60s); e todo formulário que
 * muda alguma coisa derruba as seções que ele afeta. O botão "Atualizar" passa
 * por cima dos dois caches.
 *
 * **Como as ações chegam ao n8n.** Cada formulário é um evento próprio
 * (`FORMULARIOS_PAINEL`), enviado pelo servidor com o token da sessão junto —
 * o navegador nunca fala com o webhook, e o token nunca chega até ele.
 */

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogOut, Power, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { Header } from "@/components/scnet/header";
import { Footer, WhatsFloat } from "@/components/scnet/sections";
import { Blobs } from "@/components/scnet/shared";
import {
  AvisoCadastroInativo,
  BannerFinanceiro,
  BannerIndicacao,
  GradeServicos,
  ResumoCliente,
  SecaoChamados,
  SecaoContratos,
} from "@/components/scnet/painel/painel-visao-geral";
import {
  ModalDesbloqueio,
  ModalNotasFiscais,
  ModalPixDebito,
  ModalSegundaVia,
} from "@/components/scnet/painel/painel-modais-financeiro";
import {
  ModalIndicacoes,
  ModalMudancaEndereco,
  ModalSuporte,
  ModalTesteVelocidade,
  ModalTrocarPlano,
  ModalTrocarTitular,
} from "@/components/scnet/painel/painel-modais-servicos";
import type { ModalPainelId } from "@/components/scnet/painel/painel-ui";
import { CartaoPainel } from "@/components/scnet/painel/painel-ui";
import {
  CHAVE_PAINEL,
  painelQueryOptions,
  useAtualizarPainel,
  useErroPainel,
  useFormularioPainel,
} from "@/hooks/use-painel";
import { consultarPainel, getSessaoCliente, logoutCliente } from "@/lib/cliente-auth";
import { faturaEmAberto } from "@/lib/painel-formato";
import { normalizarPainel } from "@/lib/painel-normalizar";
import type { PainelSnapshot } from "@/lib/painel-tipos";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const title = "Painel do cliente — SCNET";

export const Route = createFileRoute("/cliente/painel")({
  /*
   * Sessão e dados na mesma passagem. A consulta de abertura sai aqui, no
   * servidor, para que a página chegue pronta — e o resultado dela vira o
   * `initialData` do cache, para que a hidratação não repita a chamada.
   */
  loader: async () => {
    const sessao = await getSessaoCliente();
    if (!sessao) throw redirect({ to: "/cliente" });

    const inicial = await consultarPainel({ data: { secao: "bootstrap" } });
    // token recusado entre o login e agora: não há painel a mostrar
    if (!inicial.ok && inicial.expirado) throw redirect({ to: "/cliente" });

    return { sessao, inicial };
  },
  head: () => ({
    meta: [{ title }, { name: "robots", content: "noindex" }],
  }),
  component: PainelCliente,
});

function PainelCliente() {
  const { sessao, inicial } = Route.useLoaderData();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const painel = useQuery({
    ...painelQueryOptions(),
    ...(inicial.ok
      ? { initialData: normalizarPainel(inicial.dados), initialDataUpdatedAt: Date.now() }
      : {}),
  });

  const atualizar = useAtualizarPainel();
  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  const [modal, setModal] = useState<ModalPainelId | null>(null);
  const [contratoSelecionado, setContratoSelecionado] = useState("");
  const [reiniciando, setReiniciando] = useState<string | null>(null);

  async function sair() {
    await logoutCliente();
    queryClient.removeQueries({ queryKey: CHAVE_PAINEL });
    void navigate({ to: "/cliente" });
  }

  async function reiniciarConexao(idContrato: string) {
    setReiniciando(idContrato);
    try {
      const resposta = await envio.mutateAsync({
        formulario: "reiniciar_conexao",
        dados: { id_contrato: idContrato },
      });
      toast.success(
        resposta.mensagem ?? "Comando enviado. Seu equipamento reinicia em alguns segundos.",
      );
    } catch (erro) {
      tratarErro(erro, "Não foi possível reiniciar a conexão agora.");
    } finally {
      setReiniciando(null);
    }
  }

  const primeiroNome = (painel.data?.cliente.nome || sessao.nome).split(" ")[0] ?? sessao.nome;

  return (
    <div className="min-h-screen bg-background font-body">
      <Header />
      <main>
        <section className="gradient-brand relative overflow-hidden pb-20 pt-28 sm:pt-32">
          <Blobs />
          <div className="relative mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-4 px-4">
            <div>
              <p className="font-ui text-sm font-semibold uppercase tracking-widest text-primary-foreground/70">
                Área do cliente
              </p>
              <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-primary-foreground sm:text-4xl">
                Olá, {primeiroNome}
              </h1>
              <p className="mt-2 font-body text-sm text-primary-foreground/85">
                {identificacao(painel.data, sessao.documento, sessao.contato)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="onbrand"
                size="sm"
                disabled={atualizar.isPending || painel.isFetching}
                onClick={() =>
                  atualizar.mutate(undefined, {
                    onSuccess: () => toast.success("Painel atualizado."),
                    onError: (erro) => tratarErro(erro, "Não foi possível atualizar agora."),
                  })
                }
              >
                <RefreshCw
                  className={`size-4 ${atualizar.isPending || painel.isFetching ? "animate-spin" : ""}`}
                />
                Atualizar
              </Button>
              <Button type="button" variant="onbrand" size="sm" onClick={() => void sair()}>
                <LogOut className="size-4" />
                Sair
              </Button>
            </div>
          </div>
        </section>

        <section className="relative -mt-12 pb-20">
          <div className="mx-auto max-w-6xl space-y-6 px-4">
            {painel.isPending ? (
              <EsqueletoPainel />
            ) : painel.isError || !painel.data ? (
              <FalhaAoCarregar
                mensagem={
                  painel.error instanceof Error
                    ? painel.error.message
                    : (!inicial.ok && inicial.mensagem) ||
                      "Não conseguimos carregar seus dados agora."
                }
                recarregando={painel.isFetching}
                aoTentarDeNovo={() => void painel.refetch()}
              />
            ) : (
              <ConteudoPainel
                painel={painel.data}
                aoAbrir={setModal}
                aoSelecionarContrato={setContratoSelecionado}
                aoReiniciar={(contrato) => void reiniciarConexao(contrato.id)}
                reiniciando={reiniciando}
              />
            )}
          </div>
        </section>
      </main>

      {painel.data && (
        <>
          <ModalSegundaVia
            aberto={modal === "segunda_via"}
            aoFechar={() => setModal(null)}
            faturas={painel.data.faturas}
          />
          <ModalNotasFiscais
            aberto={modal === "notas_fiscais"}
            aoFechar={() => setModal(null)}
            notas={painel.data.notasFiscais}
          />
          <ModalPixDebito aberto={modal === "pix_debito"} aoFechar={() => setModal(null)} />
          <ModalDesbloqueio
            aberto={modal === "desbloqueio"}
            aoFechar={() => setModal(null)}
            faturas={painel.data.faturas}
          />
          <ModalTrocarPlano
            aberto={modal === "trocar_plano"}
            aoFechar={() => setModal(null)}
            contratos={painel.data.contratos}
            planos={painel.data.planos}
            adicionais={painel.data.adicionais}
            contratoInicial={contratoSelecionado}
          />
          <ModalIndicacoes
            aberto={modal === "indicacoes"}
            aoFechar={() => setModal(null)}
            cliente={painel.data.cliente}
            indicacoes={painel.data.indicacoes}
          />
          <ModalMudancaEndereco
            aberto={modal === "mudanca_endereco"}
            aoFechar={() => setModal(null)}
            contratos={painel.data.contratos}
            contratoInicial={contratoSelecionado}
          />
          <ModalTrocarTitular
            aberto={modal === "trocar_titular"}
            aoFechar={() => setModal(null)}
            contratos={painel.data.contratos}
            cliente={painel.data.cliente}
            contratoInicial={contratoSelecionado}
          />
          <ModalSuporte
            aberto={modal === "suporte"}
            aoFechar={() => setModal(null)}
            contratos={painel.data.contratos}
            contratoInicial={contratoSelecionado}
          />
          <ModalTesteVelocidade
            aberto={modal === "teste_velocidade"}
            aoFechar={() => setModal(null)}
            contrato={
              painel.data.contratos.find((c) => c.id === contratoSelecionado) ??
              painel.data.contratos[0] ??
              null
            }
          />
        </>
      )}

      <Footer />
      <WhatsFloat />
      <Toaster />
    </div>
  );
}

/** A linha embaixo do "Olá": documento do cadastro, ou o contato de quem entrou por senha. */
function identificacao(
  painel: PainelSnapshot | undefined,
  documento: string | undefined,
  contato: string | undefined,
): string {
  const codigo = painel?.cliente.codigo;
  if (codigo) return `Cliente ${codigo}`;
  if (documento) return `Documento ${documento}`;
  return contato ?? "";
}

function ConteudoPainel({
  painel,
  aoAbrir,
  aoSelecionarContrato,
  aoReiniciar,
  reiniciando,
}: {
  painel: PainelSnapshot;
  aoAbrir: (modal: ModalPainelId) => void;
  aoSelecionarContrato: (id: string) => void;
  aoReiniciar: (contrato: PainelSnapshot["contratos"][number]) => void;
  reiniciando: string | null;
}) {
  const emAberto = painel.faturas.filter(faturaEmAberto).length;

  return (
    <>
      {painel.cliente.status === "inativo" && <AvisoCadastroInativo />}

      <BannerFinanceiro
        faturas={painel.faturas}
        desbloqueioDisponivel={painel.desbloqueioDisponivel}
        aoAbrir={aoAbrir}
      />

      {painel.avisos.length > 0 && (
        <CartaoPainel className="border-amber-200 bg-amber-50/70">
          {painel.avisos.map((aviso) => (
            <div key={aviso.id} className="flex items-start gap-3 py-1">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div>
                {aviso.titulo && (
                  <p className="font-ui text-sm font-bold text-amber-900">{aviso.titulo}</p>
                )}
                <p className="font-body text-xs text-amber-900/80">{aviso.texto}</p>
              </div>
            </div>
          ))}
        </CartaoPainel>
      )}

      <BannerIndicacao cliente={painel.cliente} indicacoes={painel.indicacoes} aoAbrir={aoAbrir} />

      <GradeServicos faturasEmAberto={emAberto} aoAbrir={aoAbrir} />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <SecaoContratos
            contratos={painel.contratos}
            aoAbrir={aoAbrir}
            aoSelecionarContrato={aoSelecionarContrato}
            aoReiniciar={aoReiniciar}
            reiniciando={reiniciando}
          />
        </div>
        <div className="space-y-6 lg:col-span-5">
          <SecaoChamados chamados={painel.chamados} aoAbrir={aoAbrir} />
          <ResumoCliente painel={painel} />
        </div>
      </div>
    </>
  );
}

function EsqueletoPainel() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-64 rounded-2xl lg:col-span-7" />
        <Skeleton className="h-64 rounded-2xl lg:col-span-5" />
      </div>
    </div>
  );
}

function FalhaAoCarregar({
  mensagem,
  recarregando,
  aoTentarDeNovo,
}: {
  mensagem: string;
  recarregando: boolean;
  aoTentarDeNovo: () => void;
}) {
  return (
    <CartaoPainel className="text-center">
      <div className="mx-auto grid size-12 place-items-center rounded-full bg-amber-100 text-amber-700">
        <TriangleAlert className="size-6" />
      </div>
      <p className="mt-3 font-display text-lg font-extrabold text-brand-deep">
        Não conseguimos carregar seu painel
      </p>
      <p className="mx-auto mt-1 max-w-md font-body text-sm text-muted-foreground">{mensagem}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button type="button" variant="brand" disabled={recarregando} onClick={aoTentarDeNovo}>
          <Power className="size-4" />
          {recarregando ? "Tentando..." : "Tentar de novo"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="https://wa.me/5549999999999" target="_blank" rel="noopener">
            Falar no WhatsApp
          </a>
        </Button>
      </div>
    </CartaoPainel>
  );
}
