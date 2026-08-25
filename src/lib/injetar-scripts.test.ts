/**
 * O injetor trabalha sobre o HTML enquanto ele sai, pedaço a pedaço.
 *
 * O risco todo está aí: um marcador (`</head>`, `<body>`, `</body>`) pode cair
 * bem na emenda entre dois pedaços da resposta. Se isso não for tratado, a tag
 * simplesmente não entra — e o pior é que passa despercebido, porque em
 * desenvolvimento a página costuma sair num pedaço só e tudo parece funcionar.
 * O teste em pedaços de um caractere é a versão extrema desse caso.
 */

import { describe, expect, test } from "bun:test";

import { injetarScripts, paginaRecebeTags } from "./injetar-scripts.server";
import type { BlocosDeScripts } from "./scripts-db.server";

const PAGINA =
  '<!DOCTYPE html><html lang="pt-BR"><head><title>SCNET</title></head>' +
  '<body class="x"><div id="app">oi</div><script src="/app.js"></script></body></html>';

const BLOCOS: BlocosDeScripts = {
  head: "<!--NO-HEAD-->",
  bodyInicio: "<!--INICIO-DO-BODY-->",
  bodyFim: "<!--FIM-DO-BODY-->",
};

/** Uma resposta HTML cujo corpo chega em pedaços do tamanho pedido. */
function respostaEmPedacos(html: string, tamanho: number): Response {
  const bytes = new TextEncoder().encode(html);
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(i, i + tamanho));
      i += tamanho;
    },
  });
  return new Response(stream, { headers: { "content-type": "text/html; charset=utf-8" } });
}

const injetar = async (html: string, tamanho: number, blocos = BLOCOS) =>
  injetarScripts(respostaEmPedacos(html, tamanho), blocos).text();

describe("posição de cada bloco", () => {
  test("cada um entra no seu lugar", async () => {
    const saida = await injetar(PAGINA, PAGINA.length);

    expect(saida.indexOf("NO-HEAD")).toBeLessThan(saida.indexOf("</head>"));
    expect(saida.indexOf("INICIO-DO-BODY")).toBeGreaterThan(saida.indexOf('<body class="x">'));
    expect(saida.indexOf("FIM-DO-BODY")).toBeLessThan(saida.lastIndexOf("</body>"));
    // o INÍCIO vem antes de qualquer conteúdo da página
    expect(saida.indexOf("INICIO-DO-BODY")).toBeLessThan(saida.indexOf('<div id="app">'));
  });

  test("o `<body>` é achado mesmo com atributos", async () => {
    const saida = await injetar(PAGINA, PAGINA.length);
    expect(saida).toContain('<body class="x"><!--INICIO-DO-BODY-->');
  });
});

describe("marcador cortado entre pedaços", () => {
  // 3 é o pior caso prático: `</head>` cai partido em três pedaços diferentes.
  for (const tamanho of [1, 3, 7, 64, 1000]) {
    test(`pedaços de ${tamanho} caractere(s) não perdem nenhum bloco`, async () => {
      const saida = await injetar(PAGINA, tamanho);

      expect(saida).toContain("NO-HEAD");
      expect(saida).toContain("INICIO-DO-BODY");
      expect(saida).toContain("FIM-DO-BODY");
      // e a página original sai inteira, sem nada comido pelo buffer
      expect(saida).toContain("<title>SCNET</title>");
      expect(saida).toContain('<div id="app">oi</div>');
      expect(saida.endsWith("</html>")).toBe(true);
    });
  }

  test("cada bloco entra UMA vez só, mesmo saindo em muitos pedaços", async () => {
    const saida = await injetar(PAGINA, 1);
    expect(saida.split("NO-HEAD").length - 1).toBe(1);
    expect(saida.split("INICIO-DO-BODY").length - 1).toBe(1);
    expect(saida.split("FIM-DO-BODY").length - 1).toBe(1);
  });
});

describe("quando não deve mexer", () => {
  test("sem blocos, a resposta passa intacta", async () => {
    const original = respostaEmPedacos(PAGINA, 16);
    const saida = injetarScripts(original, { head: "", bodyInicio: "", bodyFim: "" });
    expect(saida).toBe(original);
    expect(await saida.text()).toBe(PAGINA);
  });

  test("resposta que não é HTML passa intacta", async () => {
    const json = new Response('{"ok":true}', { headers: { "content-type": "application/json" } });
    const saida = injetarScripts(json, BLOCOS);
    expect(saida).toBe(json);
  });

  test("content-length antigo é removido — o corpo cresceu", () => {
    const r = new Response("x", {
      headers: { "content-type": "text/html", "content-length": "1" },
    });
    expect(injetarScripts(r, BLOCOS).headers.get("content-length")).toBeNull();
  });
});

describe("páginas que nunca recebem tag", () => {
  test("o /admin fica de fora — é onde a tag quebrada seria consertada", () => {
    expect(paginaRecebeTags("/admin")).toBe(false);
    expect(paginaRecebeTags("/admin/qualquer")).toBe(false);
    expect(paginaRecebeTags("/diagnostico")).toBe(false);
  });

  test("o resto do site recebe", () => {
    expect(paginaRecebeTags("/")).toBe(true);
    expect(paginaRecebeTags("/contratacao")).toBe(true);
    expect(paginaRecebeTags("/cliente/painel")).toBe(true);
    // um caminho que só COMEÇA parecido não pode ser confundido com o /admin
    expect(paginaRecebeTags("/administradora")).toBe(true);
  });
});
