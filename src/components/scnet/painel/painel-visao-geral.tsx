/**
 * A visão geral do painel: o que o cliente vê antes de clicar em qualquer
 * coisa.
 *
 * A ordem da página não é decorativa. Primeiro o **status financeiro**, porque
 * é o que traz a maioria das visitas (e o que resolve a maioria delas, com o
 * PIX à mão). Depois a **indicação**, porque é o que o provedor quer promover.
 * Só então os **contratos** e a **grade de serviços**, que é para quem veio
 * fazer algo específico.
 */

import {
  AlertTriangle,
  Check,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Copy,
  Headphones,
  MapPin,
  Power,
  QrCode,
  Receipt,
  Truck,
  Users,
  Wifi,
  Zap,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  data,
  documento,
  enderecoEmLinha,
  faturaEmAberto,
  moeda,
  situacaoFinanceira,
  telefone,
} from "@/lib/painel-formato";
import { cn } from "@/lib/utils";
import type {
  Chamado,
  ClientePainel,
  ConfigIndicacaoPainel,
  Contrato,
  Fatura,
  Indicacao,
  PainelSnapshot,
} from "@/lib/painel-tipos";
import {
  BotaoCopiar,
  CartaoPainel,
  EstadoVazio,
  LinhaDado,
  ServicoPainelId,
  SeloStatus,
  TituloSecao,
} from "./painel-ui";
import { SERVICOS } from "./painel-servico";

/* ---------------- status financeiro ---------------- */

const APARENCIA = {
  em_dia: {
    fundo: "from-emerald-600 to-emerald-500",
    icone: CheckCircle2,
    titulo: "Tudo em dia por aqui",
  },
  em_aberto: {
    fundo: "from-amber-500 to-orange-500",
    icone: Receipt,
    titulo: "Você tem fatura em aberto",
  },
  vencido: {
    fundo: "from-red-600 to-rose-500",
    icone: AlertTriangle,
    titulo: "Fatura vencida",
  },
} as const;

export function BannerFinanceiro({
  faturas,
  desbloqueioDisponivel,
  aoAbrir,
}: {
  faturas: Fatura[];
  desbloqueioDisponivel: boolean;
  aoAbrir: (servico: ServicoPainelId) => void;
}) {
  const situacao = situacaoFinanceira(faturas);
  const aparencia = APARENCIA[situacao];
  const Icone = aparencia.icone;

  const pendentes = faturas.filter(faturaEmAberto);
  const total = pendentes.reduce((soma, f) => soma + f.valor, 0);
  const proxima = pendentes[0];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br p-6 text-white shadow-lg sm:p-7",
        aparencia.fundo,
      )}
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/15 backdrop-blur">
            <Icone className="size-6" />
          </div>
          <div>
            <p className="font-display text-xl font-extrabold leading-tight sm:text-2xl">
              {aparencia.titulo}
            </p>
            <p className="mt-1 font-body text-sm text-white/85">
              {situacao === "em_dia"
                ? "Nenhuma fatura pendente. Sua internet segue ativa."
                : `${pendentes.length} fatura${pendentes.length > 1 ? "s" : ""} somando ${moeda(total)}${
                    proxima ? ` — a mais próxima vence em ${data(proxima.vencimento)}` : ""
                  }.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {situacao !== "em_dia" && (
            <Button
              type="button"
              variant="zap"
              onClick={() => aoAbrir("segunda_via")}
              className="shadow"
            >
              <QrCode className="size-4" />
              Pagar com PIX
            </Button>
          )}
          <Button
            type="button"
            variant="onbrand"
            onClick={() => aoAbrir("segunda_via")}
            className="border-white/40 bg-white/10 hover:bg-white/20"
          >
            <Receipt className="size-4" />
            2ª via
          </Button>
          {situacao === "vencido" && desbloqueioDisponivel && (
            <Button
              type="button"
              variant="onbrand"
              onClick={() => aoAbrir("desbloqueio")}
              className="border-white/40 bg-white/10 hover:bg-white/20"
            >
              <Power className="size-4" />
              Desbloqueio em confiança
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- indicação ---------------- */

export function BannerIndicacao({
  cliente,
  indicacoes,
  config,
  aoAbrir,
}: {
  cliente: ClientePainel;
  indicacoes: Indicacao[];
  config: ConfigIndicacaoPainel;
  aoAbrir: (servico: ServicoPainelId) => void;
}) {
  const instaladas = indicacoes.filter((i) => i.status === "instalado").length;
  const link = cliente.linkIndicacao || cliente.codigoIndicacao;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-zap/20 text-zap-ink">
            <Users className="size-6" />
          </div>
          <div>
            {/* título e texto vêm do /admin: mudar a chamada da campanha não é deploy */}
            <p className="font-display text-lg font-extrabold text-brand-deep">{config.titulo}</p>
            <p className="mt-1 max-w-xl font-body text-sm text-muted-foreground">
              {config.descricao}
              {instaladas > 0 &&
                ` Você já tem ${instaladas} indicação${instaladas > 1 ? "ões" : ""} instalada${instaladas > 1 ? "s" : ""}.`}
              {cliente.descontoAcumulado > 0 &&
                ` Acumulado até agora: ${moeda(cliente.descontoAcumulado)}.`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {link && <BotaoCopiar texto={link} rotulo="Copiar meu link" />}
          <Button type="button" variant="brand" onClick={() => aoAbrir("indicacoes")}>
            Indicar um amigo
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>

      {cliente.codigoIndicacao && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/50 px-3 py-2">
          <Copy className="size-3.5 text-muted-foreground" />
          <span className="font-ui text-xs text-muted-foreground">Seu código:</span>
          <span className="font-display text-sm font-extrabold tracking-wide text-brand">
            {cliente.codigoIndicacao}
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------------- contratos ---------------- */

export function SecaoContratos({
  contratos,
  aoAbrir,
  aoSelecionarContrato,
}: {
  contratos: Contrato[];
  aoAbrir: (servico: ServicoPainelId) => void;
  aoSelecionarContrato: (id: string) => void;
}) {
  if (contratos.length === 0) {
    return (
      <div>
        <TituloSecao>Meus contratos</TituloSecao>
        <EstadoVazio
          icone={Wifi}
          titulo="Nenhum contrato encontrado"
          texto="Não localizamos contratos ativos no seu cadastro. Fale com o atendimento para conferir."
        />
      </div>
    );
  }

  return (
    <div>
      <TituloSecao>Meus contratos ({contratos.length})</TituloSecao>
      <div className="space-y-4">
        {contratos.map((contrato) => (
          <CartaoContrato
            key={contrato.id}
            contrato={contrato}
            aoAbrir={aoAbrir}
            aoSelecionarContrato={aoSelecionarContrato}
          />
        ))}
      </div>
    </div>
  );
}

function CartaoContrato({
  contrato,
  aoAbrir,
  aoSelecionarContrato,
}: {
  contrato: Contrato;
  aoAbrir: (servico: ServicoPainelId) => void;
  aoSelecionarContrato: (id: string) => void;
}) {
  const [detalhes, setDetalhes] = useState(false);

  const abrir = (servico: ServicoPainelId) => {
    aoSelecionarContrato(contrato.id);
    aoAbrir(servico);
  };

  const endereco = contrato.enderecoTexto || enderecoEmLinha(contrato.endereco);

  /*
   * Os detalhes técnicos só existem quando o cadastro os tem. Um botão que abre
   * cinco linhas de "—" é pior do que botão nenhum.
   */
  const tecnicos = [
    ["Rede Wi-Fi", contrato.ssidWifi],
    ["Equipamento", contrato.roteador],
    ["Endereço IP", contrato.ip],
    ["Instalado em", data(contrato.instaladoEm)],
    ["Início do contrato", data(contrato.adesao)],
    ["Vigência até", data(contrato.vigenciaAte)],
    ["Tecnologia", contrato.tecnologia],
  ].filter(([, valor]) => valor && valor !== "\u2014");

  return (
    <CartaoPainel>
      {/*
        Sem `flex-wrap`: o apelido vem do endereço e pode ser longo, e com wrap
        o valor caía para baixo do título em um card e ficava à direita no
        outro. O título encolhe (`min-w-0`) e o valor fica onde sempre está.
      */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 break-words font-display text-base font-extrabold text-brand-deep">
              {contrato.apelido}
            </p>
            <SeloStatus tipo="financeiro" valor={contrato.statusFinanceiro} />
          </div>
          {contrato.numero && (
            <p className="mt-0.5 font-body text-xs text-muted-foreground">
              Contrato {contrato.numero}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="font-display text-lg font-extrabold text-foreground">
            {moeda(contrato.valorMensal)}
          </p>
          {contrato.diaVencimento > 0 && (
            <p className="font-body text-xs text-muted-foreground">
              vence todo dia {contrato.diaVencimento}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-secondary/60 p-4">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-brand" />
          <p className="font-ui text-sm font-bold text-foreground">{contrato.plano || "Plano"}</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-body text-xs text-muted-foreground">
          {contrato.download && <span>Download: {contrato.download}</span>}
          {contrato.upload && <span>Upload: {contrato.upload}</span>}
          {contrato.tecnologia && <span>{contrato.tecnologia}</span>}
        </div>

        {contrato.composicao.length > 0 && (
          <ul className="mt-3 grid gap-1 sm:grid-cols-2">
            {contrato.composicao.map((item) => (
              <li
                key={item}
                className="flex items-start gap-1.5 font-body text-xs text-muted-foreground"
              >
                <Check className="mt-0.5 size-3 shrink-0 text-brand" />
                {item}
              </li>
            ))}
          </ul>
        )}
        {endereco && (
          <p className="mt-2 flex items-start gap-1.5 font-body text-xs text-muted-foreground">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            {endereco}
          </p>
        )}
      </div>

      {/*
        Só ações que o cadastro sustenta de ponta a ponta. Testar velocidade e
        reiniciar a conexão pediam uma medição e um comando no equipamento que
        nenhuma tabela nossa tem hoje — um botão que responde sempre a mesma
        coisa é pior do que botão nenhum.
      */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="brand" onClick={() => abrir("trocar_plano")}>
          <Zap className="size-4" />
          Trocar de plano
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => abrir("segunda_via")}>
          <Receipt className="size-4" />
          2ª via
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => abrir("suporte")}>
          <Headphones className="size-4" />
          Suporte
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => abrir("mudanca_endereco")}>
          <Truck className="size-4" />
          Mudar endereço
        </Button>
      </div>

      {tecnicos.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setDetalhes((v) => !v)}
            className="mt-3 flex cursor-pointer items-center gap-1 font-ui text-xs font-bold text-brand hover:underline"
          >
            {detalhes ? "Esconder detalhes do contrato" : "Ver detalhes do contrato"}
            <ChevronDown
              className={cn("size-3.5 transition-transform", detalhes && "rotate-180")}
            />
          </button>

          {detalhes && (
            <div className="mt-2 rounded-xl border border-border p-3">
              {tecnicos.map(([rotulo, valor]) => (
                <LinhaDado key={rotulo} rotulo={rotulo as string} valor={valor} />
              ))}
            </div>
          )}
        </>
      )}
    </CartaoPainel>
  );
}

/* ---------------- grade de serviços ---------------- */

export function GradeServicos({
  faturasEmAberto,
  servicosOcultos,
  aoAbrir,
}: {
  faturasEmAberto: number;
  /** Serviços desligados no /admin — não aparecem nem por link direto. */
  servicosOcultos: readonly ServicoPainelId[];
  aoAbrir: (servico: ServicoPainelId) => void;
}) {
  return (
    <div>
      <TituloSecao>Serviços</TituloSecao>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SERVICOS.filter((s) => !s.oculto && !servicosOcultos.includes(s.id)).map((servico) => {
          const Icone = servico.icone;
          const aviso =
            servico.id === "segunda_via" && faturasEmAberto > 0 ? faturasEmAberto : null;
          return (
            <button
              key={servico.id}
              type="button"
              onClick={() => aoAbrir(servico.id)}
              className="group relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
            >
              {aviso !== null && (
                <span className="absolute right-2 top-2 rounded bg-red-100 px-1.5 py-0.5 font-ui text-[10px] font-bold text-red-700">
                  {aviso}
                </span>
              )}
              <span
                className={cn(
                  "grid size-11 place-items-center rounded-full transition-transform group-hover:scale-105",
                  servico.cor,
                )}
              >
                <Icone className="size-5" />
              </span>
              <span className="font-ui text-xs font-bold leading-snug text-foreground group-hover:text-brand">
                {servico.titulo}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- chamados ---------------- */

export function SecaoChamados({
  chamados,
  aoAbrir,
}: {
  chamados: Chamado[];
  aoAbrir: (servico: ServicoPainelId) => void;
}) {
  const recentes = chamados.slice(0, 4);

  return (
    <div>
      <TituloSecao
        acao={
          <Button type="button" size="sm" variant="outline" onClick={() => aoAbrir("suporte")}>
            <Headphones className="size-4" />
            Abrir chamado
          </Button>
        }
      >
        Atendimentos
      </TituloSecao>

      {recentes.length === 0 ? (
        <EstadoVazio
          icone={BadgeCheck}
          titulo="Nenhum chamado aberto"
          texto="Quando você abrir um atendimento, o protocolo e o andamento aparecem aqui."
        />
      ) : (
        <div className="space-y-2">
          {recentes.map((chamado) => (
            <CartaoPainel key={chamado.id} className="p-4 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-ui text-sm font-bold text-foreground">
                    {chamado.assunto || chamado.categoria || "Atendimento"}
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    Protocolo {chamado.protocolo || "—"} · aberto em {data(chamado.abertoEm)}
                    {chamado.agendadoPara && ` · visita ${data(chamado.agendadoPara)}`}
                  </p>
                </div>
                <SeloStatus tipo="chamado" valor={chamado.status} />
              </div>
            </CartaoPainel>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- resumo lateral ---------------- */

export function ResumoCliente({ painel }: { painel: PainelSnapshot }) {
  const { cliente } = painel;
  const endereco = enderecoEmLinha(cliente.endereco);

  return (
    <CartaoPainel>
      <TituloSecao
        acao={
          cliente.status === "inativo" ? (
            <Badge
              variant="outline"
              className="border-slate-200 bg-slate-100 font-ui font-semibold text-slate-600"
            >
              Cadastro inativo
            </Badge>
          ) : undefined
        }
      >
        Meu cadastro
      </TituloSecao>

      <LinhaDado rotulo="Nome" valor={cliente.nome} />
      <LinhaDado
        rotulo={cliente.tipoCadastro === "cnpj" ? "CNPJ" : "CPF"}
        valor={documento(cliente.documento)}
      />
      <LinhaDado rotulo="Código" valor={cliente.codigo} />
      {cliente.tipoCadastro !== "cnpj" && cliente.nascimento && (
        <LinhaDado rotulo="Nascimento" valor={data(cliente.nascimento)} />
      )}
      <LinhaDado rotulo="E-mail" valor={cliente.email} />
      <LinhaDado rotulo="Telefone" valor={telefone(cliente.telefone)} />
      {endereco && <LinhaDado rotulo="Endereço" valor={endereco} />}
      <LinhaDado rotulo="Cliente desde" valor={data(cliente.clienteDesde)} />
    </CartaoPainel>
  );
}

/**
 * O aviso de cadastro inativo.
 *
 * Vale um bloco próprio no topo, e não só o selo do cartão: um cadastro
 * inativo explica de uma vez por que a conexão caiu, por que não há fatura
 * nova e por que os pedidos vão demorar — e sem essa frase o cliente atribui
 * cada um desses sintomas a um problema diferente.
 */
export function AvisoCadastroInativo() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700" />
      <div>
        <p className="font-display text-sm font-extrabold text-amber-900">
          Seu cadastro está inativo
        </p>
        <p className="mt-0.5 font-body text-sm text-amber-900/80">
          Enquanto ele estiver assim, os serviços desta página ficam limitados. Fale com o
          atendimento para reativar.
        </p>
      </div>
    </div>
  );
}
