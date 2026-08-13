/**
 * Envio aos webhooks do ambiente e leitura do status da resposta.
 *
 * São dois destinos com contratos iguais na resposta e políticas opostas na
 * falta de configuração:
 *
 * - `postToWebhook` — os dois formulários públicos (lead da home e
 *   contratação). Sem `WEBHOOK_URL` o envio é dado por aceito, para não travar
 *   o cliente em ambiente de desenvolvimento.
 * - `postToPainelWebhook` — a autenticação da área do cliente. Sem
 *   `WEBHOOK_PAINEL_CLIENTE` **nada é liberado**: login não pode falhar aberto.
 *   O corpo ainda vai assinado (HMAC + timestamp), para que descobrir a URL do
 *   webhook não baste para chamá-lo.
 *
 * Nos dois casos o POST leva o Bearer token aplicado no servidor e só é
 * considerado aceito quando a resposta traz `status: "ok"`. Qualquer outro
 * status, erro HTTP, timeout ou falha de rede reprova o envio, e a mensagem
 * devolvida pelo webhook (`mensagem`/`message`) é repassada para ser exibida
 * ao cliente.
 */

import { createHmac } from "node:crypto";

const WEBHOOK_TIMEOUT_MS = 30_000;

export type WebhookReason =
  | "not_configured"
  | "http_error"
  | "bad_status"
  | "network_error"
  // usado pelos handlers antes mesmo de chegar ao webhook
  | "recaptcha";

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

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);

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
 * Veredito com os demais campos da resposta, já desembrulhados dos `json`/
 * `data` do n8n — o painel precisa ler os dados do cliente, não só o status.
 */
export type WebhookOutcomeWithData = WebhookOutcome & { data: Record<string, unknown> };

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

/** Núcleo compartilhado: POST com timeout, Bearer opcional e leitura do status. */
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

  const text = await res.text().catch(() => "");
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

  return postJson({ url, token: process.env["WEBHOOK_TOKEN"], payload, label });
}

/**
 * Envia o payload ao WEBHOOK_PAINEL_CLIENTE (autenticação da área do cliente).
 *
 * Ao contrário de `postToWebhook`, **falha fechado**: sem a URL configurada
 * nada é aceito, porque um login que passa por falta de configuração é um
 * login que qualquer um atravessa. O corpo vai assinado quando há token.
 */
export async function postToPainelWebhook(
  payload: unknown,
  label: string,
): Promise<WebhookOutcomeWithData> {
  const url = process.env["WEBHOOK_PAINEL_CLIENTE"];
  if (!url) {
    console.error(`WEBHOOK_PAINEL_CLIENTE não configurada — ${label} recusado.`);
    return { ok: false, status: null, reason: "not_configured", data: {} };
  }

  const token = process.env["WEBHOOK_PAINEL_CLIENTE_TOKEN"];
  if (!token) {
    console.warn(
      `WEBHOOK_PAINEL_CLIENTE_TOKEN não configurada — ${label} segue sem Bearer nem assinatura.`,
    );
  }

  return postJson({ url, token, payload, label, sign: true });
}
