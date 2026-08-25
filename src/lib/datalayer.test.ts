/**
 * A camada de eventos é a ponte com o Google Tag Manager, e uma ponte silenciosa:
 * quando um nome muda de um lado, o gatilho do outro simplesmente para de
 * disparar, sem erro nenhum. Estes testes prendem o que o GTM vai ouvir.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { EVENTO, dispararEvento, eventoDaEtapa, eventoDeClique, eventoWhatsapp } from "./datalayer";
import { normalizarAreaCliente } from "./area-cliente-db.server";

const camada = () =>
  (globalThis as { window?: { dataLayer?: Record<string, unknown>[] } }).window?.dataLayer;

beforeEach(() => {
  (globalThis as { window?: unknown }).window = {};
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("nomes que o GTM vai ouvir", () => {
  test("as etapas da contratação são numeradas a partir de 1", () => {
    // O índice interno é base 0; o nome do evento é base 1, que é como uma
    // pessoa lê "etapa 1". Trocar isso desalinharia o funil inteiro em uma casa.
    expect(eventoDaEtapa(0)).toBe("contratacao_1");
    expect(eventoDaEtapa(3)).toBe("contratacao_4");
  });

  test("os nomes dos eventos de lead não mudaram", () => {
    // Estes três estão escritos na configuração do GTM do cliente. Mudar
    // qualquer um aqui quebra a medição lá, em silêncio.
    expect(EVENTO.leadHome).toBe("lead_form");
    expect(EVENTO.leadNovoCliente).toBe("lead_form_novo_cliente");
    expect(EVENTO.leadClienteBase).toBe("lead_form_cliente_base");
  });
});

describe("o empurrão no dataLayer", () => {
  test("cria o array quando ele ainda não existe", () => {
    dispararEvento("teste");
    expect(camada()).toEqual([{ event: "teste" }]);
  });

  test("preserva o que já estava lá — inclusive o que o GTM colocou", () => {
    (globalThis as { window: { dataLayer?: unknown[] } }).window.dataLayer = [{ gtm: "start" }];
    dispararEvento("depois");
    expect(camada()).toHaveLength(2);
    expect(camada()?.[0]).toEqual({ gtm: "start" });
  });

  test("os parâmetros viajam junto do nome", () => {
    dispararEvento(EVENTO.leadNovoCliente, { plano: "Infinity", preco: "139,90" });
    expect(camada()?.[0]).toEqual({
      event: "lead_form_novo_cliente",
      plano: "Infinity",
      preco: "139,90",
    });
  });

  test("clique leva o identificador do botão", () => {
    eventoDeClique("escolher_plano", { texto: "Quero este plano", plano: "710" });
    expect(camada()?.[0]).toMatchObject({
      event: "clique_botao",
      botao: "escolher_plano",
      plano: "710",
    });
  });

  test("WhatsApp é evento próprio, porque costuma ser conversão", () => {
    eventoWhatsapp("botao_flutuante");
    expect(camada()?.[0]).toEqual({ event: "clique_whatsapp", origem: "botao_flutuante" });
  });

  test("nunca lança: medição quebrada não pode derrubar um formulário", () => {
    // Um dataLayer selado (acontece com extensão de privacidade) faria o push
    // estourar — e o envio do cliente morreria junto.
    (globalThis as { window: { dataLayer?: unknown } }).window.dataLayer = Object.freeze([]);
    expect(() => dispararEvento("nao_pode_estourar")).not.toThrow();
  });

  test("no servidor não faz nada — o dataLayer é do navegador", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => dispararEvento("no_ssr")).not.toThrow();
  });
});

describe("liga/desliga da área do cliente", () => {
  test("só um `false` explícito fecha a área", () => {
    // Ler a configuração e encontrar lixo não pode fechar a área do cliente por
    // conta própria: o pior caso tem que ser o comportamento de sempre.
    expect(normalizarAreaCliente(null).ativa).toBe(true);
    expect(normalizarAreaCliente({}).ativa).toBe(true);
    expect(normalizarAreaCliente({ ativa: "nao" }).ativa).toBe(true);
    expect(normalizarAreaCliente({ ativa: false }).ativa).toBe(false);
  });

  test("mensagem vazia cai no texto padrão, e não em espaço em branco", () => {
    expect(normalizarAreaCliente({ ativa: false, mensagem: "   " }).mensagem).toContain("central");
    expect(normalizarAreaCliente({ ativa: false, mensagem: " Volta às 14h " }).mensagem).toBe(
      "Volta às 14h",
    );
  });
});
