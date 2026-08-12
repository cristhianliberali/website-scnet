/**
 * Envio ao webhook do ambiente e leitura do status da resposta,
 * compartilhados pelos dois formulários (lead da home e contratação).
 *
 * Os dois seguem o mesmo contrato: o POST leva o Bearer token aplicado no
 * servidor e só é considerado aceito quando a resposta traz `status: "ok"`.
 * Qualquer outro status, erro HTTP, timeout ou falha de rede reprova o envio,
 * e a mensagem devolvida pelo webhook (`mensagem`/`message`) é repassada para
 * ser exibida ao cliente.
 */

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

type StatusHit = { status: string; message: string | undefined };

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
    if (typeof parsed === "string") return { status: parsed, message: undefined };
    const hit = findStatus(parsed);
    if (hit) return hit;
  } catch {
    // não é JSON — cai no texto puro abaixo
  }
  return text.length <= 120 ? { status: text, message: undefined } : null;
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
      return {
        ok: false,
        status: null,
        reason: "missing_token",
        message: "Serviço temporariamente indisponível. Fale com a gente no WhatsApp.",
      };
    }
    console.warn(`WEBHOOK_TOKEN não configurado — ${label} será enviado sem autenticação.`);
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch (err) {
    console.error(`${label}: webhook request failed`, err);
    return { ok: false, status: null, reason: "network_error" };
  }

  const body = await readBounded(res);
  const hit = readWebhookStatus(body);
  const status = hit?.status ?? null;

  if (!res.ok) {
    console.error(`${label}: webhook responded ${res.status}`);
    return { ok: false, status, message: hit?.message, reason: "http_error" };
  }

  if (status?.trim().toLowerCase() !== "ok") {
    console.error(`${label}: webhook returned status "${status ?? ""}"`);
    return { ok: false, status, message: hit?.message, reason: "bad_status" };
  }

  return { ok: true, status, message: hit?.message };
}
