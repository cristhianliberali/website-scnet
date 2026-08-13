/**
 * Limitador de tentativas da área do cliente: falhas seguidas bloqueiam a chave
 * por 5 minutos.
 *
 * Cada tentativa é contada por duas chaves, com limites diferentes de propósito:
 *
 * - **identificador** (documento ou login): 3 falhas, como pedido. É a trava que
 *   protege a conta de quem está sendo alvo.
 * - **IP de origem**: 15 falhas. Mais frouxa porque no Brasil é comum vários
 *   clientes saírem pelo mesmo IP público (CGNAT das operadoras móveis, NAT de
 *   empresas e condomínios). Se o IP travasse em 3, três senhas erradas de um
 *   vizinho deixariam todos os outros de fora. O limite ainda existe para frear
 *   quem varre muitos documentos a partir de um ponto só.
 *
 * O estado vive na memória do processo, como o cache de planos em
 * `planos-db.ts`. Isso significa que reiniciar o container ou subir uma segunda
 * instância zera a contagem — aceitável para frear tentativa e erro manual,
 * insuficiente contra um atacante distribuído. Um limitador durável (Postgres
 * ou Redis) é o próximo passo se isso virar necessidade.
 */

const MAX_POR_IDENTIFICADOR = 3;
const MAX_POR_IP = 15;
const BLOCK_MS = 5 * 60 * 1000;
/** Uma entrada ociosa por mais tempo que isso não interessa mais. */
const IDLE_TTL_MS = BLOCK_MS * 2;

/** Chave contada e o número de falhas que a bloqueia. */
export type LimitKey = { key: string; max: number };

/** Documento ou login: a trava fechada, de 3 tentativas. */
export const porIdentificador = (key: string): LimitKey => ({
  key,
  max: MAX_POR_IDENTIFICADOR,
});

/** IP de origem: trava folgada, para não derrubar quem divide o IP. */
export const porIp = (ip: string | undefined): LimitKey => ({
  key: `ip:${ip ?? "desconhecido"}`,
  max: MAX_POR_IP,
});

type Entry = { attempts: number; blockedUntil: number; touchedAt: number };

const entries = new Map<string, Entry>();

/** Varre as entradas vencidas para o Map não crescer sem limite. */
function sweep(now: number) {
  for (const [key, entry] of entries) {
    if (entry.blockedUntil <= now && now - entry.touchedAt > IDLE_TTL_MS) {
      entries.delete(key);
    }
  }
}

export type RateLimitVerdict = { blocked: false } | { blocked: true; retryAfterSeconds: number };

const veredito = (retryAfterMs: number): RateLimitVerdict =>
  retryAfterMs > 0
    ? { blocked: true, retryAfterSeconds: Math.ceil(retryAfterMs / 1000) }
    : { blocked: false };

/**
 * Verifica as chaves antes de gastar uma tentativa. Devolve o maior tempo
 * restante quando qualquer uma delas está bloqueada.
 */
export function checkRateLimit(keys: LimitKey[]): RateLimitVerdict {
  const now = Date.now();
  let retryAfterMs = 0;

  for (const { key } of keys) {
    const entry = entries.get(key);
    if (entry && entry.blockedUntil > now) {
      retryAfterMs = Math.max(retryAfterMs, entry.blockedUntil - now);
    }
  }

  return veredito(retryAfterMs);
}

/** Conta uma falha nas chaves e bloqueia as que chegarem ao próprio limite. */
export function registerFailure(keys: LimitKey[]): RateLimitVerdict {
  const now = Date.now();
  sweep(now);
  let retryAfterMs = 0;

  for (const { key, max } of keys) {
    const current = entries.get(key);
    // um bloqueio vencido recomeça a contagem do zero
    const attempts =
      current && current.blockedUntil <= now && current.attempts >= max
        ? 1
        : (current?.attempts ?? 0) + 1;
    const blockedUntil = attempts >= max ? now + BLOCK_MS : (current?.blockedUntil ?? 0);

    entries.set(key, { attempts, blockedUntil, touchedAt: now });
    if (blockedUntil > now) retryAfterMs = Math.max(retryAfterMs, blockedUntil - now);
  }

  return veredito(retryAfterMs);
}

/** Zera a contagem — chamado quando a tentativa dá certo. */
export function clearRateLimit(keys: LimitKey[]) {
  for (const { key } of keys) entries.delete(key);
}

/** "5 minutos" / "40 segundos", para a mensagem que o cliente lê. */
export function blockedMessage(retryAfterSeconds: number) {
  const minutos = Math.ceil(retryAfterSeconds / 60);
  const tempo =
    retryAfterSeconds >= 60
      ? `${minutos} minuto${minutos > 1 ? "s" : ""}`
      : `${retryAfterSeconds} segundos`;
  return `Muitas tentativas seguidas. Aguarde ${tempo} e tente de novo.`;
}
