/**
 * O que decide o que aparece na lista do /admin.
 *
 * `resumoDoEnvio` é a única regra do registro que não é SQL: ela escolhe, entre
 * os vários nomes e telefones que um formulário carrega, qual vira coluna. Errar
 * aqui não quebra nada — só faz o envio aparecer como "sem nome" numa lista que
 * existe justamente para alguém ligar de volta.
 */

import { describe, expect, test } from "bun:test";

import { MAX_DADOS_BYTES, corte, dadosDentroDoTeto, resumoDoEnvio } from "./envios-tipos";
import { statusDoWebhook } from "./envios-status";

describe("resumoDoEnvio", () => {
  test("o nome do CADASTRO ganha do nome da home — é o do documento", () => {
    const { nome } = resumoDoEnvio({
      origem: { nome: "Maria" },
      cadastro: { nome: "Maria Aparecida Silva" },
    });
    expect(nome).toBe("Maria Aparecida Silva");
  });

  test("o telefone da ORIGEM ganha — é o WhatsApp com DDI, por onde se liga", () => {
    const { telefone } = resumoDoEnvio({
      origem: { whatsapp: "+5549999998888" },
      cadastro: { telefone: "4933333333" },
    });
    expect(telefone).toBe("+5549999998888");
  });

  test("envio que parou antes de dizer o nome ainda vira linha", () => {
    expect(resumoDoEnvio({})).toEqual({ nome: null, telefone: null, plano: null });
  });

  test("campo em branco não vira string vazia na coluna", () => {
    expect(resumoDoEnvio({ origem: { nome: "   ", whatsapp: "" } }).nome).toBeNull();
  });

  test("o apóstrofo anti-fórmula não entra na coluna do telefone", () => {
    // `neutralizeFormula` marca todo texto que começa com "+": é o caso de
    // TODO WhatsApp. Guardar "'+55…" faria a busca por telefone não achar nada.
    const { telefone } = resumoDoEnvio({ origem: { whatsapp: "'+5549999998888" } });
    expect(telefone).toBe("+5549999998888");
  });

  test("apóstrofo que é do nome de verdade fica", () => {
    expect(resumoDoEnvio({ origem: { nome: "'Tonho da Lua" } }).nome).toBe("'Tonho da Lua");
  });

  test("o plano sai de `planos.nome`", () => {
    expect(resumoDoEnvio({ planos: { nome: "Infinity 700" } }).plano).toBe("Infinity 700");
  });

  test("ignora o que não é objeto, em vez de estourar", () => {
    expect(resumoDoEnvio({ origem: "invadido", cadastro: [1, 2], planos: null })).toEqual({
      nome: null,
      telefone: null,
      plano: null,
    });
  });

  test("nome absurdamente longo é cortado no tamanho da coluna", () => {
    const { nome } = resumoDoEnvio({ origem: { nome: "a".repeat(500) } });
    expect(nome).toHaveLength(150);
  });
});

describe("corte", () => {
  test("tira os espaços das pontas e respeita o teto", () => {
    expect(corte("  Maria  ", 150)).toBe("Maria");
    expect(corte("abcdef", 3)).toBe("abc");
  });

  test("vazio, espaços e ausente viram null — a coluna aceita null, não ''", () => {
    expect(corte("", 10)).toBeNull();
    expect(corte("   ", 10)).toBeNull();
    expect(corte(undefined, 10)).toBeNull();
  });
});

describe("dadosDentroDoTeto", () => {
  test("o formulário normal passa intacto", () => {
    const dados = { origem: { nome: "Maria" } };
    expect(dadosDentroDoTeto(dados)).toBe(dados);
  });

  test("acima do teto vira aviso — a linha (e o telefone) ainda valem", () => {
    const gigante = { lixo: "x".repeat(MAX_DADOS_BYTES + 1) };
    expect(dadosDentroDoTeto(gigante)).toEqual({
      _erro: "Dados acima do tamanho permitido; não foram gravados.",
    });
  });

  test("objeto com ciclo não derruba o envio", () => {
    const ciclo: Record<string, unknown> = {};
    ciclo["ele_mesmo"] = ciclo;
    expect(dadosDentroDoTeto(ciclo)["_erro"]).toBeString();
  });
});

describe("statusDoWebhook", () => {
  test('"sem CRM configurado" não é falha — separa dev de incidente', () => {
    expect(statusDoWebhook({ ok: true, status: null, reason: "not_configured" })).toBe(
      "sem_webhook",
    );
  });

  test("aceito pelo n8n", () => {
    expect(statusDoWebhook({ ok: true, status: "ok" })).toBe("webhook_ok");
  });

  test("recusado é o que precisa aparecer na tela", () => {
    expect(statusDoWebhook({ ok: false, status: "erro", reason: "bad_status" })).toBe(
      "webhook_erro",
    );
  });
});
