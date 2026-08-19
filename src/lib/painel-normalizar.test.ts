import { expect, test } from "bun:test";
import { mesclarPainel, normalizarPainel, respostaTrazPainel } from "./painel-normalizar";

test("aceita snake_case, camelCase e os apelidos em inglês", () => {
  const painel = normalizarPainel({
    cliente: { id: 42, nome: "Ana Souza", cpf_cnpj: "000.000.000-00" },
    contracts: [{ id: "c1", contractNumber: "CTR-1", planName: "600 Mega", monthlyValue: 129.9 }],
  });

  expect(painel.cliente.id).toBe("42");
  expect(painel.cliente.documento).toBe("000.000.000-00");
  expect(painel.contratos[0]?.numero).toBe("CTR-1");
  expect(painel.contratos[0]?.plano).toBe("600 Mega");
  expect(painel.contratos[0]?.valorMensal).toBe(129.9);
});

test("lê valores em pt-BR, em texto e com símbolo de moeda", () => {
  const painel = normalizarPainel({
    faturas: [
      { id: "f1", valor: "1.234,56" },
      { id: "f2", valor: "R$ 89,90" },
      { id: "f3", valor: "219.90" },
      { id: "f4", valor: 15 },
    ],
  });

  expect(painel.faturas.map((f) => f.valor)).toEqual([1234.56, 89.9, 219.9, 15]);
});

test("encaixa status desconhecido no padrão em vez de quebrar", () => {
  const painel = normalizarPainel({
    faturas: [
      { id: "f1", status: "LIQUIDADO" },
      { id: "f2", status: "coisa nenhuma" },
    ],
    contratos: [{ id: "c1", status_financeiro: "Em Dia", status_conexao: "SUSPENSO" }],
  });

  expect(painel.faturas[0]?.status).toBe("pago");
  expect(painel.faturas[1]?.status).toBe("aberto");
  expect(painel.contratos[0]?.statusFinanceiro).toBe("em_dia");
  expect(painel.contratos[0]?.statusConexao).toBe("offline");
});

test("aceita a lista dentro de um envelope por seção", () => {
  const painel = normalizarPainel({ faturas: { itens: [{ id: "f1", valor: 10 }] } });
  expect(painel.faturas).toHaveLength(1);
  expect(painel.faturas[0]?.id).toBe("f1");
});

test("resposta sem nenhuma parte do painel não dispara recarga", () => {
  expect(respostaTrazPainel({ protocolo: "2026-1" })).toBe(false);
  expect(respostaTrazPainel({ faturas: [] })).toBe(true);
  expect(respostaTrazPainel({ painel: { chamados: [] } })).toBe(true);
});

test("mesclar troca só o que veio na resposta", () => {
  const atual = normalizarPainel({
    cliente: { nome: "Ana" },
    faturas: [{ id: "f1", status: "aberto" }],
    chamados: [{ id: "t1", assunto: "antigo" }],
  });

  const depois = mesclarPainel(atual, { chamados: [{ id: "t2", assunto: "novo" }] });

  expect(depois.chamados.map((c) => c.id)).toEqual(["t2"]);
  // não veio na resposta, então continua como estava
  expect(depois.faturas).toEqual(atual.faturas);
  expect(depois.cliente.nome).toBe("Ana");
});

test("mesclar aceita as listas dentro de `painel`", () => {
  const atual = normalizarPainel({ faturas: [{ id: "f1" }] });
  const depois = mesclarPainel(atual, { painel: { faturas: [{ id: "f2" }, { id: "f3" }] } });
  expect(depois.faturas.map((f) => f.id)).toEqual(["f2", "f3"]);
});

test("uma lista vazia na resposta apaga a lista — não é ausência de dado", () => {
  const atual = normalizarPainel({ faturas: [{ id: "f1" }] });
  const depois = mesclarPainel(atual, { faturas: [] });
  expect(depois.faturas).toEqual([]);
});
