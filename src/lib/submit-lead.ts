import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isValidPhone } from "./form-utils";
import { NAME_RE, attributionSchema } from "./form-schemas";
import { LIMITES } from "./form-limits";
import { clientIpFromHeaders } from "./rate-limit";
import { enviarEventoMeta } from "./meta-capi.server";
import { precoNumerico, precoVigente } from "./plans";
import { origemDaRequisicao } from "./robots.server";
import {
  isLikelyBot,
  mensagemRecaptcha,
  recaptchaScore,
  verifyRecaptcha,
} from "./verify-recaptcha";
import { postToWebhook, type WebhookOutcome } from "./webhook";
import { registrarEnvio } from "./envios-db.server";
import { statusDoWebhook } from "./envios-status";

/** Identifica a origem do envio para quem consome o webhook. */
const FORM_ID = "lead";

/**
 * A `action` do reCAPTCHA deste endpoint — exportada, e é o ponto importante.
 *
 * O token do reCAPTCHA v3 carrega o nome da ação com que foi gerado, e o
 * servidor recusa um token gerado para outra ação. Isso quer dizer que os dois
 * lados precisam usar EXATAMENTE a mesma palavra, e a única forma de garantir
 * isso é não haver duas palavras: quem envia para cá importa esta constante.
 *
 * **Foi assim que o formulário "Contrate agora" da home parou.** Ele gerava o
 * token com `"contract_form_submit"` — escrito à mão no componente — e postava
 * aqui, onde a conferência era contra `"lead_submit"`. As duas strings viviam em
 * arquivos diferentes, nada as ligava, e o resultado era `action_mismatch` em
 * 100% dos envios: o cliente preenchia, era recusado como robô, e o log dizia
 * apenas "blocked by reCAPTCHA". A pontuação vinha 0.9 — gente real, com folga.
 */
export const RECAPTCHA_ACTION_LEAD = "lead_submit";

export type LeadResult = WebhookOutcome;

// A server function é um endpoint HTTP comum: tudo que entra aqui vem de fora
// e segue para o n8n e para a Conversions API do Meta, então cada campo tem
// formato e tamanho fechados.
const leadInputSchema = z.object({
  // Os tetos são os mesmos que o `maxLength` do formulário aplica (LIMITES).
  name: z.string().min(1).max(LIMITES.nome).regex(NAME_RE),
  ddi: z
    .string()
    .max(LIMITES.ddi)
    .regex(/^\+?\d{1,3}$/),
  // Mesma regra do formulário (DDD + 8 ou 9 dígitos), agora também no servidor.
  phone: z.string().min(1).max(LIMITES.telefone).refine(isValidPhone),
  page: z.string().max(300),
  intent: z.enum(["quero_contratar", "ja_sou_cliente"]).optional(),
  plan: z.string().max(60).optional(),
  price: z.string().max(30).optional(),
  // Demais campos do plano escolhido, repassados ao webhook. Vêm do navegador
  // como todo o resto, então também chegam com tamanho fechado.
  codigoMk: z.number().nullable().optional(),
  composicao: z.string().max(2000).optional(),
  valorPrimeirasFaturas: z.string().max(30).optional(),
  quantMesesDesconto: z.number().nullable().optional(),
  codigoOfertaMk: z
    .union([z.number(), z.string().max(60)])
    .nullable()
    .optional(),
  codigoOferta: z.string().max(60).optional(),
  recaptchaToken: z.string().max(4096).optional(),
  fbc: z.string().max(255).optional(),
  fbp: z.string().max(255).optional(),
  /** O `eventID` que o Pixel usou no navegador — a CAPI repete para deduplicar. */
  eventId: z.string().max(64).optional(),
  attribution: attributionSchema.optional(),
});

type LeadInput = z.infer<typeof leadInputSchema>;

/**
 * O evento do Meta para este lead, do servidor.
 *
 * `Lead` para quem quer contratar; `Contact` para quem já é cliente. Os dois
 * viajam com tudo o que o formulário sabe da pessoa (nome, telefone, cookies do
 * Pixel, IP, navegador) e com o plano escolhido em `custom_data` — é o que faz
 * o Meta reconhecer quem converteu e otimizar a campanha para gente parecida.
 */
async function enviarLeadParaMeta(input: LeadInput, request: Request, clientIp: string) {
  const preco = input.price
    ? precoNumerico(precoVigente(input.price, input.valorPrimeirasFaturas ?? null))
    : undefined;
  const atribuicao = input.attribution ?? {};

  await enviarEventoMeta({
    nome: input.intent === "ja_sou_cliente" ? "Contact" : "Lead",
    eventId: input.eventId,
    pagina: input.page,
    origem: origemDaRequisicao(request),
    usuario: {
      nome: input.name,
      telefone: `${input.ddi}${input.phone}`,
      fbc: input.fbc,
      fbp: input.fbp,
      fbclid: atribuicao["fbclid"],
      fbclidEm: atribuicao["first_visit_at"],
      ip: clientIp,
      userAgent: request.headers.get("user-agent"),
    },
    dados: {
      content_name: input.plan,
      content_ids: input.codigoMk != null ? [String(input.codigoMk)] : undefined,
      content_type: input.plan ? "product" : undefined,
      content_category: "internet_fibra",
      value: preco,
      currency: preco !== undefined ? "BRL" : undefined,
      intencao: input.intent ?? "quero_contratar",
      pagina: input.page.split("?")[0],
      codigo_oferta: input.codigoOferta,
      utm_source: atribuicao["utm_source"],
      utm_medium: atribuicao["utm_medium"],
      utm_campaign: atribuicao["utm_campaign"],
      utm_content: atribuicao["utm_content"],
    },
  });
}

/**
 * Verifica o reCAPTCHA (quando configurado) e envia o lead ao webhook,
 * devolvendo o veredito para o formulário: o cliente só segue adiante com
 * `status: "ok"`, e a mensagem de erro do webhook volta para ser exibida.
 * O evento da Conversions API só é disparado para leads aceitos pelo webhook.
 */
export const submitLead = createServerFn({ method: "POST" })
  .validator(leadInputSchema)
  .handler(async ({ data }): Promise<LeadResult> => {
    const request = getRequest();
    const clientIp = clientIpFromHeaders(request.headers);

    const recaptcha = await verifyRecaptcha(data.recaptchaToken, RECAPTCHA_ACTION_LEAD, clientIp);
    if (isLikelyBot(recaptcha)) {
      // O motivo já foi para o log dentro de `verifyRecaptcha` — aqui só sobra
      // dizer à pessoa o que fazer, e cada motivo pede uma saída diferente.
      return {
        ok: false,
        status: null,
        reason: "recaptcha",
        message: mensagemRecaptcha(recaptcha),
      };
    }

    const idSessao = randomUUID();

    // Mesmo envelope das etapas de /contratacao — quem consome o webhook lê
    // os dois formulários do mesmo jeito.
    const payload = {
      formulario: FORM_ID,
      etapa: 1,
      etapa_id: "lead",
      etapa_nome: "Lead",
      total_etapas: 1,
      final: true,
      id_sessao: idSessao,
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
              codigo_oferta_mk: data.codigoOfertaMk ?? null,
              codigo_oferta: data.codigoOferta ?? null,
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
      recaptcha_score: recaptchaScore(recaptcha),
    };

    const outcome = await postToWebhook(payload, "Lead");

    /*
     * O lead é gravado mesmo quando o webhook recusa — e é aí que ele mais
     * vale. Um n8n fora do ar, um token vencido, um fluxo republicado: sem esta
     * linha, o lead da pessoa que preencheu tudo certo simplesmente não
     * existiria em lugar nenhum quando alguém fosse procurar.
     *
     * O que NÃO chega aqui é o que o reCAPTCHA reprovou: o handler já devolveu
     * lá em cima. Robô não é envio, e gravá-lo só encheria a caixa de entrada
     * do comercial com o que ninguém vai ligar.
     */
    await registrarEnvio({
      idSessao,
      formulario: "lead",
      etapa: 1,
      etapaId: "lead",
      totalEtapas: 1,
      concluido: true,
      statusEnvio: statusDoWebhook(outcome),
      dados: { ...payload.dados, attribution: payload.attribution, page: payload.page },
      ip: clientIp,
    });

    if (outcome.ok) await enviarLeadParaMeta(data, request, clientIp);
    return outcome;
  });
