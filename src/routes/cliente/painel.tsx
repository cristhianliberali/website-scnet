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
 * Daí em diante o cache manda. Abrir e fechar um serviço não custa nada; um F5
 * pega o retrato guardado na memória do servidor (60s); e todo formulário que
 * muda alguma coisa derruba as seções que ele afeta. O botão "Atualizar" passa
 * por cima dos dois caches.
 *
 * **Onde os serviços abrem.** Na própria página, e não num pop-up: o serviço
 * escolhido vira `?servico=` na URL, ocupa o lugar da visão geral e leva junto
 * a navegação com os outros. Isso dá ao serviço um endereço — dá para voltar
 * pelo botão do navegador, recarregar sem perder o lugar e mandar o link — e
 * tira o formulário de dentro de uma caixa que rola por dentro no celular.
 *
 * **Como as ações chegam ao n8n.** Cada formulário é um evento próprio
 * (`FORMULARIOS_PAINEL`), enviado pelo servidor com o token da sessão junto —
 * o navegador nunca fala com o webhook, e o token nunca chega até ele.
 */

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
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
  TelaDesbloqueio,
  TelaNotasFiscais,
  TelaPixDebito,
  TelaSegundaVia,
} from "@/components/scnet/painel/painel-telas-financeiro";
import {
  TelaIndicacoes,
  TelaMudancaEndereco,
  TelaSuporte,
  TelaTrocarPlano,
  TelaTrocarTitular,
} from "@/components/scnet/painel/painel-telas-servicos";
import type { ServicoPainelId } from "@/components/scnet/painel/painel-ui";
import { CartaoPainel, servicoValido } from "@/components/scnet/painel/painel-ui";
import { TelaServico } from "@/components/scnet/painel/painel-servico";
import {
  CHAVE_PAINEL,
  painelQueryOptions,
  useAtualizarPainel,
  useErroPainel,
} from "@/hooks/use-painel";
import { consultarPainel, getSessaoCliente, logoutCliente } from "@/lib/cliente-auth";
import { faturaEmAberto } from "@/lib/painel-formato";
import { normalizarPainel } from "@/lib/painel-normalizar";
import { cn } from "@/lib/utils";
import type { PainelSnapshot } from "@/lib/painel-tipos";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const title = "Painel do cliente — SCNET";

/** O que a URL do painel carrega: qual serviço está aberto e sobre qual contrato. */
type BuscaPainel = { servico?: ServicoPainelId; contrato?: string };

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
  /*
   * A URL é digitável, então nada dela entra na tela sem passar por aqui:
   * `servico` só vale se for um dos serviços conhecidos, e `contrato` é um
   * identificador curto que ainda vai ser procurado na lista do cliente — o
   * painel só mostra os contratos que a sessão dele carrega.
   */
  validateSearch: (busca: Record<string, unknown>): BuscaPainel => {
    const servico = servicoValido(busca["servico"]);
    const contrato = typeof busca["contrato"] === "string" ? busca["contrato"].slice(0, 60) : "";
    return { ...(servico ? { servico } : {}), ...(contrato ? { contrato } : {}) };
  },
  head: () => ({
    meta: [{ title }, { name: "robots", content: "noindex" }],
  }),
  component: PainelCliente,
});

function PainelCliente() {
  const { sessao, inicial } = Route.useLoaderData();
  const { servico: naBusca, contrato: contratoSelecionado = "" } = Route.useSearch();
  /*
   * Confere de novo o que veio da URL. `validateSearch` já limpa o valor, mas o
   * roteador entrega aqui o que está escrito no endereço quando ele não casa com
   * nada conhecido — e um `?servico=qualquercoisa` cairia numa tela sem
   * conteúdo. Passando pelo mesmo filtro, ele cai na visão geral.
   */
  const servico = servicoValido(naBusca);
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();

  const painel = useQuery({
    ...painelQueryOptions(),
    ...(inicial.ok
      ? { initialData: normalizarPainel(inicial.dados), initialDataUpdatedAt: Date.now() }
      : {}),
  });

  const atualizar = useAtualizarPainel();
  const tratarErro = useErroPainel();

  /*
   * Abrir um serviço é navegar. `replace` não: cada serviço vira um passo no
   * histórico, e é o botão "voltar" do celular que fecha o que está aberto.
   */
  const abrirServico = (id: ServicoPainelId) =>
    void navigate({ search: (atual: BuscaPainel) => ({ ...atual, servico: id }) });

  const selecionarContrato = (id: string) =>
    void navigate({ search: (atual: BuscaPainel) => ({ ...atual, contrato: id }) });

  const voltarAoPainel = () =>
    void navigate({ search: ({ contrato }: BuscaPainel) => (contrato ? { contrato } : {}) });

  async function sair() {
    await logoutCliente();
    queryClient.removeQueries({ queryKey: CHAVE_PAINEL });
    void navigate({ to: "/cliente", search: {} });
  }

  const primeiroNome = (painel.data?.cliente.nome || sessao.nome).split(" ")[0] ?? sessao.nome;

  return (
    <div className="min-h-screen bg-background font-body">
      <Header />
      <main>
        {/*
          O cabeçalho azul termina de dois jeitos. Na visão geral ele é fundo: o
          banner financeiro sobe por cima dele (`-mt-12` abaixo), e a faixa
          precisa dos 80px para o cartão ter onde pousar. Num serviço aberto não
          há cartão para pousar — o conteúdo começa no branco, e aqueles 80px
          viravam uma tira azul vazia com o título colado nela.
        */}
        <section
          className={cn(
            "gradient-brand relative overflow-hidden pt-28 sm:pt-32",
            servico ? "pb-10" : "pb-20",
          )}
        >
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

        <section className={cn("relative pb-20", servico ? "pt-8" : "-mt-12")}>
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
            ) : servico ? (
              <TelaServico servico={servico} aoAbrir={abrirServico} aoVoltar={voltarAoPainel}>
                <ConteudoServico
                  servico={servico}
                  painel={painel.data}
                  contratoSelecionado={contratoSelecionado}
                  aoVoltar={voltarAoPainel}
                />
              </TelaServico>
            ) : (
              <ConteudoPainel
                painel={painel.data}
                aoAbrir={abrirServico}
                aoSelecionarContrato={selecionarContrato}
              />
            )}
          </div>
        </section>
      </main>

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

/**
 * O serviço aberto.
 *
 * Só um por vez está montado — quem não está na tela não está na árvore, e é
 * por isso que cada formulário começa limpo sem precisar se limpar.
 */
function ConteudoServico({
  servico,
  painel,
  contratoSelecionado,
  aoVoltar,
}: {
  servico: ServicoPainelId;
  painel: PainelSnapshot;
  contratoSelecionado: string;
  aoVoltar: () => void;
}) {
  switch (servico) {
    case "trocar_plano":
      return (
        <TelaTrocarPlano
          aoVoltar={aoVoltar}
          contratos={painel.contratos}
          planos={painel.planos}
          adicionais={painel.adicionais}
          contratoInicial={contratoSelecionado}
        />
      );
    case "indicacoes":
      return (
        <TelaIndicacoes
          aoVoltar={aoVoltar}
          cliente={painel.cliente}
          indicacoes={painel.indicacoes}
        />
      );
    case "pix_debito":
      return <TelaPixDebito aoVoltar={aoVoltar} />;
    case "mudanca_endereco":
      return (
        <TelaMudancaEndereco
          aoVoltar={aoVoltar}
          contratos={painel.contratos}
          contratoInicial={contratoSelecionado}
        />
      );
    case "trocar_titular":
      return (
        <TelaTrocarTitular
          aoVoltar={aoVoltar}
          contratos={painel.contratos}
          cliente={painel.cliente}
          contratoInicial={contratoSelecionado}
        />
      );
    case "segunda_via":
      return <TelaSegundaVia aoVoltar={aoVoltar} faturas={painel.faturas} />;
    case "notas_fiscais":
      return <TelaNotasFiscais aoVoltar={aoVoltar} notas={painel.notasFiscais} />;
    case "suporte":
      return (
        <TelaSuporte
          aoVoltar={aoVoltar}
          contratos={painel.contratos}
          contratoInicial={contratoSelecionado}
        />
      );
    case "desbloqueio":
      return <TelaDesbloqueio aoVoltar={aoVoltar} faturas={painel.faturas} />;
  }
}

function ConteudoPainel({
  painel,
  aoAbrir,
  aoSelecionarContrato,
}: {
  painel: PainelSnapshot;
  aoAbrir: (servico: ServicoPainelId) => void;
  aoSelecionarContrato: (id: string) => void;
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
