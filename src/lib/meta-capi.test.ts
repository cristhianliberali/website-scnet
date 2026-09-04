/**
 * O que estes testes prendem: o formato que o Meta exige em cada campo de
 * `user_data`. Um telefone com máscara, um nome com acento ou um CEP com hífen
 * chegam ao Meta como um hash que não bate com nada — o evento entra, a
 * correspondência fica em zero e ninguém vê o erro em tela nenhuma.
 */

import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  fbcDoFbclid,
  montarEvento,
  montarUserData,
  normalizarCep,
  normalizarCidade,
  normalizarNascimento,
  normalizarNome,
  normalizarTelefone,
  normalizarUf,
  urlDoEvento,
} from "./meta-capi.server";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");

describe("normalização", () => {
  test("telefone vira dígitos com o DDI do Brasil", () => {
    expect(normalizarTelefone("(49) 99999-9999")).toBe("5549999999999");
    expect(normalizarTelefone("(49) 3664-5600")).toBe("554936645600");
    expect(normalizarTelefone("+55 49 99999-9999")).toBe("5549999999999");
    // Já com DDI, fica como está.
    expect(normalizarTelefone("+5549999999999")).toBe("5549999999999");
    expect(normalizarTelefone("")).toBeUndefined();
    expect(normalizarTelefone("123")).toBeUndefined();
  });

  test("nome: primeiro nome e último sobrenome, sem acento nem maiúscula", () => {
    expect(normalizarNome("Maria José da Silva Gonçalves")).toEqual({
      fn: "maria",
      ln: "goncalves",
    });
    expect(normalizarNome("João")).toEqual({ fn: "joao", ln: undefined });
    expect(normalizarNome("  ")).toEqual({ fn: undefined, ln: undefined });
  });

  test("cidade, UF, CEP e nascimento no formato do Meta", () => {
    expect(normalizarCidade("São Miguel do Oeste")).toBe("saomigueldooeste");
    expect(normalizarUf("SC")).toBe("sc");
    expect(normalizarUf("Santa Catarina")).toBeUndefined();
    expect(normalizarCep("89800-000")).toBe("89800000");
    expect(normalizarCep("898")).toBeUndefined();
    expect(normalizarNascimento("1990-05-20")).toBe("19900520");
    expect(normalizarNascimento("20/05/1990")).toBeUndefined();
  });

  test("fbc reconstruído do fbclid segue o formato documentado", () => {
    expect(fbcDoFbclid("ABC123", "2026-01-02T03:04:05.000Z")).toBe(
      `fb.1.${Date.parse("2026-01-02T03:04:05.000Z")}.ABC123`,
    );
    expect(fbcDoFbclid("", null)).toBeUndefined();
    // Sem data válida, vale agora — e continua sendo um fbc bem formado.
    expect(fbcDoFbclid("XYZ", "nada")).toMatch(/^fb\.1\.\d{13}\.XYZ$/);
  });

  test("a URL do evento fica absoluta a partir do caminho que o formulário manda", () => {
    expect(urlDoEvento("/leads?utm_source=meta", "https://exemplo.com.br")).toBe(
      "https://exemplo.com.br/leads?utm_source=meta",
    );
    expect(urlDoEvento("https://outro.com/x", "https://exemplo.com.br")).toBe(
      "https://outro.com/x",
    );
  });
});

describe("user_data", () => {
  test("tudo que é dado pessoal sai em SHA-256; cookies, IP e user agent em claro", () => {
    const dados = montarUserData({
      nome: "Maria Silva",
      telefone: "(49) 99999-9999",
      email: " Maria@Email.com ",
      nascimento: "1990-05-20",
      cidade: "Chapecó",
      uf: "SC",
      cep: "89800-000",
      externalId: "123.456.789-09",
      fbc: "fb.1.1.abc",
      fbp: "fb.1.2.def",
      ip: "200.1.2.3",
      userAgent: "Mozilla/5.0",
    });

    expect(dados).toEqual({
      em: [sha("maria@email.com")],
      ph: [sha("5549999999999")],
      fn: [sha("maria")],
      ln: [sha("silva")],
      db: [sha("19900520")],
      ct: [sha("chapeco")],
      st: [sha("sc")],
      zp: [sha("89800000")],
      country: [sha("br")],
      external_id: [sha("12345678909")],
      fbc: "fb.1.1.abc",
      fbp: "fb.1.2.def",
      client_ip_address: "200.1.2.3",
      client_user_agent: "Mozilla/5.0",
    });
  });

  test("o que não veio não vai — nem como null, nem como hash de vazio", () => {
    const dados = montarUserData({ telefone: "(49) 99999-9999", ip: "unknown" });
    expect(Object.keys(dados)).toEqual(["ph"]);
  });

  test("sem o cookie _fbc, o fbclid da atribuição vira o fbc", () => {
    const dados = montarUserData({ fbclid: "IwAR0abc", fbclidEm: "2026-03-01T00:00:00.000Z" });
    expect(dados["fbc"]).toBe(`fb.1.${Date.parse("2026-03-01T00:00:00.000Z")}.IwAR0abc`);
  });
});

describe("evento", () => {
  test("leva event_id para deduplicar com o Pixel e custom_data sem vazios", () => {
    const evento = montarEvento({
      nome: "Purchase",
      eventId: "evt-1",
      pagina: "/contratacao",
      origem: "https://exemplo.com.br",
      tempo: 1_700_000_000,
      usuario: { telefone: "49999999999" },
      dados: {
        value: 139.9,
        currency: "BRL",
        content_name: "Infinity",
        vazio: undefined,
        nulo: null,
      },
    });

    expect(evento).toEqual({
      event_name: "Purchase",
      event_time: 1_700_000_000,
      action_source: "website",
      event_source_url: "https://exemplo.com.br/contratacao",
      event_id: "evt-1",
      user_data: { ph: [sha("5549999999999")] },
      custom_data: { value: 139.9, currency: "BRL", content_name: "Infinity" },
    });
  });

  test("sem event_id e sem dados extras, os campos simplesmente não existem", () => {
    const evento = montarEvento({
      nome: "Lead",
      pagina: "/",
      origem: "https://exemplo.com.br",
      usuario: {},
    });
    expect(evento).not.toHaveProperty("event_id");
    expect(evento).not.toHaveProperty("custom_data");
  });
});
