/**
 * O teto de caracteres dos campos, do lado do servidor.
 *
 * O formulário já corta na digitação, mas a server function é um endpoint HTTP
 * comum: quem falar com ela por fora manda o tamanho que quiser. O caso que
 * motivou isto foi um texto enorme colado no complemento do endereço — passava
 * inteiro para o n8n, porque o único teto era o dos 64KB do `dados` completo.
 */

import { describe, expect, test } from "bun:test";

import { LIMITES, LIMITE_GENERICO, limitar, limitarCampos } from "./form-limits";

describe("limitar", () => {
  test("texto dentro do teto passa intacto", () => {
    expect(limitar("Bloco B, apto 302", LIMITES.complemento)).toBe("Bloco B, apto 302");
  });

  test("texto acima do teto sai cortado no tamanho exato", () => {
    const corte = limitar("x".repeat(5_000), LIMITES.complemento);
    expect(corte).toHaveLength(LIMITES.complemento);
  });
});

describe("limitarCampos", () => {
  test("cada campo é cortado pelo teto da própria chave", () => {
    const dados = limitarCampos({
      endereco: {
        complemento: "c".repeat(1_000),
        logradouro: "l".repeat(1_000),
      },
    }) as { endereco: { complemento: string; logradouro: string } };

    expect(dados.endereco.complemento).toHaveLength(LIMITES.complemento);
    expect(dados.endereco.logradouro).toHaveLength(LIMITES.logradouro);
  });

  test("o preenchimento normal de uma contratação atravessa sem tocar em nada", () => {
    const dados = {
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
      cadastro: { nome: "Maria Aparecida Silva", email: "maria@email.com", telefone2: null },
    };
    expect(limitarCampos(dados)).toEqual(dados);
  });

  test("chave desconhecida cai no teto genérico em vez de passar livre", () => {
    const dados = limitarCampos({ inventado: "z".repeat(LIMITE_GENERICO + 500) }) as {
      inventado: string;
    };
    expect(dados.inventado).toHaveLength(LIMITE_GENERICO);
  });

  test("corta também dentro de listas, sem desmontar a estrutura", () => {
    const dados = limitarCampos({ itens: [{ complemento: "c".repeat(300) }] }) as {
      itens: Array<{ complemento: string }>;
    };
    expect(dados.itens[0]?.complemento).toHaveLength(LIMITES.complemento);
  });

  test("número, nulo e booleano continuam do jeito que chegaram", () => {
    expect(limitarCampos({ preco: 139.9, telefone2: null, final: true })).toEqual({
      preco: 139.9,
      telefone2: null,
      final: true,
    });
  });
});
