/**
 * O prazo de instalação — a aba que decide quais datas o site promete.
 *
 * Três blocos, e cada um responde uma pergunta da operação:
 *
 * 1. **Expediente técnico.** Quantas horas a equipe de campo atende em cada dia
 *    da semana. É o combustível do cálculo: o prazo anda por essas horas, e não
 *    pelo relógio. Também é o que define os períodos que o cliente pode
 *    escolher — um sábado com equipe só de manhã não oferece a tarde.
 * 2. **Prazo padrão.** Quantas horas de atendimento uma instalação espera
 *    quando a cidade não está na tabela.
 * 3. **Prazo por cidade.** A exceção: a sede instala em 24 horas, o distrito a
 *    60 km espera a próxima saída da equipe. A busca é aproximada — acento,
 *    caixa e "/SC" no fim não atrapalham.
 *
 * O total de horas por dia e por semana aparece calculado ao lado, porque é
 * dele que sai a conta: "48 horas" com 9 horas de expediente por dia é uma
 * coisa muito diferente de "48 horas" com 4.
 */

import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DIAS_SEMANA,
  MAX_CIDADES_PRAZO,
  type ConfigAgendamento,
  type ExpedienteDia,
  type PrazoCidade,
} from "@/lib/admin-tipos";
import { LIMITE_ADMIN } from "@/lib/form-limits";
import { BotaoSalvar, Cartao, CampoAdmin, TextoAdmin, TituloBloco } from "./admin-ui";

const L = LIMITE_ADMIN.agendamento;

/** "08:00" → 480. Só para somar as horas mostradas na tela. */
function minutos(valor: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valor.trim());
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2]);
  if (hora > 23 || minuto > 59) return null;
  return hora * 60 + minuto;
}

/** As horas de atendimento de um dia — a mesma conta que o cálculo da agenda faz. */
function horasDoDia(dia: ExpedienteDia): number {
  const faixa = (atende: boolean, de: string, ate: string) => {
    if (!atende) return 0;
    const inicio = minutos(de);
    const fim = minutos(ate);
    if (inicio === null || fim === null || fim <= inicio) return 0;
    return (fim - inicio) / 60;
  };
  return (
    faixa(dia.atendeManha, dia.manhaInicio, dia.manhaFim) +
    faixa(dia.atendeTarde, dia.tardeInicio, dia.tardeFim)
  );
}

const horas = (valor: number) => `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;

export function SecaoAgendamento({
  config,
  salvando,
  aoSalvar,
}: {
  config: ConfigAgendamento;
  salvando: boolean;
  aoSalvar: (config: ConfigAgendamento) => void;
}) {
  const [rascunho, setRascunho] = useState<ConfigAgendamento>(config);

  const campo = <K extends keyof ConfigAgendamento>(chave: K, valor: ConfigAgendamento[K]) =>
    setRascunho((atual) => ({ ...atual, [chave]: valor }));

  const mudarDia = (indice: number, parte: Partial<ExpedienteDia>) =>
    setRascunho((atual) => ({
      ...atual,
      expediente: atual.expediente.map((dia, i) => (i === indice ? { ...dia, ...parte } : dia)),
    }));

  const mudarCidade = (indice: number, parte: Partial<PrazoCidade>) =>
    setRascunho((atual) => ({
      ...atual,
      cidades: atual.cidades.map((linha, i) => (i === indice ? { ...linha, ...parte } : linha)),
    }));

  const incluirCidade = () =>
    setRascunho((atual) =>
      atual.cidades.length >= MAX_CIDADES_PRAZO
        ? atual
        : { ...atual, cidades: [...atual.cidades, { cidade: "", horas: "" }] },
    );

  const excluirCidade = (indice: number) =>
    setRascunho((atual) => ({
      ...atual,
      cidades: atual.cidades.filter((_, i) => i !== indice),
    }));

  function submeter(e: FormEvent) {
    e.preventDefault();
    // Linha em branco é rascunho de quem clicou em "incluir" e desistiu — não
    // vale a pena gravá-la nem recusar o salvamento por causa dela.
    aoSalvar({ ...rascunho, cidades: rascunho.cidades.filter((c) => c.cidade.trim() !== "") });
  }

  const horasNaSemana = rascunho.expediente.reduce((soma, dia) => soma + horasDoDia(dia), 0);

  return (
    <form onSubmit={submeter} className="space-y-4">
      <TituloBloco>Prazo de instalação</TituloBloco>

      <p className="font-body text-xs text-muted-foreground">
        É daqui que sai o calendário da última etapa da contratação. O prazo é contado em{" "}
        <strong>horas de atendimento técnico</strong>, não em horas de relógio: com o expediente
        abaixo, a agenda anda {horas(horasNaSemana)} por semana. Quando a fila apertar, aumente o
        prazo — o próximo cliente já vê a data nova, sem deploy.
      </p>

      <Cartao className="space-y-3">
        <p className="font-ui text-sm font-bold text-foreground">Expediente técnico da semana</p>
        <p className="font-body text-xs text-muted-foreground">
          As horas em que existe equipe instalando. Além de alimentarem o cálculo, elas são os
          períodos que o cliente pode escolher: um dia sem tarde não oferece tarde, e um dia sem
          nenhuma faixa não aparece no calendário.
        </p>

        <div className="space-y-2">
          {rascunho.expediente.map((dia, i) => (
            <LinhaDia
              key={DIAS_SEMANA[i]}
              nome={DIAS_SEMANA[i] ?? `Dia ${i}`}
              dia={dia}
              aoMudar={(parte) => mudarDia(i, parte)}
            />
          ))}
        </div>

        <p className="font-body text-xs text-muted-foreground">
          Total: <strong>{horas(horasNaSemana)} por semana</strong>.
          {horasNaSemana === 0 &&
            " Sem nenhuma hora de atendimento não haveria data para oferecer — nesse caso o site volta ao expediente padrão (seg. a sex., 08h–12h e 13h–18h)."}
        </p>
      </Cartao>

      <Cartao className="grid gap-3 sm:grid-cols-2">
        <TextoAdmin
          rotulo="Prazo padrão (horas)"
          valor={rascunho.prazoPadraoHoras}
          aoMudar={(v) => campo("prazoPadraoHoras", v)}
          inputMode="numeric"
          maxLength={L.horas}
          placeholder="48"
          dica="Vale para toda cidade que não estiver na tabela abaixo."
        />
        <TextoAdmin
          rotulo="Calendário aberto por (dias)"
          valor={rascunho.horizonteDias}
          aoMudar={(v) => campo("horizonteDias", v)}
          inputMode="numeric"
          maxLength={L.horizonteDias}
          placeholder="60"
          dica="Até quantos dias à frente o cliente pode escolher a data."
        />
      </Cartao>

      <Cartao className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-ui text-sm font-bold text-foreground">Prazo por cidade</p>
          <Button
            type="button"
            size="sm"
            variant="brand"
            onClick={incluirCidade}
            disabled={rascunho.cidades.length >= MAX_CIDADES_PRAZO}
          >
            <Plus className="size-4" />
            Incluir cidade
          </Button>
        </div>
        <p className="font-body text-xs text-muted-foreground">
          A cidade do cliente é comparada por aproximação: acento, maiúscula, pontuação e o estado
          no fim não atrapalham, e um erro de digitação curto ainda encontra a linha. Sem
          correspondência, vale o prazo padrão.
        </p>

        {rascunho.cidades.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center font-body text-sm text-muted-foreground">
            Nenhuma cidade cadastrada — todas usam o prazo padrão de{" "}
            {rascunho.prazoPadraoHoras || "48"} horas.
          </p>
        ) : (
          <div className="space-y-2">
            {rascunho.cidades.map((linha, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-border p-2"
              >
                <TextoAdmin
                  rotulo="Cidade"
                  valor={linha.cidade}
                  aoMudar={(v) => mudarCidade(i, { cidade: v })}
                  maxLength={L.cidade}
                  placeholder="Chapecó"
                  className="min-w-[12rem] flex-1"
                />
                <TextoAdmin
                  rotulo="Prazo (horas)"
                  valor={linha.horas}
                  aoMudar={(v) => mudarCidade(i, { horas: v })}
                  inputMode="numeric"
                  maxLength={L.horas}
                  placeholder={rascunho.prazoPadraoHoras || "48"}
                  className="w-32"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => excluirCidade(i)}
                  aria-label={`Remover ${linha.cidade || "cidade"}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Cartao>

      <div className="flex justify-end">
        <BotaoSalvar salvando={salvando} rotulo="Salvar prazo de instalação" />
      </div>
    </form>
  );
}

/** Uma linha do expediente: o dia, as duas faixas e o total de horas dele. */
function LinhaDia({
  nome,
  dia,
  aoMudar,
}: {
  nome: string;
  dia: ExpedienteDia;
  aoMudar: (parte: Partial<ExpedienteDia>) => void;
}) {
  const total = horasDoDia(dia);
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-ui text-sm font-bold text-foreground">{nome}</p>
        <span className="font-body text-xs text-muted-foreground">
          {total > 0 ? `${horas(total)} de atendimento` : "sem atendimento"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FaixaPeriodo
          rotulo="Manhã"
          atende={dia.atendeManha}
          inicio={dia.manhaInicio}
          fim={dia.manhaFim}
          aoAlternar={(v) => aoMudar({ atendeManha: v })}
          aoMudarInicio={(v) => aoMudar({ manhaInicio: v })}
          aoMudarFim={(v) => aoMudar({ manhaFim: v })}
        />
        <FaixaPeriodo
          rotulo="Tarde"
          atende={dia.atendeTarde}
          inicio={dia.tardeInicio}
          fim={dia.tardeFim}
          aoAlternar={(v) => aoMudar({ atendeTarde: v })}
          aoMudarInicio={(v) => aoMudar({ tardeInicio: v })}
          aoMudarFim={(v) => aoMudar({ tardeFim: v })}
        />
      </div>
    </div>
  );
}

function FaixaPeriodo({
  rotulo,
  atende,
  inicio,
  fim,
  aoAlternar,
  aoMudarInicio,
  aoMudarFim,
}: {
  rotulo: string;
  atende: boolean;
  inicio: string;
  fim: string;
  aoAlternar: (valor: boolean) => void;
  aoMudarInicio: (valor: string) => void;
  aoMudarFim: (valor: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={atende}
          onChange={(e) => aoAlternar(e.target.checked)}
          className="size-4 accent-[var(--color-brand)]"
        />
        <span className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Atende de {rotulo.toLowerCase()}
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <CampoAdmin rotulo="Início">
          <Input
            type="time"
            value={inicio}
            disabled={!atende}
            maxLength={L.horario}
            onChange={(e) => aoMudarInicio(e.target.value)}
          />
        </CampoAdmin>
        <CampoAdmin rotulo="Fim">
          <Input
            type="time"
            value={fim}
            disabled={!atende}
            maxLength={L.horario}
            onChange={(e) => aoMudarFim(e.target.value)}
          />
        </CampoAdmin>
      </div>
    </div>
  );
}
