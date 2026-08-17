/**
 * Envio aos webhooks do ambiente e leitura do status da resposta.
 *
 * São dois destinos, com o mesmo contrato de resposta e políticas opostas na
 * falta de configuração:
 *
 * - `postToWebhook` — os dois formulários públicos (lead da home e
 *   contratação). Sem `WEBHOOK_URL` o envio é dado por aceito, para não travar
 *   o cliente em ambiente de desenvolvimento.
 * - `postToPainelWebhook` — o login por documento e código da área do cliente.
 *   Sem `WEBHOOK_LOGIN_URL` **nada é liberado**: login não pode falhar aberto.
 *   O corpo ainda vai assinado (HMAC + timestamp), para que descobrir a URL do
 *   webhook não baste para chamá-lo. (O acesso por e-mail/telefone e senha não
 *   passa por aqui: quem confere a senha é o Supabase.)
 *
 * Nos dois casos o POST leva o Bearer token aplicado no servidor e só é
 * considerado aceito quando a resposta traz `status: "ok"`. Qualquer outro
 * status, erro HTTP, timeout ou falha de rede reprova o envio, e a mensagem
 * devolvida pelo webhook (`mensagem`/`message`) é repassada — limitada e sem
 * caracteres de controle — para ser exibida ao cliente.
 */

import { createHmac } from "node:crypto";

const WEBHOOK_TIMEOUT_MS = 15_000;

/** Teto do corpo da resposta lido do webhook. */
const MAX_RESPONSE_BYTES = 64 * 1024;

/** Teto da mensagem repassada ao cliente — ela é exibida na tela dele. */
const MAX_CLIENT_MESSAGE_LENGTH = 200;

export type WebhookReason =
  | "not_configured"
  | "http_error"
  | "bad_status"
  | "network_error"
  // sem WEBHOOK_TOKEN em produção o envio não sai
  | "missing_token"
  // usados pelos handlers antes mesmo de chegar ao webhook
  | "recaptcha"
  | "invalid_file";

export type WebhookOutcome = {
  ok: boolean;
  status: string | null;
  message?: string | undefined;
  reason?: WebhookReason;
};

/* ---------------- leitura do status ---------------- */

type StatusHit = {
  status: string;
  message: string | undefined;
  /** Objeto em que o status foi encontrado — é onde moram os demais campos. */
  record: Record<string, unknown>;
};

/** Chaves em que n8n e afins costumam embrulhar o payload real. */
const NESTED_KEYS = ["json", "data", "body", "result", "response", "payload"];

/**
 * A `mensagem` do webhook é exibida ao cliente, então chega limitada e sem
 * caracteres de controle — o texto vem de um sistema externo, não daqui.
 */
const asString = (value: unknown) =>
  typeof value === "string"
    ? // eslint-disable-next-line no-control-regex
      value.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, MAX_CLIENT_MESSAGE_LENGTH)
    : undefined;

function findStatus(value: unknown, depth = 0): StatusHit | null {
  if (depth > 3 || value == null) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findStatus(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }

  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const status = asString(record["status"]) ?? asString(record["Status"]);
  if (status !== undefined) {
    return {
      status,
      message:
        asString(record["mensagem"]) ??
        asString(record["message"]) ??
        asString(record["erro"]) ??
        asString(record["error"]),
      record,
    };
  }

  for (const key of NESTED_KEYS) {
    if (key in record) {
      const hit = findStatus(record[key], depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Aceita `{"status":"ok"}`, `[{"status":"ok"}]`, `"ok"` e texto puro `ok`. */
export function readWebhookStatus(body: string): StatusHit | null {
  const text = body.trim();
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === "string") return { status: parsed, message: undefined, record: {} };
    const hit = findStatus(parsed);
    if (hit) return hit;
  } catch {
    // não é JSON — cai no texto puro abaixo
  }
  return text.length <= 120 ? { status: text, message: undefined, record: {} } : null;
}

/* ---------------- envio ---------------- */

/**
 * Lê no máximo MAX_RESPONSE_BYTES do corpo da resposta. O webhook é um sistema
 * externo: sem teto, uma resposta gigante (por erro ou de propósito) seria
 * carregada inteira na memória do processo.
 */
async function readBounded(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text().catch(() => "");

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.length;
      if (total >= MAX_RESPONSE_BYTES) {
        await reader.cancel();
        break;
      }
    }
  } catch {
    return "";
  }

  const merged = new Uint8Array(Math.min(total, MAX_RESPONSE_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= merged.length) break;
    const slice = chunk.subarray(0, merged.length - offset);
    merged.set(slice, offset);
    offset += slice.length;
  }
  return new TextDecoder().decode(merged);
}

/**
 * Veredito com os demais campos da resposta, já desembrulhados dos `json`/
 * `data` do n8n — o painel precisa ler os dados do cliente, não só o status.
 */
export type WebhookOutcomeWithData = WebhookOutcome & { data: Record<string, unknown> };

const SEM_TOKEN_MENSAGEM = "Serviço temporariamente indisponível. Fale com a gente no WhatsApp.";

/**
 * Assinatura do corpo, para que conhecer a URL do webhook não baste para
 * chamá-lo: `HMAC_SHA256(token, "<timestamp>.<corpo>")`. O n8n recalcula e
 * recusa timestamps velhos, o que também barra o reenvio de uma requisição
 * capturada.
 */
function signatureHeaders(token: string, body: string): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const assinatura = createHmac("sha256", token).update(`${timestamp}.${body}`).digest("hex");
  return { "x-scnet-timestamp": timestamp, "x-scnet-assinatura": assinatura };
}

/** Núcleo compartilhado: POST com timeout, Bearer, assinatura e leitura limitada. */
async function postJson(opts: {
  url: string;
  token: string | undefined;
  payload: unknown;
  label: string;
  /** Acrescenta os headers de assinatura (exige token). */
  sign?: boolean;
}): Promise<WebhookOutcomeWithData> {
  const body = JSON.stringify(opts.payload);

  let res: Response;
  try {
    res = await fetch(opts.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        ...(opts.sign && opts.token ? signatureHeaders(opts.token, body) : {}),
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`${opts.label}: webhook request failed`, err);
    return { ok: false, status: null, reason: "network_error", data: {} };
  }

  const text = await readBounded(res);
  const hit = readWebhookStatus(text);
  const status = hit?.status ?? null;
  const data = hit?.record ?? {};

  if (!res.ok) {
    console.error(`${opts.label}: webhook responded ${res.status}`);
    return { ok: false, status, message: hit?.message, reason: "http_error", data };
  }

  if (status?.trim().toLowerCase() !== "ok") {
    console.error(`${opts.label}: webhook returned status "${status ?? ""}"`);
    return { ok: false, status, message: hit?.message, reason: "bad_status", data };
  }

  return { ok: true, status, message: hit?.message, data };
}

/**
 * Envia o payload ao WEBHOOK_URL e devolve o veredito.
 *
 * Sem WEBHOOK_URL configurada (dev local) devolve `ok: true` com
 * `reason: "not_configured"` — nada é bloqueado por falta de configuração.
 * `label` aparece só nos logs do servidor.
 */
export async function postToWebhook(payload: unknown, label: string): Promise<WebhookOutcome> {
  const url = process.env["WEBHOOK_URL"];
  if (!url) {
    console.warn(`WEBHOOK_URL não configurada — ${label} não foi enviado.`);
    return { ok: true, status: null, reason: "not_configured" };
  }

  // Em produção o webhook não sai sem autenticação: um POST sem o Bearer é
  // indistinguível do que qualquer um pode mandar direto para a URL do n8n.
  const token = process.env["WEBHOOK_TOKEN"];
  if (!token) {
    if (process.env["NODE_ENV"] === "production") {
      console.error(`WEBHOOK_TOKEN não configurado — ${label} não foi enviado.`);
      return { ok: false, status: null, reason: "missing_token", message: SEM_TOKEN_MENSAGEM };
    }
    console.warn(`WEBHOOK_TOKEN não configurado — ${label} será enviado sem autenticação.`);
  }

  return postJson({ url, token, payload, label });
}

/*
 * Nomes anteriores das duas variáveis do webhook de login, aceitos para que uma
 * implantação já no ar não caia ao atualizar. Os nomes válidos são
 * `WEBHOOK_LOGIN_URL` e `WEBHOOK_LOGIN_TOKEN`.
 */
const loginWebhookUrl = () =>
  process.env["WEBHOOK_LOGIN_URL"] ?? process.env["WEBHOOK_PAINEL_CLIENTE"];

const loginWebhookToken = () =>
  process.env["WEBHOOK_LOGIN_TOKEN"] ?? process.env["WEBHOOK_PAINEL_CLIENTE_TOKEN"];

/**
 * Envia o payload ao WEBHOOK_LOGIN_URL (login por documento e código).
 *
 * Ao contrário de `postToWebhook`, **falha fechado**: sem a URL configurada
 * nada é aceito, porque um login que passa por falta de configuração é um
 * login que qualquer um atravessa. Pela mesma razão o token é obrigatório em
 * produção — sem ele não há Bearer nem assinatura, e o webhook ficaria aberto
 * a quem descobrisse a URL.
 */
export async function postToPainelWebhook(
  payload: unknown,
  label: string,
): Promise<WebhookOutcomeWithData> {
  const url = loginWebhookUrl();
  if (!url) {
    console.error(`WEBHOOK_LOGIN_URL não configurada — ${label} recusado.`);
    return { ok: false, status: null, reason: "not_configured", data: {} };
  }

  const token = loginWebhookToken();
  if (!token) {
    if (process.env["NODE_ENV"] === "production") {
      console.error(`WEBHOOK_LOGIN_TOKEN não configurado — ${label} recusado.`);
      return {
        ok: false,
        status: null,
        reason: "missing_token",
        message: SEM_TOKEN_MENSAGEM,
        data: {},
      };
    }
    console.warn(`WEBHOOK_LOGIN_TOKEN não configurado — ${label} segue sem Bearer nem assinatura.`);
  }

  return postJson({ url, token, payload, label, sign: true });
}
