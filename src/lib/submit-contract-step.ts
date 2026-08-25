import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  MAX_ANEXOS,
  MAX_BASE64_LENGTH,
  validateAnexos,
  type RawAnexo,
  type SafeAnexo,
} from "./attachment-validation";
import { attributionSchema, dadosSchema, neutralizeDeep } from "./form-schemas";
import { clientIpFromHeaders } from "./rate-limit";
import {
  isLikelyBot,
  mensagemRecaptcha,
  recaptchaScore,
  verifyRecaptcha,
} from "./verify-recaptcha";
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
 *
 * O schema abaixo é a fronteira de confiança: a server function é um endpoint
 * HTTP comum e recebe o que quiserem mandar, então todo campo tem tipo, tamanho
 * e formato fechados, e os anexos são revalidados e reconstruídos aqui — o
 * navegador não decide o que chega ao n8n.
 */

const FORM_ID = "contratacao";

const STEP_IDS = ["planos", "endereco", "cadastro", "anexos_agendamento"] as const;

const anexoSchema = z.object({
  campo: z.string().max(60),
  nome: z.string().max(300),
  tipo: z.string().max(120),
  tamanho: z.number(),
  // Teto barato no zod, antes das checagens caras de conteúdo.
  conteudo_base64: z.string().max(MAX_BASE64_LENGTH),
});

const stepInputSchema = z.object({
  etapa: z.number().int().min(1).max(10),
  etapa_id: z.enum(STEP_IDS),
  etapa_nome: z.string().max(60),
  total_etapas: z.number().int().min(1).max(10),
  final: z.boolean(),
  id_sessao: z.string().max(64),
  page: z.string().max(300),
  dados: dadosSchema,
  anexos: z.array(anexoSchema).max(MAX_ANEXOS).optional(),
  attribution: attributionSchema.optional(),
  recaptchaToken: z.string().max(4096).optional(),
});

export type ContractStepResult = WebhookOutcome;

export const submitContractStep = createServerFn({ method: "POST" })
  .validator(stepInputSchema)
  .handler(async ({ data }): Promise<ContractStepResult> => {
    const clientIp = clientIpFromHeaders(getRequest().headers);

    const recaptcha = await verifyRecaptcha(
      data.recaptchaToken,
      `contratacao_${data.etapa_id}`,
      clientIp,
    );
    if (isLikelyBot(recaptcha)) {
      // Aqui a mensagem pesa mais do que nos outros formulários: é a última
      // etapa que carrega os documentos, e o motivo mais comum de reprovação
      // nela é o token ter vencido durante o upload. "Envie de novo" resolve;
      // "você é um robô" faz o cliente desistir depois de anexar tudo.
      return {
        ok: false,
        status: null,
        reason: "recaptcha",
        message: mensagemRecaptcha(recaptcha),
      };
    }

    // Anexos são revalidados no servidor (MIME, tamanho real, magic bytes) e
    // o nome do arquivo é reescrito antes de sair daqui.
    let anexos: SafeAnexo[] | undefined;
    if (data.anexos?.length) {
      const result = validateAnexos(data.anexos as RawAnexo[]);
      if (!result.ok) {
        console.error(`Contract step ${data.etapa} rejected: ${result.error}`);
        return { ok: false, status: null, reason: "invalid_file", message: result.error };
      }
      anexos = result.anexos;
    }

    // O token do reCAPTCHA fica no servidor — o webhook recebe só o score.
    const { recaptchaToken: _token, anexos: _anexos, dados, ...stepData } = data;
    return postToWebhook(
      {
        formulario: FORM_ID,
        ...stepData,
        dados: neutralizeDeep(dados),
        ...(anexos?.length ? { anexos } : {}),
        submitted_at: new Date().toISOString(),
        recaptcha_score: recaptchaScore(recaptcha),
      },
      `Contract step ${data.etapa}`,
    );
  });
