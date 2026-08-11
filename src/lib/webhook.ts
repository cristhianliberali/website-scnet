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

type StatusHit = { status: string; message: string | undefined };

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

  const token = process.env["WEBHOOK_TOKEN"];
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

  const body = await res.text().catch(() => "");
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
