import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isLikelyBot, verifyRecaptcha } from "./verify-recaptcha";

/**
 * Per-step webhook for the /contratacao wizard.
 *
 * Every step of the form posts to the environment webhook (WEBHOOK_URL) with
 * the Bearer token (WEBHOOK_TOKEN) added server-side, always carrying
 * `formulario: "contratacao"`. Each step is checked against reCAPTCHA v3
 * first (when configured), and the wizard only lets the user move on when the
 * webhook answers with `status: "ok"` — an HTTP error, a network failure or
 * any other status blocks the step.
 */

const FORM_ID = "contratacao";
const WEBHOOK_TIMEOUT_MS = 30_000;

const anexoSchema = z.object({
  campo: z.string(),
  nome: z.string(),
  tipo: z.string(),
  tamanho: z.number(),
  conteudo_base64: z.string(),
});

const stepInputSchema = z.object({
  etapa: z.number().int().min(1),
  etapa_id: z.string(),
  etapa_nome: z.string(),
  total_etapas: z.number().int().min(1),
  final: z.boolean(),
  id_sessao: z.string(),
  page: z.string(),
  dados: z.record(z.unknown()),
  anexos: z.array(anexoSchema).optional(),
  attribution: z.record(z.string().optional()).optional(),
  recaptchaToken: z.string().optional(),
});

export type ContractStepResult = {
  ok: boolean;
  status: string | null;
  message?: string | undefined;
  reason?: "not_configured" | "http_error" | "bad_status" | "network_error" | "recaptcha";
};

/* ---------------- response parsing ---------------- */

type StatusHit = { status: string; message: string | undefined };

/** Keys n8n (and friends) commonly wrap the real payload in. */
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
        asString(record["message"]) ??
        asString(record["mensagem"]) ??
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

/** Accepts `{"status":"ok"}`, `[{"status":"ok"}]`, `"ok"` and plain-text `ok`. */
function readStatus(body: string): StatusHit | null {
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

/* ---------------- server function ---------------- */

export const submitContractStep = createServerFn({ method: "POST" })
  .validator(stepInputSchema)
  .handler(async ({ data }): Promise<ContractStepResult> => {
    const recaptcha = await verifyRecaptcha(data.recaptchaToken);
    if (isLikelyBot(recaptcha)) {
      console.error(`Contract step ${data.etapa} blocked by reCAPTCHA`);
      return {
        ok: false,
        status: null,
        reason: "recaptcha",
        message:
          "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.",
      };
    }

    const url = process.env["WEBHOOK_URL"];
    if (!url) {
      // Sem webhook configurado (dev local) o formulário segue normalmente.
      console.warn("WEBHOOK_URL não configurada — etapa da contratação não foi enviada.");
      return { ok: true, status: null, reason: "not_configured" };
    }

    const token = process.env["WEBHOOK_TOKEN"];
    // O token do reCAPTCHA fica no servidor — o webhook recebe só o score.
    const { recaptchaToken: _token, ...stepData } = data;
    const payload = {
      formulario: FORM_ID,
      ...stepData,
      submitted_at: new Date().toISOString(),
      recaptcha_score: recaptcha?.score ?? null,
    };

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
      console.error(`Contract step ${data.etapa} webhook request failed`, err);
      return { ok: false, status: null, reason: "network_error" };
    }

    const body = await res.text().catch(() => "");
    const hit = readStatus(body);
    const status = hit?.status ?? null;
    const isOk = status?.trim().toLowerCase() === "ok";

    if (!res.ok) {
      console.error(`Contract step ${data.etapa} webhook responded ${res.status}`);
      return {
        ok: false,
        status,
        message: hit?.message,
        reason: "http_error",
      };
    }

    if (!isOk) {
      console.error(`Contract step ${data.etapa} webhook returned status "${status ?? ""}"`);
      return { ok: false, status, message: hit?.message, reason: "bad_status" };
    }

    return { ok: true, status, message: hit?.message };
  });
