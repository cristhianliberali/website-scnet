import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { isLikelyBot, verifyRecaptcha } from "./verify-recaptcha";
import { postToWebhook, type WebhookOutcome } from "./webhook";

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

export type ContractStepResult = WebhookOutcome;

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

    // O token do reCAPTCHA fica no servidor — o webhook recebe só o score.
    const { recaptchaToken: _token, ...stepData } = data;
    return postToWebhook(
      {
        formulario: FORM_ID,
        ...stepData,
        submitted_at: new Date().toISOString(),
        recaptcha_score: recaptcha?.score ?? null,
      },
      `Contract step ${data.etapa}`,
    );
  });
