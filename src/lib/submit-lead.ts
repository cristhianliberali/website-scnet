import { createServerFn } from "@tanstack/react-start";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { isLikelyBot, verifyRecaptcha } from "./verify-recaptcha";
import { postToWebhook, type WebhookOutcome } from "./webhook";

/** Identifica a origem do envio para quem consome o webhook. */
const FORM_ID = "lead";

export type LeadResult = WebhookOutcome;

const leadInputSchema = z.object({
  name: z.string().min(1),
  ddi: z.string().min(1),
  phone: z.string().min(1),
  page: z.string(),
  intent: z.enum(["quero_contratar", "ja_sou_cliente"]).optional(),
  plan: z.string().optional(),
  price: z.string().optional(),
  // Demais campos do plano escolhido, repassados ao webhook.
  codigoMk: z.number().nullable().optional(),
  composicao: z.string().optional(),
  valorPrimeirasFaturas: z.string().optional(),
  quantMesesDesconto: z.number().nullable().optional(),
  recaptchaToken: z.string().optional(),
  fbc: z.string().optional(),
  fbp: z.string().optional(),
  attribution: z.record(z.string().optional()).optional(),
});

type LeadInput = z.infer<typeof leadInputSchema>;

function sha256(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

function parsePrice(price: string): number | undefined {
  const n = Number(price.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

async function sendFacebookCapiEvent(input: LeadInput) {
  const pixelId = import.meta.env["VITE_FACEBOOK_PIXEL_ID"] as string | undefined;
  const accessToken = process.env["FACEBOOK_CAPI_ACCESS_TOKEN"];
  if (!pixelId || !accessToken) return;

  const digits = `${input.ddi}${input.phone}`.replace(/\D/g, "");
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        data: [
          {
            event_name: "Lead",
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            event_source_url: input.page,
            user_data: {
              ph: digits ? [sha256(digits)] : undefined,
              fbc: input.fbc,
              fbp: input.fbp,
            },
            ...(input.plan
              ? {
                  custom_data: {
                    content_name: input.plan,
                    ...(input.price ? { value: parsePrice(input.price), currency: "BRL" } : {}),
                  },
                }
              : {}),
          },
        ],
      }),
    });
    if (!res.ok) console.error(`Facebook CAPI responded ${res.status}`);
  } catch (err) {
    console.error("Facebook CAPI request failed", err);
  }
}

/**
 * Verifica o reCAPTCHA (quando configurado) e envia o lead ao webhook,
 * devolvendo o veredito para o formulário: o cliente só segue adiante com
 * `status: "ok"`, e a mensagem de erro do webhook volta para ser exibida.
 * O evento da Conversions API só é disparado para leads aceitos.
 */
export const submitLead = createServerFn({ method: "POST" })
  .validator(leadInputSchema)
  .handler(async ({ data }): Promise<LeadResult> => {
    const recaptcha = await verifyRecaptcha(data.recaptchaToken);
    if (isLikelyBot(recaptcha)) {
      console.error("Lead blocked by reCAPTCHA");
      return {
        ok: false,
        status: null,
        reason: "recaptcha",
        message:
          "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.",
      };
    }

    // Mesmo envelope das etapas de /contratacao — quem consome o webhook lê
    // os dois formulários do mesmo jeito.
    const payload = {
      formulario: FORM_ID,
      etapa: 1,
      etapa_id: "lead",
      etapa_nome: "Lead",
      total_etapas: 1,
      final: true,
      id_sessao: randomUUID(),
      page: data.page,
      dados: {
        planos: data.plan
          ? {
              nome: data.plan,
              preco: data.price ?? null,
              codigo_mk: data.codigoMk ?? null,
              composicao: data.composicao ?? null,
              valor_primeiras_faturas: data.valorPrimeirasFaturas ?? null,
              quant_meses_desconto: data.quantMesesDesconto ?? null,
            }
          : null,
        origem: {
          nome: data.name,
          whatsapp: `${data.ddi}${data.phone.replace(/\D/g, "")}`,
          intencao: data.intent ?? null,
        },
      },
      attribution: data.attribution ?? {},
      submitted_at: new Date().toISOString(),
      recaptcha_score: recaptcha?.score ?? null,
    };

    const outcome = await postToWebhook(payload, "Lead");
    if (outcome.ok) await sendFacebookCapiEvent(data);
    return outcome;
  });
