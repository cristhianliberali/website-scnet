/**
 * A mensagem do "Continuar no WhatsApp".
 *
 * É o formulário inteiro virando texto: se um campo sumir daqui, o atendente
 * pede de novo o que a pessoa já digitou — e é justamente isso que o botão
 * existe para evitar. Por isso os testes olham campo a campo.
 */

import { describe, expect, test } from "bun:test";

import { mensagemContratacao, type ResumoContratacao } from "./mensagem-contratacao";

const COMPLETO: ResumoContratacao = {
  lead: { nome: "Maria Silva", telefone: "(49) 99999-9999" },
  plano: { nome: "Fibra 500 Mega", preco: "99,90", posDesconto: "após R$ 139,90" },
  endereco: {
    tipo: "apartamento",
    cep: "89800-000",
    cidade: "Chapecó",
    bairro: "Centro",
    logradouro: "Rua Getúlio Vargas",
    numero: "1234",
    complemento: "Bloco B, apto 302",
    condominio: "Residencial Bela Vista",
  },
  cadastro: {
    nome: "Maria Aparecida Silva",
    cpf: "000.000.000-00",
    nascimento: "1990-04-25",
    email: "maria@email.com",
    telefone2: "(49) 3333-3333",
  },
  agendamento: { data: "2026-09-10", periodo: "manha", observacao: "Chego em casa às 10h" },
  anexos: ["o comprovante de residência", "o documento com foto"],
};

/** O mesmo resumo com um pedaço zerado — quem parou no meio do formulário. */
const vazio = (partes: Partial<ResumoContratacao>): ResumoContratacao => ({
  ...COMPLETO,
  ...partes,
});

describe("mensagemContratacao", () => {
  test("leva todo campo preenchido do formulário para a conversa", () => {
    const texto = mensagemContratacao(COMPLETO);
    for (const valor of [
      "Fibra 500 Mega",
      "R$ 99,90/mês",
      "após R$ 139,90",
      "Apartamento",
      "89800-000",
      "Rua Getúlio Vargas",
      "1234",
      "Bloco B, apto 302",
      "Residencial Bela Vista",
      "Centro",
      "Chapecó",
      "Maria Aparecida Silva",
      "000.000.000-00",
      "maria@email.com",
      "(49) 99999-9999",
      "(49) 3333-3333",
      "Chego em casa às 10h",
    ]) {
      expect(texto).toContain(valor);
    }
  });

  test("abre com o nome de quem está mandando", () => {
    expect(mensagemContratacao(COMPLETO).startsWith("Olá! Sou Maria Aparecida Silva")).toBe(true);
  });

  test("as datas vão no formato que se lê no Brasil", () => {
    const texto = mensagemContratacao(COMPLETO);
    expect(texto).toContain("Nascimento: 25/04/1990");
    expect(texto).toContain("Data: 10/09/2026");
  });

  test("o período vira a faixa de horário que a pessoa escolheu na tela", () => {
    expect(mensagemContratacao(COMPLETO)).toContain("Período: Manhã (08h às 12h)");
    expect(
      mensagemContratacao(vazio({ agendamento: { data: "", periodo: "tarde", observacao: "" } })),
    ).toContain("Período: Tarde (13h às 18h)");
  });

  test("o anexo é citado, mas o arquivo não vai — link do WhatsApp só leva texto", () => {
    expect(mensagemContratacao(COMPLETO)).toContain(
      "Já tenho o comprovante de residência e o documento com foto em mãos para enviar por aqui.",
    );
  });

  test("sem anexo escolhido, nenhuma promessa de enviar documento", () => {
    expect(mensagemContratacao(vazio({ anexos: [] }))).not.toContain("em mãos");
  });

  test("campo em branco não vira linha vazia na mensagem", () => {
    const texto = mensagemContratacao(
      vazio({
        endereco: { ...COMPLETO.endereco, complemento: "", condominio: "   " },
      }),
    );
    expect(texto).not.toContain("Complemento:");
    expect(texto).not.toContain("Condomínio:");
    expect(texto).toContain("Logradouro: Rua Getúlio Vargas");
  });

  test("quem parou antes de escolher o plano ainda manda o que preencheu", () => {
    const texto = mensagemContratacao(vazio({ plano: null }));
    expect(texto).not.toContain("Plano escolhido");
    expect(texto).toContain("Endereço da instalação");
  });

  test("seção inteira em branco não vira título solto", () => {
    const texto = mensagemContratacao(
      vazio({ agendamento: { data: "", periodo: "", observacao: "" } }),
    );
    expect(texto).not.toContain("PRÉ-AGENDAMENTO (Essa data será confirmada após assinatura do contrato)");
  });

  test("sem nome nenhum, a abertura ainda faz sentido", () => {
    const texto = mensagemContratacao(
      vazio({
        lead: { nome: "", telefone: "" },
        cadastro: { ...COMPLETO.cadastro, nome: "" },
      }),
    );
    expect(texto.startsWith("Olá! Preenchi o formulário de contratação no site.")).toBe(true);
  });
});
