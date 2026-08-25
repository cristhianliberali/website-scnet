/**
 * Onde as tags do /admin entram na página.
 *
 * ## Por que aqui, e não num componente React
 *
 * O caminho óbvio seria um componente com `dangerouslySetInnerHTML` no
 * `__root.tsx`. Três motivos para não ser assim:
 *
 * 1. **O código colado é HTML cru, não JSX.** Um Tag Manager tem `<script>`,
 *    `<noscript>` e um `<iframe>` dentro. React não coloca HTML arbitrário
 *    dentro do `<head>` sem um elemento recipiente, e recipiente dentro de
 *    `<head>` não existe.
 * 2. **Um trecho quebrado não pode derrubar a página.** Aqui a injeção acontece
 *    DEPOIS de o React terminar: um `<script>` mal fechado estraga a si mesmo, e
 *    não a hidratação do site inteiro.
 * 3. **Custo por requisição.** É concatenação de texto sobre um bloco que já
 *    está pronto na memória (ver `scripts-db.server.ts`) — nada é remontado, e
 *    a resposta continua saindo em streaming, sem esperar a página inteira ficar
 *    pronta para começar a enviar.
 *
 * ## O que nunca recebe tag
 *
 * `/admin` e `/diagnostico`. É deliberado e importante: um trecho com erro que
 * fosse injetado no /admin poderia quebrar exatamente a tela onde ele seria
 * corrigido — e aí a única saída seria mexer no banco à mão. Rastreamento
 * também não tem o que fazer numa tela de administração.
 */

import {
  BLOCOS_VAZIOS,
  blocosDeScripts,
  temBlocos,
  type BlocosDeScripts,
} from "./scripts-db.server";

/** Prefixos de caminho que nunca recebem as tags. */
const SEM_TAGS = ["/admin", "/diagnostico"];

/** Quanto texto segurar entre pedaços, para não perder um marcador cortado ao meio. */
const GUARDA = 1024;

export function paginaRecebeTags(pathname: string): boolean {
  return !SEM_TAGS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Os blocos que esta requisição deve receber — vazios quando ela não recebe.
 *
 * Fica separado da injeção porque quem chama (`server.ts`) precisa decidir pelo
 * caminho ANTES de a resposta existir.
 */
export async function blocosParaRequisicao(request: Request): Promise<BlocosDeScripts> {
  try {
    const { pathname } = new URL(request.url);
    if (!paginaRecebeTags(pathname)) return BLOCOS_VAZIOS;
    return await blocosDeScripts();
  } catch (err) {
    // Nada aqui vale uma página a menos no ar.
    console.error("Falha ao preparar as tags do /admin; a página segue sem elas.", err);
    return BLOCOS_VAZIOS;
  }
}

/**
 * Insere os blocos no HTML que está saindo.
 *
 * Trabalha sobre o fluxo, pedaço a pedaço, sem juntar a página inteira na
 * memória: um marcador (`</head>`, `<body>`, `</body>`) pode cair bem na
 * emenda entre dois pedaços, e é por isso que a última fatia de cada pedaço
 * fica retida até o pedaço seguinte chegar.
 */
export function injetarScripts(response: Response, blocos: BlocosDeScripts): Response {
  if (!temBlocos(blocos)) return response;
  if (!response.body) return response;
  if (!(response.headers.get("content-type") ?? "").includes("text/html")) return response;

  const corpo = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(transformador(blocos))
    .pipeThrough(new TextEncoderStream());

  // O corpo ficou maior: um content-length antigo faria o navegador cortar a
  // página no tamanho anterior.
  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(corpo, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function transformador(blocos: BlocosDeScripts): TransformStream<string, string> {
  const feito = { head: false, inicio: false, fim: false };

  const falta = () =>
    (blocos.head !== "" && !feito.head) ||
    (blocos.bodyInicio !== "" && !feito.inicio) ||
    (blocos.bodyFim !== "" && !feito.fim);

  /** Insere o que for possível neste texto e devolve o resultado. */
  function aplicar(texto: string): string {
    if (blocos.head !== "" && !feito.head) {
      const i = texto.indexOf("</head>");
      if (i >= 0) {
        texto = texto.slice(0, i) + blocos.head + texto.slice(i);
        feito.head = true;
      }
    }

    if (blocos.bodyInicio !== "" && !feito.inicio) {
      // `<body>` pode vir com atributos (o React acrescenta os seus), então é
      // a tag inteira que precisa ser encontrada, não a string literal.
      const m = /<body[^>]*>/i.exec(texto);
      if (m) {
        const fim = m.index + m[0].length;
        texto = texto.slice(0, fim) + blocos.bodyInicio + texto.slice(fim);
        feito.inicio = true;
      }
    }

    if (blocos.bodyFim !== "" && !feito.fim) {
      const i = texto.lastIndexOf("</body>");
      if (i >= 0) {
        texto = texto.slice(0, i) + blocos.bodyFim + texto.slice(i);
        feito.fim = true;
      }
    }

    return texto;
  }

  let retido = "";

  return new TransformStream<string, string>({
    transform(pedaco, controller) {
      const texto = aplicar(retido + pedaco);

      if (!falta()) {
        // Tudo já entrou: daqui para a frente é repasse puro, sem reter nada.
        controller.enqueue(texto);
        retido = "";
        return;
      }

      const corte = Math.max(0, texto.length - GUARDA);
      controller.enqueue(texto.slice(0, corte));
      retido = texto.slice(corte);
    },

    flush(controller) {
      // Última chance: o `</body>` de uma página pequena pode nunca ter saído
      // do trecho retido.
      const texto = aplicar(retido);
      if (texto) controller.enqueue(texto);
    },
  });
}
