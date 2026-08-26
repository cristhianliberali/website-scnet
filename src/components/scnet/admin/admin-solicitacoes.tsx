/**
 * A fila de atendimento: tudo que os clientes pediram pelo painel.
 *
 * Cada linha é uma solicitação de `web_formularios`, com o protocolo que o
 * cliente vê na tela dele. O que um humano mexe aqui é pouco de propósito —
 * status, assunto, data da visita e uma observação interna. O resto (quem
 * pediu, o que pediu, quando) é registro, e registro não se edita.
 *
 * A observação interna **não** aparece para o cliente: é o campo onde se
 * escreve "cliente não atende" sem que isso vire uma mensagem.
 */

import { useMemo, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { data as formatarData } from "@/lib/painel-formato";
import { LIMITE, LIMITE_ADMIN } from "@/lib/form-limits";
import {
  STATUS_SOLICITACAO,
  type SolicitacaoAdmin,
  type StatusSolicitacao,
} from "@/lib/admin-tipos";
import {
  BotaoSalvar,
  LinhaExpansivel,
  SelecaoAdmin,
  SeloAdmin,
  TextoAdmin,
  TextoLongoAdmin,
  TituloBloco,
  Vazio,
} from "./admin-ui";

const OPCOES_STATUS = [
  ["em_aberto", STATUS_SOLICITACAO.em_aberto],
  ["concluido", STATUS_SOLICITACAO.concluido],
  ["cancelado", STATUS_SOLICITACAO.cancelado],
] as const satisfies readonly (readonly [StatusSolicitacao, string])[];

const OPCOES_FILTRO = [["todos", "Todos os status"], ...OPCOES_STATUS] as const;

const tomDoStatus = (status: StatusSolicitacao) =>
  status === "concluido" ? "ok" : status === "cancelado" ? "off" : "aberto";

export type EdicaoSolicitacaoForm = {
  id: string;
  status: StatusSolicitacao;
  assunto: string;
  agendadoPara: string;
  observacaoInterna: string;
};

export function SecaoSolicitacoes({
  solicitacoes,
  salvando,
  aoSalvar,
}: {
  solicitacoes: SolicitacaoAdmin[];
  salvando: boolean;
  aoSalvar: (edicao: EdicaoSolicitacaoForm) => void;
}) {
  const [filtro, setFiltro] = useState<StatusSolicitacao | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<EdicaoSolicitacaoForm | null>(null);

  /*
   * O filtro é aqui, e não no banco: as listas já vieram inteiras na abertura da
   * tela (o servidor corta em 300 linhas), e filtrar em memória responde no
   * mesmo quadro em que a tecla é digitada.
   */
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return solicitacoes.filter((s) => {
      if (filtro !== "todos" && s.status !== filtro) return false;
      if (!termo) return true;
      return [s.protocolo, s.nomeCliente, s.idCliente, s.assunto, s.categoria, s.formulario]
        .join(" ")
        .toLowerCase()
        .includes(termo);
    });
  }, [solicitacoes, filtro, busca]);

  const abrir = (s: SolicitacaoAdmin) => {
    setAberto(s.id);
    setRascunho({
      id: s.id,
      status: s.status,
      assunto: s.assunto,
      agendadoPara: s.agendadoPara.slice(0, 10),
      observacaoInterna: s.observacaoInterna,
    });
  };

  return (
    <div className="space-y-3">
      <TituloBloco>Solicitações e formulários</TituloBloco>

      <div className="flex flex-wrap items-end gap-3">
        <SelecaoAdmin
          rotulo="Status"
          valor={filtro}
          opcoes={OPCOES_FILTRO}
          aoMudar={setFiltro}
          className="w-48"
        />
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Protocolo, cliente, assunto…"
            maxLength={LIMITE.busca}
            className="pl-9"
          />
        </div>
        <p className="font-body text-xs text-muted-foreground">
          {visiveis.length} de {solicitacoes.length}
        </p>
      </div>

      {visiveis.length === 0 ? (
        <Vazio texto="Nenhuma solicitação com esse filtro." />
      ) : (
        <div className="space-y-2">
          {visiveis.map((s) => (
            <LinhaExpansivel
              key={s.id}
              aberto={aberto === s.id}
              aoAlternar={() => (aberto === s.id ? setAberto(null) : abrir(s))}
              resumo={
                <>
                  <span className="min-w-0">
                    <span className="block font-ui text-sm font-bold text-foreground">
                      {s.assunto || s.categoria || s.formulario}
                    </span>
                    <span className="block font-body text-xs text-muted-foreground">
                      {s.protocolo} · {s.nomeCliente || `cliente ${s.idCliente}`} ·{" "}
                      {formatarData(s.criadoEm.slice(0, 10))}
                      {s.agendadoPara && ` · visita ${formatarData(s.agendadoPara.slice(0, 10))}`}
                    </span>
                  </span>
                  <SeloAdmin texto={STATUS_SOLICITACAO[s.status]} tom={tomDoStatus(s.status)} />
                </>
              }
            >
              {rascunho && rascunho.id === s.id && (
                <Editor
                  solicitacao={s}
                  rascunho={rascunho}
                  aoMudar={setRascunho}
                  salvando={salvando}
                  aoSalvar={aoSalvar}
                  aoCancelar={() => setAberto(null)}
                />
              )}
            </LinhaExpansivel>
          ))}
        </div>
      )}
    </div>
  );
}

function Editor({
  solicitacao,
  rascunho,
  aoMudar,
  salvando,
  aoSalvar,
  aoCancelar,
}: {
  solicitacao: SolicitacaoAdmin;
  rascunho: EdicaoSolicitacaoForm;
  aoMudar: (edicao: EdicaoSolicitacaoForm) => void;
  salvando: boolean;
  aoSalvar: (edicao: EdicaoSolicitacaoForm) => void;
  aoCancelar: () => void;
}) {
  const [verCampos, setVerCampos] = useState(false);

  function submeter(e: FormEvent) {
    e.preventDefault();
    aoSalvar(rascunho);
  }

  return (
    <form onSubmit={submeter} className="space-y-3">
      <dl className="grid gap-x-6 gap-y-1 rounded-lg bg-secondary/50 p-3 font-body text-xs sm:grid-cols-2">
        <Linha rotulo="Formulário" valor={`${solicitacao.categoria} (${solicitacao.formulario})`} />
        <Linha rotulo="Cliente" valor={`${solicitacao.nomeCliente} · ${solicitacao.idCliente}`} />
        <Linha rotulo="Contrato" valor={solicitacao.codContrato || "—"} />
        <Linha rotulo="Enviado em" valor={solicitacao.criadoEm.replace("T", " ").slice(0, 16)} />
        {solicitacao.descricao && <Linha rotulo="Descrição" valor={solicitacao.descricao} largo />}
      </dl>

      <div className="grid gap-3 sm:grid-cols-3">
        <SelecaoAdmin
          rotulo="Status"
          valor={rascunho.status}
          opcoes={OPCOES_STATUS}
          aoMudar={(v) => aoMudar({ ...rascunho, status: v })}
        />
        <TextoAdmin
          rotulo="Data da visita"
          valor={rascunho.agendadoPara}
          aoMudar={(v) => aoMudar({ ...rascunho, agendadoPara: v })}
          type="date"
          dica="Aparece para o cliente."
        />
        <TextoAdmin
          rotulo="Assunto"
          valor={rascunho.assunto}
          aoMudar={(v) => aoMudar({ ...rascunho, assunto: v })}
          dica="É o título na tela dele."
          maxLength={LIMITE_ADMIN.solicitacao.assunto}
        />
      </div>

      <TextoLongoAdmin
        rotulo="Observação interna"
        valor={rascunho.observacaoInterna}
        aoMudar={(v) => aoMudar({ ...rascunho, observacaoInterna: v })}
        dica="Só para o time. Não aparece na área do cliente."
        maxLength={LIMITE_ADMIN.solicitacao.observacaoInterna}
      />

      {solicitacao.campos && (
        <div>
          <button
            type="button"
            onClick={() => setVerCampos((v) => !v)}
            className="cursor-pointer font-ui text-xs font-bold text-brand hover:underline"
          >
            {verCampos ? "Esconder o formulário enviado" : "Ver o formulário enviado"}
          </button>
          {verCampos && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
              {solicitacao.campos}
            </pre>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" size="sm" variant="outline" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <BotaoSalvar salvando={salvando} rotulo="Salvar solicitação" />
      </div>
    </form>
  );
}

function Linha({ rotulo, valor, largo }: { rotulo: string; valor: string; largo?: boolean }) {
  return (
    <div className={largo ? "sm:col-span-2" : undefined}>
      <dt className="inline text-muted-foreground">{rotulo}: </dt>
      <dd className="inline font-semibold text-foreground">{valor}</dd>
    </div>
  );
}
