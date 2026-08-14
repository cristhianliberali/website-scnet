/**
 * O middleware de anti-abuso (src/start.ts) responde 429 quando o IP passa do
 * limite de envios e 413 quando o corpo é grande demais. Server functions
 * rejeitam com um `Response` cru nesses casos — mas dependendo da camada o
 * erro chega como um `Error` carregando `status`, então os dois formatos são
 * checados aqui.
 */

function statusOf(error: unknown): number | undefined {
  if (error instanceof Response) return error.status;
  if (error !== null && typeof error === "object") {
    const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
    const value = status ?? statusCode;
    if (typeof value === "number") return value;
  }
  return undefined;
}

/** Envio recusado por exceder o limite de requisições do IP. */
export function isRateLimited(error: unknown): boolean {
  return statusOf(error) === 429;
}

/** Envio recusado por o corpo passar do teto (anexos grandes demais). */
export function isPayloadTooLarge(error: unknown): boolean {
  return statusOf(error) === 413;
}
