/**
 * Rate limit por IP para as server functions dos formulários.
 *
 * Regra: até 15 envios por minuto por IP. Ao estourar, o IP fica 5 minutos
 * bloqueado — e o bloqueio NÃO é renovado a cada nova tentativa, ele expira
 * 5 minutos depois do estouro, senão um bot insistente se manteria banido
 * para sempre e um cliente real preso atrás do mesmo IP (CGNAT de operadora
 * móvel) nunca conseguiria voltar.
 *
 * O estado vive na memória do processo. Com a instância única do Dockerfile
 * atual isso cobre o caso real; se um dia houver réplicas, cada uma terá seu
 * próprio contador e o store precisa ir para um Redis compartilhado.
 */

export const RATE_LIMIT_MAX_HITS = 15;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_LIMIT_BLOCK_MS = 5 * 60_000;

/** Teto do corpo da requisição: 2 anexos de 10MB em base64 (~13,4MB) + folga. */
export const MAX_REQUEST_BYTES = 30 * 1024 * 1024;

type Entry = {
  /** Timestamps dos envios dentro da janela deslizante. */
  hits: number[];
  /** Enquanto for maior que agora, tudo é recusado. */
  blockedUntil: number;
};

const entries = new Map<string, Entry>();

/** Entradas paradas há mais de uma janela + um bloqueio não têm mais efeito. */
const ENTRY_TTL_MS = RATE_LIMIT_WINDOW_MS + RATE_LIMIT_BLOCK_MS;

function sweep(now: number) {
  for (const [ip, entry] of entries) {
    const lastHit = entry.hits[entry.hits.length - 1] ?? 0;
    const lastActivity = Math.max(lastHit, entry.blockedUntil);
    if (now - lastActivity > ENTRY_TTL_MS) entries.delete(ip);
  }
}

// Varredura periódica para o Map não crescer sem limite sob flood distribuído.
// `unref` para não segurar o event loop e impedir o processo de encerrar.
const sweepTimer: unknown = setInterval(() => sweep(Date.now()), RATE_LIMIT_WINDOW_MS);
if (typeof (sweepTimer as { unref?: () => void }).unref === "function") {
  (sweepTimer as { unref: () => void }).unref();
}

export type RateLimitVerdict = {
  allowed: boolean;
  /** Segundos até liberar — vira o header `Retry-After` na resposta 429. */
  retryAfterSeconds: number;
};

const ALLOWED: RateLimitVerdict = { allowed: true, retryAfterSeconds: 0 };

/**
 * Contabiliza um envio do IP e devolve o veredito. Chamar uma vez por
 * requisição: a chamada em si já conta como envio.
 */
export function checkRateLimit(ip: string, now: number = Date.now()): RateLimitVerdict {
  const entry = entries.get(ip);

  if (!entry) {
    entries.set(ip, { hits: [now], blockedUntil: 0 });
    return ALLOWED;
  }

  if (entry.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000),
    };
  }

  // Saindo de um bloqueio: zera o histórico para o IP recomeçar limpo.
  if (entry.blockedUntil !== 0) {
    entry.blockedUntil = 0;
    entry.hits = [];
  }

  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  entry.hits = entry.hits.filter((hit) => hit > windowStart);
  entry.hits.push(now);

  if (entry.hits.length > RATE_LIMIT_MAX_HITS) {
    entry.blockedUntil = now + RATE_LIMIT_BLOCK_MS;
    entry.hits = [];
    return { allowed: false, retryAfterSeconds: Math.ceil(RATE_LIMIT_BLOCK_MS / 1000) };
  }

  return ALLOWED;
}

/** Usado pelos testes — não chamar em runtime. */
export function resetRateLimit() {
  entries.clear();
}

/**
 * IP do cliente. O app roda atrás do proxy do EasyPanel, então o primeiro
 * segmento de `x-forwarded-for` é o endereço real; sem proxy, cai no
 * `x-real-ip` e por fim numa chave única para não agrupar todo mundo no
 * mesmo balde por falta de header.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return normalizeIp(first);

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return normalizeIp(realIp);

  return "unknown";
}

/** `::ffff:1.2.3.4` e `[::1]:443` são o mesmo cliente que `1.2.3.4` e `::1`. */
function normalizeIp(value: string): string {
  let ip = value;
  if (ip.startsWith("[")) ip = ip.slice(1, ip.indexOf("]") === -1 ? undefined : ip.indexOf("]"));
  if (ip.startsWith("::ffff:")) ip = ip.slice("::ffff:".length);
  // Porta em IPv4 (`1.2.3.4:5678`) — IPv6 nu tem vários ":" e fica como está.
  const colon = ip.indexOf(":");
  if (colon !== -1 && ip.indexOf(":", colon + 1) === -1) ip = ip.slice(0, colon);
  return ip.toLowerCase();
}
