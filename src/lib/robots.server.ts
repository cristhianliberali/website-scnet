/**
 * O `/robots.txt`, com o domínio vindo da variável de ambiente.
 *
 * **O problema que este arquivo resolve.** O robots.txt era um arquivo estático
 * em `public/`, e dentro dele o domínio estava escrito à mão:
 * `Sitemap: https://contrate.scnet.com.br/sitemap.xml`. Todo o resto do site já
 * tirava o endereço de `VITE_SITE_URL` — o canonical, o `og:url`, a conferência
 * de domínio do reCAPTCHA — e só aqui um domínio fixo sobrevivia. Numa
 * implantação em outro endereço (preview, homologação, ou o dia em que o
 * domínio mudar) o arquivo continuaria apontando robôs de busca para um site
 * que não é aquele.
 *
 * **De onde sai o domínio, nesta ordem:**
 *
 * 1. `VITE_SITE_URL`, a mesma variável do canonical — é o endereço canônico do
 *    site, o que deve constar para o buscador mesmo quando a página foi servida
 *    por outro host.
 * 2. Sem a variável, o endereço da própria requisição (respeitando
 *    `x-forwarded-proto`/`x-forwarded-host`, porque em produção quem termina o
 *    TLS é o proxy do EasyPanel). Assim um preview anuncia o sitemap dele
 *    mesmo, em vez de mandar o robô para produção — e o desenvolvimento local
 *    continua funcionando sem configurar nada.
 *
 * **Por que uma resposta do servidor, e não um arquivo.** Sendo `VITE_*`, a
 * variável entra no bundle no BUILD; um arquivo em `public/` é copiado como
 * está, sem substituição nenhuma. Gerar o texto na resposta resolve os dois
 * casos com o mesmo código, e o fallback pelo host da requisição só é possível
 * aqui — um arquivo estático não sabe por qual endereço foi pedido.
 */

import { SITE_URL } from "./links";

/** As regras, que não dependem do domínio. */
const REGRAS = `User-agent: Googlebot
Allow: /

User-agent: Bingbot
Allow: /

User-agent: Twitterbot
Allow: /

User-agent: facebookexternalhit
Allow: /

User-agent: *
Allow: /`;

/**
 * O endereço pelo qual esta requisição chegou, sem barra no fim.
 *
 * Atrás do proxy do EasyPanel a requisição chega em http e com o host interno;
 * `x-forwarded-proto`/`x-forwarded-host` são o que o navegador realmente pediu.
 * Só valem como último recurso: quando `VITE_SITE_URL` existe, é ela que manda.
 */
export function origemDaRequisicao(request: Request): string {
  const url = new URL(request.url);
  const primeiro = (valor: string | null) => valor?.split(",")[0]?.trim() || undefined;
  const host = primeiro(request.headers.get("x-forwarded-host")) ?? url.host;
  const protocolo =
    primeiro(request.headers.get("x-forwarded-proto")) ?? url.protocol.replace(":", "");
  return `${protocolo}://${host}`;
}

/** O texto do robots.txt para um domínio. */
export function robotsTxt(origem: string): string {
  const base = origem.replace(/\/$/, "");
  return `${REGRAS}\n\nSitemap: ${base}/sitemap.xml\n`;
}

/** É esta a rota? Aceita `/robots.txt` com ou sem barra no fim. */
const ehRobots = (pathname: string) => pathname === "/robots.txt" || pathname === "/robots.txt/";

/**
 * Responde `/robots.txt`, ou `undefined` quando a requisição é outra coisa —
 * é assim que `server.ts` decide se atende aqui ou segue para o app.
 *
 * `siteUrl` existe para o teste conseguir exercitar os dois caminhos (com e sem
 * a variável) sem depender do ambiente em que ele roda; em produção ninguém o
 * passa.
 */
export function respostaRobots(request: Request, siteUrl: string = SITE_URL): Response | undefined {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;
  if (!ehRobots(new URL(request.url).pathname)) return undefined;

  const corpo = robotsTxt(siteUrl.trim() || origemDaRequisicao(request));
  return new Response(request.method === "HEAD" ? null : corpo, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
