import { expect, test } from "bun:test";
import {
  cep,
  data,
  documento,
  enderecoEmLinha,
  faturaEmAberto,
  moeda,
  situacaoFinanceira,
  telefone,
} from "./painel-formato";
import type { Fatura } from "./painel-tipos";

const fatura = (status: Fatura["status"]): Fatura => ({
  id: "f",
  idContrato: "c",
  referencia: "",
  vencimento: "",
  valor: 10,
  status,
  linhaDigitavel: "",
  pixCopiaECola: "",
  urlBoleto: "",
  pagoEm: "",
  valorOriginal: 10,
  descricao: "",
});

test("a fatura cancelada não conta como pendente", () => {
  expect(faturaEmAberto(fatura("aberto"))).toBe(true);
  expect(faturaEmAberto(fatura("vencido"))).toBe(true);
  expect(faturaEmAberto(fatura("pago"))).toBe(false);
  // não foi paga, mas também não é devida
  expect(faturaEmAberto(fatura("cancelado"))).toBe(false);
});

test("a situação financeira é a da pior fatura", () => {
  expect(situacaoFinanceira([fatura("pago")])).toBe("em_dia");
  expect(situacaoFinanceira([fatura("pago"), fatura("aberto")])).toBe("em_aberto");
  expect(situacaoFinanceira([fatura("aberto"), fatura("vencido")])).toBe("vencido");
});

test("documento e telefone só são formatados quando dá", () => {
  expect(documento("11144477735")).toBe("111.444.777-35");
  expect(documento("11222333000181")).toBe("11.222.333/0001-81");
  // já formatado, ou incompleto: passa como veio
  expect(documento("111.444.777-35")).toBe("111.444.777-35");
  expect(documento("123")).toBe("123");

  expect(telefone("49999123456")).toBe("(49) 99912-3456");
  expect(telefone("5549999123456")).toBe("(49) 99912-3456");
  expect(telefone("4933211234")).toBe("(49) 3321-1234");
  expect(telefone("")).toBe("");
});

test("CEP e data", () => {
  expect(cep("89801100")).toBe("89801-100");
  expect(cep("89801-100")).toBe("89801-100");
  expect(data("2026-08-10")).toBe("10/08/2026");
  // texto já escrito não é remexido
  expect(data("Agosto/2026")).toBe("Agosto/2026");
  expect(data("")).toBe("—");
});

test("moeda em pt-BR", () => {
  // o Intl separa com espaço não-quebrável; normalizamos para comparar
  const semNbsp = (v: number) => moeda(v).replace(/\u00a0/g, " ");
  expect(semNbsp(1234.5)).toBe("R$ 1.234,50");
  expect(semNbsp(Number.NaN)).toBe("R$ 0,00");
});

test("o endereço em linha pula o que o cadastro não tem", () => {
  expect(
    enderecoEmLinha({
      cep: "89801100",
      logradouro: "Av. Getúlio Vargas",
      numero: "1842",
      complemento: "",
      bairro: "Centro",
      cidade: "Chapecó",
      uf: "SC",
    }),
  ).toBe("Av. Getúlio Vargas, 1842 • Centro • Chapecó/SC • CEP 89801-100");
});
