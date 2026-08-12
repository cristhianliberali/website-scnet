import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { MAX_REQUEST_BYTES, checkRateLimit, clientIpFromHeaders } from "./lib/rate-limit";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

/**
 * Proteção contra abuso das server functions dos formulários.
 *
 * Roda antes de qualquer parse do corpo — é isso que impede que um POST de
 * centenas de MB de base64 seja carregado na memória do processo antes de ser
 * recusado. As duas barreiras:
 *
 * 1. Corpo acima de MAX_REQUEST_BYTES → 413, sem ler o conteúdo.
 * 2. Mais de 15 envios por minuto vindos do mesmo IP → 429 e 5 minutos de
 *    bloqueio (ver src/lib/rate-limit.ts).
 *
 * Só se aplica a `serverFn`: navegação normal e assets não são afetados.
 */
const abuseGuardMiddleware = createMiddleware().server(async (ctx) => {
  if (ctx.handlerType !== "serverFn") return ctx.next();

  const declaredLength = Number(ctx.request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    console.error(`Request rejeitada: corpo de ${declaredLength} bytes acima do limite.`);
    return new Response("Payload Too Large", { status: 413 });
  }

  const ip = clientIpFromHeaders(ctx.request.headers);
  const verdict = checkRateLimit(ip);
  if (!verdict.allowed) {
    console.error(`Rate limit atingido para ${ip} — bloqueado por ${verdict.retryAfterSeconds}s.`);
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "retry-after": String(verdict.retryAfterSeconds) },
    });
  }

  return ctx.next();
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, abuseGuardMiddleware, csrfMiddleware],
}));
