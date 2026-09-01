/**
 * O que estes testes protegem: que o domínio do `Sitemap:` nunca volte a ser
 * um texto fixo. O robots.txt é lido por robô, não por gente — um domínio
 * errado aqui não aparece em tela nenhuma, e só se descobre no buscador.
 */

import { describe, expect, test } from "bun:test";

import { origemDaRequisicao, respostaRobots, robotsTxt } from "./robots.server";

const pedido = (url: string, init?: RequestInit) => new Request(url, init);

describe("robotsTxt", () => {
  test("o Sitemap sai do domínio recebido", () => {
    expect(robotsTxt("https://exemplo.com.br")).toContain(
      "Sitemap: https://exemplo.com.br/sitemap.xml",
    );
  });

  test("barra no fim do domínio não vira barra dobrada", () => {
    expect(robotsTxt("https://exemplo.com.br/")).toContain(
      "Sitemap: https://exemplo.com.br/sitemap.xml",
    );
  });

  test("as regras continuam liberando o site inteiro", () => {
    const texto = robotsTxt("https://exemplo.com.br");
    expect(texto).toContain("User-agent: *\nAllow: /");
    expect(texto).toContain("User-agent: Googlebot");
    expect(texto).not.toContain("Disallow");
  });
});

describe("origemDaRequisicao", () => {
  test("sem proxy, é o endereço da própria requisição", () => {
    expect(origemDaRequisicao(pedido("http://localhost:3000/robots.txt"))).toBe(
      "http://localhost:3000",
    );
  });

  test("atrás do proxy, vale o que o navegador pediu", () => {
    const request = pedido("http://10.0.0.4:3000/robots.txt", {
      headers: { "x-forwarded-proto": "https", "x-forwarded-host": "preview.exemplo.com.br" },
    });
    expect(origemDaRequisicao(request)).toBe("https://preview.exemplo.com.br");
  });

  test("cadeia de proxies: o primeiro da lista é o de fora", () => {
    const request = pedido("http://10.0.0.4:3000/robots.txt", {
      headers: { "x-forwarded-proto": "https, http", "x-forwarded-host": "a.com.br, b.interno" },
    });
    expect(origemDaRequisicao(request)).toBe("https://a.com.br");
  });
});

describe("respostaRobots", () => {
  test("com VITE_SITE_URL, o sitemap é o do domínio canônico", async () => {
    const resposta = respostaRobots(
      pedido("https://preview.exemplo.com.br/robots.txt"),
      "https://exemplo.com.br",
    );
    expect(resposta?.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await resposta!.text()).toContain("Sitemap: https://exemplo.com.br/sitemap.xml");
  });

  test("sem a variável, o sitemap anunciado é o do próprio host", async () => {
    const resposta = respostaRobots(pedido("https://preview.exemplo.com.br/robots.txt"), "");
    expect(await resposta!.text()).toContain("Sitemap: https://preview.exemplo.com.br/sitemap.xml");
  });

  test("HEAD responde sem corpo", async () => {
    const resposta = respostaRobots(
      pedido("https://exemplo.com.br/robots.txt", { method: "HEAD" }),
    );
    expect(resposta?.status).toBe(200);
    expect(await resposta!.text()).toBe("");
  });

  test("outra rota (ou outro método) segue para o app", () => {
    expect(respostaRobots(pedido("https://exemplo.com.br/"))).toBeUndefined();
    expect(respostaRobots(pedido("https://exemplo.com.br/planos"))).toBeUndefined();
    expect(
      respostaRobots(pedido("https://exemplo.com.br/robots.txt", { method: "POST" })),
    ).toBeUndefined();
  });
});
