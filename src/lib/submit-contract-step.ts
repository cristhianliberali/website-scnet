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
import { limitarCampos } from "./form-limits";
import { clientIpFromHeaders } from "./rate-limit";
import {
  isLikelyBot,
  mensagemRecaptcha,
  recaptchaScore,
  verifyRecaptcha,
} from "./verify-recaptcha";
import { postToWebhook, type WebhookOutcome } from "./webhook";
import { registrarEnvio } from "./envios-db.server";
import { statusDoWebhook } from "./envios-status";
import { enviarEventoMeta, type MetaEventName } from "./meta-capi.server";
import { precoNumerico, precoVigente } from "./plans";
import { origemDaRequisicao } from "./robots.server";

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
  // Para a Conversions API do Meta: os cookies do Pixel e o id do evento que o
  // navegador disparou, para o Meta deduplicar com o que sai daqui.
  fbc: z.string().max(255).optional(),
  fbp: z.string().max(255).optional(),
  metaEventId: z.string().max(64).optional(),
});

type StepInput = z.infer<typeof stepInputSchema>;

export type ContractStepResult = WebhookOutcome;

type Registro = Record<string, unknown>;

const objeto = (valor: unknown): Registro =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Registro) : {};

const texto = (valor: unknown): string | undefined =>
  typeof valor === "string" && valor.trim() ? valor.trim() : undefined;

/** Qual evento do Meta esta etapa aceita representa — ou nenhum. */
function eventoDaEtapa(data: StepInput): MetaEventName | null {
  if (data.final) return "Purchase";
  if (data.etapa_id === "planos") return "InitiateCheckout";
  return null;
}

/**
 * O evento do Meta desta etapa, com TUDO que o formulário já sabe da pessoa.
 *
 * `InitiateCheckout` na etapa do plano e `Purchase` na última — é o `Purchase`
 * que a campanha otimiza, e é aqui que ele leva mais dados: nome do documento,
 * e-mail, nascimento, endereço, CPF em hash como `external_id`. Cada campo a
 * mais sobe a correspondência no Gerenciador de Eventos.
 */
async function enviarEtapaParaMeta(
  data: StepInput,
  dados: Registro,
  request: Request,
  clientIp: string,
) {
  const nome = eventoDaEtapa(data);
  if (!nome) return;

  const planos = objeto(dados["planos"]);
  const origem = objeto(dados["origem"]);
  const endereco = objeto(dados["endereco"]);
  const cadastro = objeto(dados["cadastro"]);
  const agendamento = objeto(dados["anexos_agendamento"]);
  const atribuicao = data.attribution ?? {};

  const precoTexto = texto(planos["preco"]);
  const preco = precoTexto
    ? precoNumerico(precoVigente(precoTexto, texto(planos["valor_primeiras_faturas"]) ?? null))
    : undefined;
  const codigoMk = planos["codigo_mk"];
  const idPlano = codigoMk != null ? String(codigoMk) : texto(planos["nome"]);

  await enviarEventoMeta({
    nome,
    eventId: data.metaEventId,
    pagina: data.page,
    origem: origemDaRequisicao(request),
    usuario: {
      // O nome do cadastro é o do documento; o da origem é o que a pessoa
      // digitou correndo na home. Vale o primeiro quando existe.
      nome: texto(cadastro["nome"]) ?? texto(origem["nome"]),
      telefone: texto(origem["whatsapp"]) ?? texto(cadastro["telefone"]),
      email: texto(cadastro["email"]),
      nascimento: texto(cadastro["nascimento"]),
      externalId: texto(cadastro["cpf"]),
      cidade: texto(endereco["cidade"]),
      uf: texto(endereco["uf"]),
      cep: texto(endereco["cep"]),
      fbc: data.fbc,
      fbp: data.fbp,
      fbclid: atribuicao["fbclid"],
      fbclidEm: atribuicao["first_visit_at"],
      ip: clientIp,
      userAgent: request.headers.get("user-agent"),
    },
    dados: {
      content_name: texto(planos["nome"]),
      content_ids: idPlano ? [idPlano] : undefined,
      content_type: "product",
      content_category: "internet_fibra",
      contents: idPlano ? [{ id: idPlano, quantity: 1, item_price: preco }] : undefined,
      num_items: 1,
      value: preco,
      currency: preco !== undefined ? "BRL" : undefined,
      order_id: nome === "Purchase" ? data.id_sessao : undefined,
      etapa: data.etapa_id,
      metodo_pagamento: texto(agendamento["metodo"]),
      cidade: texto(endereco["cidade"]),
      codigo_oferta: texto(planos["codigo_oferta"]),
      utm_source: atribuicao["utm_source"],
      utm_medium: atribuicao["utm_medium"],
      utm_campaign: atribuicao["utm_campaign"],
      utm_content: atribuicao["utm_content"],
    },
  });
}

export const submitContractStep = createServerFn({ method: "POST" })
  .validator(stepInputSchema)
  .handler(async ({ data }): Promise<ContractStepResult> => {
    const request = getRequest();
    const clientIp = clientIpFromHeaders(request.headers);

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

    // O token do reCAPTCHA fica no servidor — o webhook recebe só o score. Os
    // campos do Meta (cookies do Pixel e id do evento) também ficam: são do
    // evento de conversão, não do formulário.
    const {
      recaptchaToken: _token,
      anexos: _anexos,
      fbc: _fbc,
      fbp: _fbp,
      metaEventId: _metaEventId,
      dados,
      ...stepData
    } = data;
    // O teto de 64KB do `dados` inteiro não impede um único campo gigante: um
    // POST direto aqui poderia mandar 60KB de "complemento". `limitarCampos`
    // aplica campo a campo o mesmo teto que o formulário aplica na digitação.
    const dadosLimitados = limitarCampos(dados) as Record<string, unknown>;
    const dadosSaneados = neutralizeDeep(dadosLimitados) as Record<string, unknown>;

    const outcome = await postToWebhook(
      {
        formulario: FORM_ID,
        ...stepData,
        dados: dadosSaneados,
        ...(anexos?.length ? { anexos } : {}),
        submitted_at: new Date().toISOString(),
        recaptcha_score: recaptchaScore(recaptcha),
      },
      `Contract step ${data.etapa}`,
    );

    /*
     * A MESMA linha das quatro etapas, atualizada a cada uma.
     *
     * O assistente manda o retrato completo do que já foi preenchido em toda
     * etapa, e a chave é o `id_sessao` — então a etapa 3 não cria uma linha
     * nova, ela completa a que a etapa 1 abriu. É o que faz uma contratação
     * abandonada no meio ficar registrada como abandonada no meio, com o nome e
     * o telefone de quem parou.
     *
     * Grava mesmo com o webhook recusando, e pelo mesmo motivo do lead: quando
     * o n8n está fora, esta linha é o único lugar onde a contratação existe.
     * Vai para `dados` o que o webhook recebeu, e nada do que ele não recebeu —
     * o token do reCAPTCHA continua sem sair do servidor.
     */
    await registrarEnvio({
      idSessao: data.id_sessao,
      formulario: "contratacao",
      etapa: data.etapa,
      etapaId: data.etapa_id,
      totalEtapas: data.total_etapas,
      concluido: data.final,
      statusEnvio: statusDoWebhook(outcome),
      dados: { ...dadosSaneados, attribution: data.attribution ?? {}, page: data.page },
      anexos,
      ip: clientIp,
    });

    // Só a etapa ACEITA vira evento: um `Purchase` de uma contratação que o
    // webhook recusou ensinaria a campanha a procurar quem não contratou. Lê
    // os dados antes da neutralização de fórmula — "+55..." precisa chegar ao
    // Meta sem o apóstrofo.
    if (outcome.ok) await enviarEtapaParaMeta(data, dadosLimitados, request, clientIp);

    return outcome;
  });
