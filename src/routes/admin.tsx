/**
 * `/admin` — o painel do provedor.
 *
 * **Fechada por padrão.** Sem `ADMIN_USUARIO` e `ADMIN_SENHA` no ambiente, a
 * rota responde 404 — não existe. Com as duas, pede login; a sessão vive num
 * cookie selado próprio (`scnet_admin`), separado do cookie do cliente.
 *
 * **Uma tela, quatro assuntos:** os planos do site, os planos da troca de plano,
 * a fila de solicitações e as indicações — mais os ajustes da seção de
 * indicação. A aba viaja na URL (`?aba=`), então recarregar não perde o lugar e
 * dá para guardar o link da fila.
 *
 * **Onde a segurança mora.** Não é aqui. Cada ação chama uma server function
 * que confere a sessão no servidor antes de tocar no banco — esta tela só
 * desenha. Uma tela que esconde o botão sem o servidor conferir é uma porta
 * trancada com o vidro aberto.
 */

import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { FileText, Inbox, LogOut, RefreshCw, ShieldCheck, Users, Zap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toaster } from "@/components/ui/sonner";
import { Cartao, Indicador } from "@/components/scnet/admin/admin-ui";
import { SecaoPlanos } from "@/components/scnet/admin/admin-planos";
import {
  SecaoSolicitacoes,
  type EdicaoSolicitacaoForm,
} from "@/components/scnet/admin/admin-solicitacoes";
import { SecaoEnvios } from "@/components/scnet/admin/admin-envios";
import { SecaoIndicacoes } from "@/components/scnet/admin/admin-indicacoes";
import { SecaoConfig } from "@/components/scnet/admin/admin-config";
import { SecaoScripts } from "@/components/scnet/admin/admin-scripts";
import { SecaoSeguranca } from "@/components/scnet/admin/admin-seguranca";
import { SecaoAreaCliente } from "@/components/scnet/admin/admin-area-cliente";
import {
  baixarAnexoAdmin,
  carregarAdmin,
  entrarAdmin,
  estadoAdmin,
  excluirIndicacaoAdmin,
  excluirPlanoAdmin,
  excluirScriptAdmin,
  sairAdmin,
  salvarConfigAdmin,
  salvarIndicacaoAdmin,
  salvarPlanoAdmin,
  salvarAreaClienteAdmin,
  salvarScriptAdmin,
  salvarSegurancaAdmin,
  salvarSolicitacaoAdmin,
  type AcaoAdmin,
  type DadosAdmin,
} from "@/lib/admin";
import type {
  CatalogoPlanos,
  ConfigAreaCliente,
  ConfigIndicacao,
  ConfigSeguranca,
  IndicacaoAdmin,
  PlanoAdmin,
  ScriptAdmin,
} from "@/lib/admin-tipos";

const ABAS = [
  "planos-site",
  "planos-upgrade",
  "envios",
  "solicitacoes",
  "indicacoes",
  "indicacao",
  "scripts",
  "seguranca",
  "area-cliente",
] as const;
type Aba = (typeof ABAS)[number];

const buscaSchema = z.object({
  aba: z.enum(ABAS).optional(),
});

export const Route = createFileRoute("/admin")({
  validateSearch: buscaSchema,
  loader: async () => {
    const estado = await estadoAdmin();
    // sem as variáveis, a rota nem existe — 404, e não 401
    if (!estado.configurado) throw notFound();
    if (!estado.sessao) return { sessao: null, dados: null };
    return { sessao: estado.sessao, dados: await carregarAdmin() };
  },
  head: () => ({
    meta: [{ title: "Administração — SCNET" }, { name: "robots", content: "noindex" }],
  }),
  component: PaginaAdmin,
});

function PaginaAdmin() {
  const { sessao, dados } = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-secondary/30 font-body">
      {sessao && dados ? <Painel sessao={sessao} dados={dados} /> : <Login />}
      <Toaster />
    </div>
  );
}

/* ---------------- login ---------------- */

function Login() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function submeter(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    try {
      const resposta = await entrarAdmin({ data: { usuario, senha } });
      if (!resposta.ok) {
        setErro(resposta.mensagem);
        return;
      }
      await router.invalidate();
    } catch {
      setErro("Falha de conexão. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={(e) => void submeter(e)}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-lg bg-brand/10 text-brand">
            <ShieldCheck className="size-5" />
          </span>
          <div>
            <p className="font-display text-lg font-extrabold text-brand-deep">Administração</p>
            <p className="font-body text-xs text-muted-foreground">Acesso restrito</p>
          </div>
        </div>

        <div className="space-y-1">
          <Label
            htmlFor="admin-usuario"
            className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            Usuário
          </Label>
          <Input
            id="admin-usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            autoFocus
          />
        </div>

        <div className="space-y-1">
          <Label
            htmlFor="admin-senha"
            className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            Senha
          </Label>
          <Input
            id="admin-senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {erro && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-body text-sm text-red-700"
          >
            {erro}
          </p>
        )}

        <Button type="submit" variant="brand" className="w-full" disabled={enviando}>
          {enviando ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </div>
  );
}

/* ---------------- painel ---------------- */

function Painel({ sessao, dados }: { sessao: { usuario: string }; dados: DadosAdmin }) {
  const router = useRouter();
  const { aba = "planos-site" } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [salvando, setSalvando] = useState(false);

  /**
   * Toda ação passa por aqui: mostra o resultado e recarrega o loader.
   *
   * Recarregar tudo depois de salvar uma linha é de propósito. A alternativa —
   * costurar a resposta de volta no estado local — exige que a tela adivinhe o
   * que o banco fez (o id que ele gerou, o `atualizado_em`, o gatilho que
   * disparou). Numa tela de trabalho com meia dúzia de cliques por minuto, uma
   * ida a mais ao servidor é mais barata que uma tela que mente.
   */
  async function executar(trabalho: () => Promise<AcaoAdmin>) {
    setSalvando(true);
    try {
      const resposta = await trabalho();
      if (!resposta.ok) {
        toast.error(resposta.mensagem);
        return;
      }
      toast.success(resposta.mensagem);
      await router.invalidate();
    } catch {
      toast.error("Falha de conexão. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  const salvarPlano = (catalogo: CatalogoPlanos) => (plano: PlanoAdmin) =>
    void executar(() => salvarPlanoAdmin({ data: { catalogo, plano } }));

  const excluirPlano = (catalogo: CatalogoPlanos) => (idPlano: string) =>
    void executar(() => excluirPlanoAdmin({ data: { catalogo, idPlano } }));

  const salvarSolicitacao = (edicao: EdicaoSolicitacaoForm) =>
    void executar(() => salvarSolicitacaoAdmin({ data: edicao }));

  const salvarIndicacao = (indicacao: IndicacaoAdmin) =>
    void executar(() =>
      salvarIndicacaoAdmin({
        data: {
          id: indicacao.id,
          nomeIndicacao: indicacao.nomeIndicacao,
          telefoneIndicacao: indicacao.telefoneIndicacao,
          cidade: indicacao.cidade,
          observacoes: indicacao.observacoes,
          codNovoCliente: indicacao.codNovoCliente,
          codContratoNovoCliente: indicacao.codContratoNovoCliente,
          status: indicacao.status,
          campanha: indicacao.campanha,
          tipoBonus: indicacao.tipoBonus,
          descricaoBonus: indicacao.descricaoBonus,
          valorIndicacao: indicacao.valorIndicacao,
        },
      }),
    );

  const excluirIndicacao = (id: string) =>
    void executar(() => excluirIndicacaoAdmin({ data: { id } }));

  const salvarConfig = (config: ConfigIndicacao) =>
    void executar(() => salvarConfigAdmin({ data: config }));

  const salvarScript = (script: ScriptAdmin) =>
    void executar(() =>
      salvarScriptAdmin({
        data: {
          id: script.id,
          nome: script.nome,
          posicao: script.posicao,
          codigo: script.codigo,
          ativo: script.ativo,
        },
      }),
    );

  const excluirScript = (id: string) => void executar(() => excluirScriptAdmin({ data: { id } }));

  const salvarSeguranca = (config: ConfigSeguranca) =>
    void executar(() => salvarSegurancaAdmin({ data: config }));

  const salvarAreaCliente = (config: ConfigAreaCliente) =>
    void executar(() => salvarAreaClienteAdmin({ data: config }));

  async function sair() {
    await sairAdmin();
    await router.invalidate();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-ui text-xs font-bold uppercase tracking-widest text-muted-foreground">
            SCNET
          </p>
          <h1 className="font-display text-2xl font-extrabold text-brand-deep">Administração</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-body text-xs text-muted-foreground">{sessao.usuario}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={salvando}
            onClick={() => void router.invalidate()}
          >
            <RefreshCw className="size-4" />
            Atualizar
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void sair()}>
            <LogOut className="size-4" />
            Sair
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Primeiro o número que muda todo dia: quantas pessoas preencheram
            um formulário hoje. Os outros quatro são estoque. */}
        <Indicador rotulo="envios do site hoje" valor={dados.resumo.enviosHoje} icone={Inbox} />
        <Indicador rotulo="planos no site" valor={dados.resumo.planosSite} icone={Zap} />
        <Indicador rotulo="planos de upgrade" valor={dados.resumo.planosUpgrade} icone={Zap} />
        <Indicador
          rotulo="solicitações em aberto"
          valor={dados.resumo.solicitacoesAbertas}
          icone={FileText}
        />
        <Indicador
          rotulo="indicações em aberto"
          valor={dados.resumo.indicacoesAbertas}
          icone={Users}
        />
      </div>

      <Tabs
        value={aba}
        onValueChange={(v) => void navigate({ search: { aba: v as Aba } })}
        className="space-y-4"
      >
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="planos-site">Planos do site</TabsTrigger>
          <TabsTrigger value="planos-upgrade">Planos de upgrade</TabsTrigger>
          <TabsTrigger value="envios">Envios do site</TabsTrigger>
          <TabsTrigger value="solicitacoes">Solicitações</TabsTrigger>
          <TabsTrigger value="indicacoes">Indicações</TabsTrigger>
          <TabsTrigger value="indicacao">Seção de indicação</TabsTrigger>
          <TabsTrigger value="scripts">Scripts e tags</TabsTrigger>
          <TabsTrigger value="seguranca">Anti-robô</TabsTrigger>
          <TabsTrigger value="area-cliente">Área do cliente</TabsTrigger>
        </TabsList>

        <Cartao>
          <TabsContent value="planos-site">
            <SecaoPlanos
              catalogo="site"
              planos={dados.planosSite}
              salvando={salvando}
              aoSalvar={salvarPlano("site")}
              aoExcluir={excluirPlano("site")}
            />
          </TabsContent>

          <TabsContent value="planos-upgrade">
            <SecaoPlanos
              catalogo="upgrade"
              planos={dados.planosUpgrade}
              salvando={salvando}
              aoSalvar={salvarPlano("upgrade")}
              aoExcluir={excluirPlano("upgrade")}
            />
          </TabsContent>

          <TabsContent value="envios">
            <SecaoEnvios
              envios={dados.envios}
              aoBaixarAnexo={(id, campo) =>
                baixarAnexoAdmin({
                  data: { id, campo: campo as "comprovante_residencia" | "documento_com_foto" },
                })
              }
            />
          </TabsContent>

          <TabsContent value="solicitacoes">
            <SecaoSolicitacoes
              solicitacoes={dados.solicitacoes}
              salvando={salvando}
              aoSalvar={salvarSolicitacao}
            />
          </TabsContent>

          <TabsContent value="indicacoes">
            <SecaoIndicacoes
              indicacoes={dados.indicacoes}
              salvando={salvando}
              aoSalvar={salvarIndicacao}
              aoExcluir={excluirIndicacao}
            />
          </TabsContent>

          <TabsContent value="indicacao">
            {/*
              `key` no valor salvo: depois de gravar, o loader recarrega e o
              formulário precisa reiniciar com o que o banco devolveu — sem isso
              ele continuaria mostrando o rascunho antigo.
            */}
            <SecaoConfig
              key={JSON.stringify(dados.config)}
              config={dados.config}
              salvando={salvando}
              aoSalvar={salvarConfig}
            />
          </TabsContent>

          <TabsContent value="scripts">
            <SecaoScripts
              scripts={dados.scripts}
              salvando={salvando}
              aoSalvar={salvarScript}
              aoExcluir={excluirScript}
            />
          </TabsContent>

          <TabsContent value="area-cliente">
            <SecaoAreaCliente
              key={JSON.stringify(dados.areaCliente)}
              config={dados.areaCliente}
              salvando={salvando}
              aoSalvar={salvarAreaCliente}
            />
          </TabsContent>

          <TabsContent value="seguranca">
            <SecaoSeguranca
              key={JSON.stringify(dados.seguranca)}
              seguranca={dados.seguranca}
              diagnostico={dados.diagnosticoSeguranca}
              salvando={salvando}
              aoSalvar={salvarSeguranca}
            />
          </TabsContent>
        </Cartao>
      </Tabs>
    </div>
  );
}
