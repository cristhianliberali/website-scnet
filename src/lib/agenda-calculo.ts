/**
 * A agenda de instalação: de "quantas horas essa cidade espera" até "quais
 * datas e períodos o formulário pode oferecer".
 *
 * ## O que este arquivo resolve
 *
 * O calendário da contratação liberava qualquer data a partir de hoje + 2 dias,
 * fixo no código, com manhã e tarde sempre disponíveis. Isso é uma promessa que
 * a operação não assinou: a fila de instalação muda toda semana, e é diferente
 * em cada cidade. Aqui a data sai de dois números que o /admin alimenta — as
 * **horas de atendimento técnico** de cada dia da semana e o **prazo em horas**
 * daquela cidade — e não de uma constante.
 *
 * ## Como o prazo anda
 *
 * O prazo é contado em horas de ATENDIMENTO, não em horas de relógio: 48 horas
 * com expediente de 9h por dia caem no quinto dia útil, e não em dois dias. É o
 * que faz o número significar a mesma coisa para quem o alimenta ("tenho dois
 * dias e meio de equipe na frente dessa instalação") e para quem o cumpre.
 *
 * ## Por que é uma função pura
 *
 * A data que o site promete é o produto desta conta. Ela precisa ser conferível
 * sem banco, sem navegador e sem esperar dar meia-noite — daí `agora` e o fuso
 * entrarem como argumento, e nada aqui ler relógio, ambiente ou Postgres.
 */

import {
  CONFIG_AGENDAMENTO_PADRAO,
  type ConfigAgendamento,
  type ExpedienteDia,
} from "./admin-tipos";

export type PeriodoInstalacao = "manha" | "tarde";

/** Um período oferecido num dia — o rótulo e a faixa vêm do expediente daquele dia. */
export type PeriodoDisponivel = {
  id: PeriodoInstalacao;
  rotulo: string;
  /** "08h às 12h" */
  faixa: string;
};

export type DiaDisponivel = {
  /** AAAA-MM-DD, o mesmo formato que o calendário do formulário usa. */
  data: string;
  periodos: PeriodoDisponivel[];
};

/** O que o formulário recebe para desenhar o calendário. */
export type AgendaInstalacao = {
  /** O prazo aplicado, em horas de atendimento. */
  prazoHoras: number;
  /** A cidade da tabela que casou com a do cliente. Vazio = prazo padrão. */
  cidadeReferencia: string;
  /** A primeira data oferecida. Vazio quando não há nenhuma. */
  primeiraData: string;
  dias: DiaDisponivel[];
};

/** Onde a empresa trabalha — o cálculo é feito na hora de lá, não na do servidor. */
export const FUSO_PADRAO = "America/Sao_Paulo";

const ROTULO_PERIODO: Record<PeriodoInstalacao, string> = { manha: "Manhã", tarde: "Tarde" };

/** Teto de segurança: nem prazo nem varredura passam de um ano. */
const MAX_HORAS = 24 * 365;
const MAX_DIAS_VARREDURA = 400;
const MAX_HORIZONTE_DIAS = 180;

/* ---------------- cidade ---------------- */

/**
 * "São Miguel do Oeste", "sao miguel d'oeste" e "SAO MIGUEL DO OESTE/SC" viram a
 * mesma coisa.
 *
 * O texto vem do ViaCEP ou da digitação do cliente, e nenhum dos dois combina
 * acento, caixa e pontuação com o que foi cadastrado no /admin. Comparar o
 * texto cru é garantir que a cidade cadastrada não seja encontrada justamente
 * quando alguém digita à mão.
 */
export function normalizarCidade(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distância de edição, usada só para tolerar um erro de digitação curto. */
function distancia(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min(
        (atual[j - 1] ?? 0) + 1,
        (anterior[j] ?? 0) + 1,
        (anterior[j - 1] ?? 0) + custo,
      );
    }
    anterior = atual;
  }
  return anterior[b.length] ?? Math.max(a.length, b.length);
}

/**
 * A linha da tabela que corresponde à cidade do cliente — por aproximação.
 *
 * Três tentativas, da mais segura para a mais tolerante:
 *
 * 1. **Igual** depois de normalizar. É o caso de 99% dos envios, em que a
 *    cidade veio do ViaCEP.
 * 2. **Uma contém a outra**, o que resolve "Chapecó" contra "Chapecó - SC" e
 *    "São Miguel" contra "São Miguel do Oeste".
 * 3. **Um erro de digitação**, com a tolerância crescendo com o tamanho do nome
 *    (um caractere até 10 letras, dois até 15, e assim por diante). Sem isso,
 *    "Xanxere" cairia no prazo padrão — que é o comportamento certo para uma
 *    cidade que não é atendida, e errado para uma que só foi digitada torto.
 *
 * Empate entre duas linhas fica com a mais parecida; entre iguais, com a
 * primeira da tabela.
 */
export function cidadeDoPrazo(
  cidades: readonly { cidade: string; horas: string }[],
  cidade: string,
): { cidade: string; horas: string } | null {
  const alvo = normalizarCidade(cidade);
  if (!alvo) return null;

  const candidatas = cidades
    .map((linha) => ({ linha, chave: normalizarCidade(linha.cidade) }))
    .filter(({ chave }) => chave !== "");

  const igual = candidatas.find(({ chave }) => chave === alvo);
  if (igual) return igual.linha;

  const contida = candidatas.find(({ chave }) => alvo.includes(chave) || chave.includes(alvo));
  if (contida) return contida.linha;

  let melhor: { linha: { cidade: string; horas: string }; dist: number } | null = null;
  for (const { linha, chave } of candidatas) {
    const tolerancia = Math.max(1, Math.floor(Math.max(chave.length, alvo.length) / 5) - 1);
    const dist = distancia(alvo, chave);
    if (dist <= tolerancia && (melhor === null || dist < melhor.dist)) melhor = { linha, dist };
  }
  return melhor?.linha ?? null;
}

/* ---------------- números e horários ---------------- */

/** Texto de formulário virando número. Lixo, vazio ou negativo caem no padrão. */
function numero(valor: string | undefined, padrao: number, max: number): number {
  const n = Number(
    String(valor ?? "")
      .replace(",", ".")
      .trim(),
  );
  if (!Number.isFinite(n) || n < 0) return padrao;
  return Math.min(n, max);
}

/** "08:30" vira 510 minutos. Formato estranho vira `null`. */
function minutosDoHorario(valor: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(valor.trim());
  if (!m) return null;
  const hora = Number(m[1]);
  const minuto = Number(m[2]);
  if (hora > 23 || minuto > 59) return null;
  return hora * 60 + minuto;
}

/** 510 vira "08h30"; 480 vira "08h" — como se lê num anúncio, não num relógio. */
function rotuloHorario(minutos: number): string {
  const hora = String(Math.floor(minutos / 60)).padStart(2, "0");
  const minuto = minutos % 60;
  return minuto === 0 ? `${hora}h` : `${hora}h${String(minuto).padStart(2, "0")}`;
}

/* ---------------- expediente ---------------- */

type Janela = { id: PeriodoInstalacao; inicio: number; fim: number };

/** As faixas de atendimento de um dia, já em minutos e em ordem. */
function janelasDoDia(dia: ExpedienteDia | undefined): Janela[] {
  if (!dia) return [];
  const janelas: Janela[] = [];

  const adicionar = (id: PeriodoInstalacao, atende: boolean, inicio: string, fim: string) => {
    if (!atende) return;
    const de = minutosDoHorario(inicio);
    const ate = minutosDoHorario(fim);
    // Faixa invertida ou vazia não é expediente — é engano de digitação, e
    // oferecê-la seria prometer um horário que não existe.
    if (de === null || ate === null || ate <= de) return;
    janelas.push({ id, inicio: de, fim: ate });
  };

  adicionar("manha", dia.atendeManha, dia.manhaInicio, dia.manhaFim);
  adicionar("tarde", dia.atendeTarde, dia.tardeInicio, dia.tardeFim);
  return janelas.sort((a, b) => a.inicio - b.inicio);
}

/**
 * O expediente que vale.
 *
 * Uma semana inteira sem nenhuma hora de atendimento não é uma configuração:
 * é uma tela salva pela metade, e respeitá-la ao pé da letra deixaria o cliente
 * diante de um calendário sem nenhuma data. Nesse caso vale o padrão do código
 * — o mesmo horário que o formulário anunciava antes desta tela existir.
 */
function expedienteEmVigor(config: ConfigAgendamento): ExpedienteDia[] {
  const tem = config.expediente.some((dia) => janelasDoDia(dia).length > 0);
  return tem ? config.expediente : CONFIG_AGENDAMENTO_PADRAO.expediente;
}

/* ---------------- calendário civil ---------------- */

/** Um instante no fuso da empresa, sem depender do fuso do servidor. */
type Instante = { data: string; minuto: number };

const formatadores = new Map<string, Intl.DateTimeFormat>();

function formatador(fuso: string): Intl.DateTimeFormat {
  const guardado = formatadores.get(fuso);
  if (guardado) return guardado;
  const novo = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  formatadores.set(fuso, novo);
  return novo;
}

/**
 * O relógio da empresa no instante dado.
 *
 * O container roda em UTC; a instalação acontece no Oeste catarinense. Sem esta
 * conversão, das 21h às 24h de Brasília o cálculo já estaria no dia seguinte —
 * e o cliente veria um dia a menos de espera do que a operação tem.
 */
export function instanteCivil(agora: Date, fuso: string): Instante {
  let partes: Intl.DateTimeFormatPart[];
  try {
    partes = formatador(fuso).formatToParts(agora);
  } catch {
    // Fuso inválido no ambiente: melhor a hora do servidor que nenhuma agenda.
    partes = formatador("UTC").formatToParts(agora);
  }
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "00";
  return {
    data: `${parte("year")}-${parte("month")}-${parte("day")}`,
    minuto: Number(parte("hour")) * 60 + Number(parte("minute")),
  };
}

/** AAAA-MM-DD + n dias, sem passar por fuso nenhum. */
function somarDias(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const d = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, (dia ?? 1) + dias));
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo, como o `expediente` do /admin. */
function diaDaSemana(data: string): number {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1, dia ?? 1)).getUTCDay();
}

const antesDe = (a: Instante, b: Instante): boolean =>
  a.data < b.data || (a.data === b.data && a.minuto < b.minuto);

/* ---------------- o cálculo ---------------- */

/**
 * O instante em que a instalação fica liberada: `agora` mais o prazo, contado
 * em horas de expediente.
 */
function liberacao(
  inicio: Instante,
  expediente: ExpedienteDia[],
  prazoMinutos: number,
): Instante | null {
  let restante = prazoMinutos;
  let data = inicio.data;

  for (let i = 0; i < MAX_DIAS_VARREDURA; i++) {
    const janelas = janelasDoDia(expediente[diaDaSemana(data)]);
    for (const janela of janelas) {
      // No primeiro dia, o que já passou do relógio não conta como disponível.
      const comeco = i === 0 ? Math.max(janela.inicio, inicio.minuto) : janela.inicio;
      const disponivel = janela.fim - comeco;
      if (disponivel <= 0) continue;
      if (restante <= disponivel) return { data, minuto: comeco + restante };
      restante -= disponivel;
    }
    data = somarDias(data, 1);
  }
  return null;
}

/**
 * A agenda que o formulário mostra.
 *
 * Um dia entra na lista quando tem expediente e quando pelo menos um dos seus
 * períodos COMEÇA depois da liberação — um período que já estaria em andamento
 * não é uma vaga, é um horário perdido.
 */
export function calcularAgenda({
  config,
  cidade,
  agora,
  fuso = FUSO_PADRAO,
}: {
  config: ConfigAgendamento;
  cidade: string;
  agora: Date;
  fuso?: string;
}): AgendaInstalacao {
  const expediente = expedienteEmVigor(config);
  const linha = cidadeDoPrazo(config.cidades, cidade);
  const padrao = numero(config.prazoPadraoHoras, 48, MAX_HORAS);
  const prazoHoras = linha ? numero(linha.horas, padrao, MAX_HORAS) : padrao;
  const horizonte = Math.max(1, Math.round(numero(config.horizonteDias, 60, MAX_HORIZONTE_DIAS)));

  const inicio = instanteCivil(agora, fuso);
  const livre = liberacao(inicio, expediente, Math.round(prazoHoras * 60));

  const dias: DiaDisponivel[] = [];
  if (livre) {
    const ultimo = somarDias(inicio.data, horizonte);
    for (let data = livre.data; data <= ultimo; data = somarDias(data, 1)) {
      const periodos = janelasDoDia(expediente[diaDaSemana(data)])
        .filter((janela) => !antesDe({ data, minuto: janela.inicio }, livre))
        .map((janela) => ({
          id: janela.id,
          rotulo: ROTULO_PERIODO[janela.id],
          faixa: `${rotuloHorario(janela.inicio)} às ${rotuloHorario(janela.fim)}`,
        }));
      if (periodos.length) dias.push({ data, periodos });
    }
  }

  return {
    prazoHoras,
    cidadeReferencia: linha?.cidade ?? "",
    primeiraData: dias[0]?.data ?? "",
    dias,
  };
}

/**
 * A agenda de reserva, com o expediente padrão do código.
 *
 * É o que o formulário usa quando a consulta ao servidor falha. Sem isto, uma
 * oscilação de rede deixaria o cliente com um calendário sem nenhuma data
 * disponível — e uma contratação pronta morreria na última etapa por causa de
 * uma configuração que ele nem sabe que existe.
 */
export function agendaDeReserva(agora: Date, fuso: string = FUSO_PADRAO): AgendaInstalacao {
  return calcularAgenda({ config: CONFIG_AGENDAMENTO_PADRAO, cidade: "", agora, fuso });
}

/** O período dentro de um dia da agenda, quando ele ainda estiver disponível. */
export function periodoDoDia(
  agenda: AgendaInstalacao | null,
  data: string,
  periodo: string,
): PeriodoDisponivel | null {
  const dia = agenda?.dias.find((d) => d.data === data);
  return dia?.periodos.find((p) => p.id === periodo) ?? null;
}
