import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { blocosParaRequisicao, injetarScripts } from "./lib/injetar-scripts.server";
import { respostaRobots } from "./lib/robots.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      /*
       * O robots.txt é montado aqui, e não servido de `public/`: o domínio do
       * `Sitemap:` vem de VITE_SITE_URL (ou do host da requisição, no preview),
       * e arquivo estático não tem onde ler variável. Vem antes de tudo porque
       * não depende do app nem das tags do /admin.
       */
      const robots = respostaRobots(request);
      if (robots) return robots;

      const handler = await getServerEntry();
      /*
       * As tags do /admin são buscadas EM PARALELO com a renderização, não
       * antes dela: no caminho comum elas já estão na memória e resolvem na
       * hora, e na única requisição em que não estão (a primeira depois de o
       * container subir) a leitura acontece enquanto a página é montada, em vez
       * de somar ao tempo dela.
       */
      const [response, blocos] = await Promise.all([
        handler.fetch(request, env, ctx),
        blocosParaRequisicao(request),
      ]);
      return injetarScripts(await normalizeCatastrophicSsrResponse(response), blocos);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
