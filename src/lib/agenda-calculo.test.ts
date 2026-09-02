/**
 * A conta que decide a data que o site promete.
 *
 * Ela precisa ser conferível sem banco, sem navegador e sem esperar dar
 * meia-noite — por isso `agora` entra como argumento e os testes abaixo
 * conseguem colocar o relógio onde interessa: no meio do expediente, depois do
 * expediente e na virada do dia no fuso do servidor.
 */

import { describe, expect, test } from "bun:test";

import {
  agendaDeReserva,
  calcularAgenda,
  cidadeDoPrazo,
  instanteCivil,
  normalizarCidade,
  periodoDoDia,
} from "./agenda-calculo";
import { CONFIG_AGENDAMENTO_PADRAO, type ConfigAgendamento } from "./admin-tipos";

/** Segunda a sexta, 08h–12h e 13h–18h (9h/dia). Sábado e domingo fechados. */
const SEMANA_UTIL: ConfigAgendamento = {
  ...CONFIG_AGENDAMENTO_PADRAO,
  prazoPadraoHoras: "9",
  horizonteDias: "30",
  expediente: CONFIG_AGENDAMENTO_PADRAO.expediente.map((dia, i) =>
    i >= 1 && i <= 5
      ? {
          atendeManha: true,
          manhaInicio: "08:00",
          manhaFim: "12:00",
          atendeTarde: true,
          tardeInicio: "13:00",
          tardeFim: "18:00",
        }
      : {
          ...dia,
          atendeManha: false,
          atendeTarde: false,
        },
  ),
};

/** 10h da manhã de uma quarta-feira em Brasília (UTC-3). */
const QUARTA_10H = new Date("2026-09-02T13:00:00Z");

const agenda = (config: ConfigAgendamento, cidade = "", agora = QUARTA_10H) =>
  calcularAgenda({ config, cidade, agora, fuso: "America/Sao_Paulo" });

describe("normalizarCidade", () => {
  test("acento, caixa e pontuação deixam de separar a mesma cidade", () => {
    expect(normalizarCidade("São Miguel do Oeste")).toBe("sao miguel do oeste");
    expect(normalizarCidade("  CHAPECÓ/SC ")).toBe("chapeco sc");
  });
});

describe("cidadeDoPrazo", () => {
  const cidades = [
    { cidade: "Chapecó", horas: "24" },
    { cidade: "São Miguel do Oeste", horas: "72" },
  ];

  test("encontra a cidade mesmo sem acento e em caixa alta", () => {
    expect(cidadeDoPrazo(cidades, "CHAPECO")?.horas).toBe("24");
  });

  test("o estado no fim do nome não atrapalha", () => {
    expect(cidadeDoPrazo(cidades, "Chapecó - SC")?.horas).toBe("24");
  });

  test("um erro de digitação curto ainda encontra a linha", () => {
    expect(cidadeDoPrazo(cidades, "Chapeco")?.cidade).toBe("Chapecó");
    expect(cidadeDoPrazo(cidades, "Sao Miguel do Oeste")?.horas).toBe("72");
  });

  test("cidade que não é atendida cai no padrão, e não na mais parecida", () => {
    expect(cidadeDoPrazo(cidades, "Curitiba")).toBeNull();
    expect(cidadeDoPrazo(cidades, "")).toBeNull();
  });
});

describe("calcularAgenda", () => {
  test("o prazo anda por horas de atendimento, não por horas de relógio", () => {
    // Quarta, 10h. Sobram 2h de manhã + 5h de tarde = 7h no dia; as 2h que
    // faltam caem na quinta às 10h, então a quinta ainda tem tarde.
    const resultado = agenda(SEMANA_UTIL);
    expect(resultado.prazoHoras).toBe(9);
    expect(resultado.primeiraData).toBe("2026-09-03");
    expect(resultado.dias[0]?.periodos.map((p) => p.id)).toEqual(["tarde"]);
  });

  test("o dia sem expediente não entra no calendário", () => {
    const resultado = agenda(SEMANA_UTIL);
    // 05/09/2026 é um sábado, e este expediente não atende no fim de semana.
    expect(resultado.dias.some((d) => d.data === "2026-09-05")).toBe(false);
    expect(resultado.dias.some((d) => d.data === "2026-09-07")).toBe(true);
  });

  test("o prazo da cidade vence o padrão", () => {
    const config: ConfigAgendamento = {
      ...SEMANA_UTIL,
      prazoPadraoHoras: "72",
      cidades: [{ cidade: "Chapecó", horas: "9" }],
    };
    expect(agenda(config, "chapeco").prazoHoras).toBe(9);
    expect(agenda(config, "chapeco").cidadeReferencia).toBe("Chapecó");
    expect(agenda(config, "Curitiba").prazoHoras).toBe(72);
    expect(agenda(config, "Curitiba").cidadeReferencia).toBe("");
  });

  test("a faixa mostrada é a do dia, e não uma fixa do código", () => {
    const config: ConfigAgendamento = {
      ...SEMANA_UTIL,
      expediente: SEMANA_UTIL.expediente.map((dia, i) =>
        i === 6 ? { ...dia, atendeManha: true, manhaInicio: "08:00", manhaFim: "11:30" } : dia,
      ),
    };
    const sabado = agenda(config).dias.find((d) => d.data === "2026-09-05");
    expect(sabado?.periodos).toEqual([{ id: "manha", rotulo: "Manhã", faixa: "08h às 11h30" }]);
  });

  test("prazo zero libera ainda hoje, mas só o período que ainda não começou", () => {
    const resultado = agenda({ ...SEMANA_UTIL, prazoPadraoHoras: "0" });
    expect(resultado.primeiraData).toBe("2026-09-02");
    // São 10h: a manhã já começou, a tarde (13h) ainda não.
    expect(resultado.dias[0]?.periodos.map((p) => p.id)).toEqual(["tarde"]);
  });

  test("a hora é a do fuso da empresa, não a do servidor", () => {
    /*
     * 23h de Brasília do dia 2 são 02:00 UTC do dia 3 — o container roda em
     * UTC, e é aí que o dia vira sozinho. Com um plantão noturno, contar em UTC
     * jogaria a instalação para o dia seguinte: o cliente esperaria 24 horas a
     * mais por causa do fuso do servidor.
     */
    const noturno: ConfigAgendamento = {
      ...SEMANA_UTIL,
      prazoPadraoHoras: "0.5",
      expediente: SEMANA_UTIL.expediente.map(() => ({
        atendeManha: true,
        manhaInicio: "22:00",
        manhaFim: "23:30",
        atendeTarde: false,
        tardeInicio: "13:00",
        tardeFim: "18:00",
      })),
    };
    const noite = new Date("2026-09-03T02:00:00Z");

    expect(calcularAgenda({ config: noturno, cidade: "", agora: noite }).primeiraData).toBe(
      "2026-09-03",
    );
    expect(
      calcularAgenda({ config: noturno, cidade: "", agora: noite, fuso: "UTC" }).primeiraData,
    ).toBe("2026-09-04");
  });

  test("o relógio da empresa é lido no fuso dela", () => {
    const noite = new Date("2026-09-03T02:00:00Z");
    expect(instanteCivil(noite, "America/Sao_Paulo")).toEqual({
      data: "2026-09-02",
      minuto: 23 * 60,
    });
    expect(instanteCivil(noite, "UTC")).toEqual({ data: "2026-09-03", minuto: 120 });
  });

  test("uma semana sem nenhuma hora de atendimento cai no expediente padrão", () => {
    const vazio: ConfigAgendamento = {
      ...SEMANA_UTIL,
      expediente: SEMANA_UTIL.expediente.map((dia) => ({
        ...dia,
        atendeManha: false,
        atendeTarde: false,
      })),
    };
    // Sem a rede de proteção, o calendário abriria sem nenhuma data clicável.
    expect(agenda(vazio).dias.length).toBeGreaterThan(0);
  });

  test("faixa invertida no /admin não vira período oferecido", () => {
    const config: ConfigAgendamento = {
      ...SEMANA_UTIL,
      expediente: SEMANA_UTIL.expediente.map((dia) => ({
        ...dia,
        tardeInicio: "18:00",
        tardeFim: "13:00",
      })),
    };
    const dia = agenda(config).dias[0];
    expect(dia?.periodos.every((p) => p.id === "manha")).toBe(true);
  });

  test("o calendário não passa do horizonte configurado", () => {
    const resultado = agenda({ ...SEMANA_UTIL, horizonteDias: "7" });
    expect((resultado.dias.at(-1)?.data ?? "") <= "2026-09-09").toBe(true);
  });

  test("prazo escrito torto no /admin não derruba a agenda", () => {
    const resultado = agenda({ ...SEMANA_UTIL, prazoPadraoHoras: "abc" });
    expect(resultado.prazoHoras).toBe(48);
    expect(resultado.dias.length).toBeGreaterThan(0);
  });
});

describe("agendaDeReserva", () => {
  test("a rede de proteção do formulário sempre devolve datas", () => {
    const reserva = agendaDeReserva(QUARTA_10H);
    expect(reserva.dias.length).toBeGreaterThan(0);
    expect(reserva.primeiraData).not.toBe("");
  });
});

describe("periodoDoDia", () => {
  test("acha o período escolhido e recusa o que não existe naquele dia", () => {
    const resultado = agenda(SEMANA_UTIL);
    const primeiro = resultado.dias[0];
    expect(periodoDoDia(resultado, primeiro?.data ?? "", "tarde")?.faixa).toBe("13h às 18h");
    expect(periodoDoDia(resultado, primeiro?.data ?? "", "manha")).toBeNull();
    expect(periodoDoDia(null, "2026-09-03", "tarde")).toBeNull();
  });
});
