/**
 * A forma de pagamento é dado de contrato: um dígito a menos na conta é um
 * débito devolvido no primeiro mês. Por isso a máscara e a validação são
 * testadas aqui, e não conferidas na tela.
 */

import { describe, expect, test } from "bun:test";

import {
  errosPagamento,
  maskAgencia,
  maskConta,
  pagamentoWebhook,
  PAGAMENTO_VAZIO,
  type DadosPagamento,
} from "./pagamento";

const debito: DadosPagamento = {
  metodo: "debito_conta",
  banco: "sicredi",
  agencia: "0710",
  conta: "12345-6",
};

describe("máscaras da conta", () => {
  test("deixa passar dígitos e um hífen só", () => {
    expect(maskAgencia("07 10")).toBe("0710");
    expect(maskConta("12345-6")).toBe("12345-6");
    expect(maskConta("1-2-3")).toBe("1-23");
  });

  test("o X do dígito verificador do Banco do Brasil sobrevive na conta", () => {
    expect(maskConta("12345x")).toBe("12345X");
    // Na agência não existe: deixá-lo passar seria aceitar uma agência inválida.
    expect(maskAgencia("1234x")).toBe("1234");
  });

  test("hífen na frente não é conta de ninguém", () => {
    expect(maskConta("-123")).toBe("123");
  });

  test("letra colada não entra", () => {
    expect(maskAgencia("ag 1234")).toBe("1234");
  });
});

describe("errosPagamento", () => {
  test("sem método escolhido, o formulário não passa", () => {
    expect(errosPagamento(PAGAMENTO_VAZIO)["pagamento_metodo"]).toBeDefined();
  });

  test("Pix ou boleto não pede conta bancária", () => {
    expect(errosPagamento({ ...PAGAMENTO_VAZIO, metodo: "pix_boleto" })).toEqual({});
  });

  test("débito em conta exige banco, agência e conta", () => {
    const erros = errosPagamento({ ...PAGAMENTO_VAZIO, metodo: "debito_conta" });
    expect(Object.keys(erros).sort()).toEqual([
      "pagamento_agencia",
      "pagamento_banco",
      "pagamento_conta",
    ]);
  });

  test("conta com poucos dígitos é recusada — é o erro que devolve o débito", () => {
    expect(errosPagamento({ ...debito, conta: "12" })["pagamento_conta"]).toBeDefined();
    expect(errosPagamento({ ...debito, agencia: "1" })["pagamento_agencia"]).toBeDefined();
  });

  test("débito completo passa", () => {
    expect(errosPagamento(debito)).toEqual({});
  });
});

describe("pagamentoWebhook", () => {
  test("o débito leva código e nome do banco", () => {
    expect(pagamentoWebhook(debito)).toEqual({
      metodo: "debito_conta",
      metodo_nome: "Débito em conta",
      banco: "sicredi",
      banco_nome: "Sicredi",
      agencia: "0710",
      conta: "12345-6",
    });
  });

  test("quem escolhe boleto manda os campos de conta nulos, e não ausentes", () => {
    expect(pagamentoWebhook({ ...debito, metodo: "pix_boleto" })).toEqual({
      metodo: "pix_boleto",
      metodo_nome: "Pix ou Boleto",
      banco: null,
      banco_nome: null,
      agencia: null,
      conta: null,
    });
  });
});
