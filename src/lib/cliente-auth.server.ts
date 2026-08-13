/**
 * Lógica de autenticação da área do cliente (só servidor).
 *
 * Os invólucros RPC ficam em `cliente-auth.ts`; aqui está o que de fato decide
 * quem entra. Três regras valem para todos os eventos:
 *
 * 1. O `id_cliente` nunca vem do formulário — sai do cookie de desafio, que é
 *    selado. Assim ninguém troca de cliente no meio do login, e a mesma regra
 *    serve de base para as ações do painel mais adiante.
 * 2. Contato completo não chega ao navegador: celular e e-mail são mascarados
 *    aqui mesmo, inclusive quando o webhook os devolve inteiros.
 * 3. Falha fechado — sem webhook ou sem `SESSION_SECRET` configurados, nada é
 *    liberado.
 */

import { getRequestIP } from "@tanstack/react-start/server";
import { randomUUID } from "node:crypto";

import { isLikelyBot, verifyRecaptcha, type RecaptchaResult } from "./verify-recaptcha";
import { postToPainelWebhook, type WebhookOutcomeWithData } from "./webhook";
import {
  blockedMessage,
  checkRateLimit,
  clearRateLimit,
  porIdentificador,
  porIp,
  registerFailure,
} from "./rate-limit";
import {
  gravarDesafio,
  gravarSessao,
  lerDesafio,
  limparDesafio,
  SessaoIndisponivelError,
} from "./cliente-sessao.server";
import type {
  CanaisDisponiveis,
  ContatosMascarados,
  DesafioCliente,
  EtapaDocumentoOk,
  LoginConcluido,
  LoginErro,
  MensagemOk,
} from "./cliente-tipos";

const ERRO_GENERICO = "Não foi possível concluir o acesso agora. Tente novamente em instantes.";
const ERRO_INDISPONIVEL =
  "A área do cliente está indisponível no momento. Fale com nosso atendimento pelo WhatsApp.";
const ERRO_DESAFIO_EXPIRADO = "Sua tentativa expirou. Recomece informando seu documento.";
const ERRO_ROBO =
  "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.";
const ERRO_CODIGO = "Código inválido. Confira e digite de novo.";
const ERRO_CREDENCIAIS = "Login ou senha incorretos.";

/* ---------------- máscaras defensivas ---------------- */

/** `nome@gmail.com` -> `no*****@g****.com` */
export function mascararEmail(valor: string): string {
  const email = valor.trim();
  const at = email.lastIndexOf("@");
  if (at < 1) return "*****";

  const usuario = email.slice(0, at);
  const dominio = email.slice(at + 1);
  const ponto = dominio.lastIndexOf(".");
  const inicioUsuario = usuario.slice(0, 2);
  if (ponto < 1) return `${inicioUsuario}*****@*****`;

  return `${inicioUsuario}*****@${dominio.slice(0, 1)}****${dominio.slice(ponto)}`;
}

/** `49999991234` -> `(49)*******234` */
export function mascararTelefone(valor: string): string {
  const d = valor.replace(/\D/g, "");
  // descarta o DDI quando vier junto
  const nacional = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (nacional.length < 5) return "*****";
  return `(${nacional.slice(0, 2)})*******${nacional.slice(-3)}`;
}

/** `12345678901` -> `123.***.***-01`, só para exibir no painel. */
export function mascararDocumento(valor: string): string {
  const d = onlyDigits(valor);
  if (d.length === 11) return `${d.slice(0, 3)}.***.***-${d.slice(-2)}`;
  if (d.length === 14) return `${d.slice(0, 2)}.***.***/****-${d.slice(-2)}`;
  return d.length > 4 ? `***${d.slice(-3)}` : "***";
}

/** Já mascarado pelo n8n? Então não mexe — só garante que nunca passe inteiro. */
const jaMascarado = (valor: string) => valor.includes("*");

/* ---------------- leitura tolerante da resposta ---------------- */

const asString = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "1", "sim", "yes"].includes(v.trim().toLowerCase());
  if (typeof v === "number") return v === 1;
  return false;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Aceita os canais aninhados em `canais` ou soltos no topo da resposta. */
function lerCanais(data: Record<string, unknown>): CanaisDisponiveis {
  const canais = asRecord(data["canais"]);
  const pegar = (chave: string) => asBool(canais[chave] ?? data[chave]);
  return { sms: pegar("sms"), whatsapp: pegar("whatsapp"), email: pegar("email") };
}

/** Mascara aqui o que o webhook não tiver mascarado. */
function lerContatos(data: Record<string, unknown>): ContatosMascarados {
  const contatos = asRecord(data["contatos"]);
  const celular =
    asString(contatos["celular"]) ??
    asString(contatos["telefone"]) ??
    asString(contatos["whatsapp"]) ??
    asString(data["celular"]);
  const email = asString(contatos["email"]) ?? asString(data["email"]);

  return {
    ...(celular ? { celular: jaMascarado(celular) ? celular : mascararTelefone(celular) } : {}),
    ...(email ? { email: jaMascarado(email) ? email : mascararEmail(email) } : {}),
  };
}

function lerIdCliente(data: Record<string, unknown>): string | undefined {
  const cliente = asRecord(data["cliente"]);
  const bruto =
    data["id_cliente"] ?? data["idCliente"] ?? data["id"] ?? cliente["id"] ?? cliente["id_cliente"];
  if (typeof bruto === "number") return String(bruto);
  return asString(bruto);
}

function lerNomeCliente(data: Record<string, unknown>): string {
  const cliente = asRecord(data["cliente"]);
  return asString(cliente["nome"]) ?? asString(data["nome"]) ?? "cliente";
}

/* ---------------- envelope e helpers comuns ---------------- */

type Evento =
  "documento_cliente" | "acesso_sac" | "envio_codigo" | "verificacao_codigo" | "solicitacao_login";

function envelope(evento: Evento, dados: Record<string, unknown>, recaptcha: RecaptchaResult) {
  return {
    evento,
    id_sessao: randomUUID(),
    id_requisicao: randomUUID(),
    page: "/cliente",
    submitted_at: new Date().toISOString(),
    recaptcha_score: recaptcha?.score ?? null,
    dados,
  };
}

/** IP de origem, atrás do proxy do EasyPanel. */
const chaveIp = () => porIp(getRequestIP({ xForwardedFor: true }));

const erro = (mensagem: string): LoginErro => ({ ok: false, mensagem });

/** A mensagem do webhook manda; o texto genérico é só o fallback. */
const mensagemDoWebhook = (mensagem: string | undefined, padrao: string) =>
  mensagem?.trim() ? mensagem.trim() : padrao;

/** Falta de configuração tem mensagem própria, para não confundir com credencial errada. */
const mensagemDeFalha = (resultado: WebhookOutcomeWithData, padrao: string) =>
  mensagemDoWebhook(
    resultado.message,
    resultado.reason === "not_configured" ? ERRO_INDISPONIVEL : padrao,
  );

const onlyDigits = (v: string) => v.replace(/\D/g, "");

/* ---------------- entradas ---------------- */

export type DocumentoInput = {
  tipoDocumento: "cpf" | "cnpj";
  documento: string;
  recaptchaToken?: string | undefined;
};

export type CanalInput = {
  metodo: "sms" | "whatsapp" | "email";
  recaptchaToken?: string | undefined;
};

export type CodigoInput = { codigo: string; recaptchaToken?: string | undefined };

export type SacInput = { login: string; senha: string; recaptchaToken?: string | undefined };

export type SolicitacaoInput = {
  tipoDocumento: "cpf" | "cnpj";
  documento: string;
  metodo: "whatsapp" | "email";
  recaptchaToken?: string | undefined;
};

/* ---------------- etapa 1: documento ---------------- */

/**
 * Confere o documento no n8n e abre o desafio. A resposta ao navegador leva só
 * os canais disponíveis e os contatos mascarados — o `id_cliente` fica no
 * cookie selado.
 */
export async function iniciarAcessoDocumentoServer(
  data: DocumentoInput,
): Promise<EtapaDocumentoOk | LoginErro> {
  const documento = onlyDigits(data.documento);
  const chaves = [porIdentificador(`documento:${documento}`), chaveIp()];

  const bloqueio = checkRateLimit(chaves);
  if (bloqueio.blocked) return erro(blockedMessage(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(data.recaptchaToken);
  if (isLikelyBot(recaptcha)) {
    console.error("Acesso por documento bloqueado pelo reCAPTCHA");
    return erro(ERRO_ROBO);
  }

  const resultado = await postToPainelWebhook(
    envelope("documento_cliente", { tipo_documento: data.tipoDocumento, documento }, recaptcha),
    "Área do cliente (documento)",
  );

  if (!resultado.ok) {
    const falha = registerFailure(chaves);
    if (falha.blocked) return erro(blockedMessage(falha.retryAfterSeconds));
    return erro(mensagemDeFalha(resultado, ERRO_GENERICO));
  }

  const idCliente = lerIdCliente(resultado.data);
  if (!idCliente) {
    console.error("Webhook aceitou o documento sem devolver id_cliente");
    return erro(ERRO_INDISPONIVEL);
  }

  const canais = lerCanais(resultado.data);
  if (!canais.sms && !canais.whatsapp && !canais.email) {
    return erro(
      mensagemDoWebhook(
        resultado.message,
        "Não há telefone nem e-mail no seu cadastro para enviarmos o código. Fale com nosso atendimento pelo WhatsApp.",
      ),
    );
  }

  const contatos = lerContatos(resultado.data);
  try {
    await gravarDesafio({ idCliente, documento, canais, contatos, tentativas: 0 });
  } catch (err) {
    if (err instanceof SessaoIndisponivelError) return erro(ERRO_INDISPONIVEL);
    throw err;
  }

  clearRateLimit(chaves);
  return { ok: true, mensagem: resultado.message, canais, contatos };
}

/* ---------------- etapa 2: envio do código ---------------- */

/** Pede ao n8n que gere e envie o código pelo canal escolhido. */
export async function enviarCodigoServer(data: CanalInput): Promise<MensagemOk | LoginErro> {
  const desafio = await lerDesafio();
  if (!desafio) return erro(ERRO_DESAFIO_EXPIRADO);

  if (!desafio.canais[data.metodo]) {
    return erro("Esse canal não está disponível no seu cadastro.");
  }

  const chaves = [porIdentificador(`envio:${desafio.idCliente}`), chaveIp()];
  const bloqueio = checkRateLimit(chaves);
  if (bloqueio.blocked) return erro(blockedMessage(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(data.recaptchaToken);
  if (isLikelyBot(recaptcha)) return erro(ERRO_ROBO);

  const resultado = await postToPainelWebhook(
    envelope(
      "envio_codigo",
      { id_cliente: desafio.idCliente, documento: desafio.documento, metodo: data.metodo },
      recaptcha,
    ),
    "Área do cliente (envio do código)",
  );

  if (!resultado.ok) {
    const falha = registerFailure(chaves);
    if (falha.blocked) return erro(blockedMessage(falha.retryAfterSeconds));
    return erro(mensagemDeFalha(resultado, ERRO_GENERICO));
  }

  // trocar de canal recomeça a contagem de códigos errados
  const atualizado: DesafioCliente = { ...desafio, canalEscolhido: data.metodo, tentativas: 0 };
  try {
    await gravarDesafio(atualizado);
  } catch (err) {
    if (err instanceof SessaoIndisponivelError) return erro(ERRO_INDISPONIVEL);
    throw err;
  }

  return { ok: true, mensagem: resultado.message };
}

/* ---------------- etapa 3: verificação do código ---------------- */

/** Confere o código no n8n e, aceito, cria a sessão. */
export async function verificarCodigoServer(
  data: CodigoInput,
): Promise<LoginConcluido | LoginErro> {
  const desafio = await lerDesafio();
  if (!desafio) return erro(ERRO_DESAFIO_EXPIRADO);
  if (!desafio.canalEscolhido) return erro("Escolha antes por onde receber o código.");

  const chaves = [porIdentificador(`codigo:${desafio.idCliente}`), chaveIp()];
  const bloqueio = checkRateLimit(chaves);
  if (bloqueio.blocked) return erro(blockedMessage(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(data.recaptchaToken);
  if (isLikelyBot(recaptcha)) return erro(ERRO_ROBO);

  const resultado = await postToPainelWebhook(
    envelope(
      "verificacao_codigo",
      {
        id_cliente: desafio.idCliente,
        documento: desafio.documento,
        metodo: desafio.canalEscolhido,
        codigo: onlyDigits(data.codigo),
      },
      recaptcha,
    ),
    "Área do cliente (verificação do código)",
  );

  if (!resultado.ok) {
    const falha = registerFailure(chaves);
    // o desafio pode ter expirado nesse meio-tempo; o bloqueio acima já responde
    await gravarDesafio({ ...desafio, tentativas: desafio.tentativas + 1 }).catch(() => {});
    if (falha.blocked) {
      await limparDesafio();
      return erro(blockedMessage(falha.retryAfterSeconds));
    }
    return erro(mensagemDeFalha(resultado, ERRO_CODIGO));
  }

  const nome = lerNomeCliente(resultado.data);
  try {
    await gravarSessao({
      idCliente: desafio.idCliente,
      nome,
      documento: mascararDocumento(desafio.documento),
      metodo: "documento",
    });
  } catch (err) {
    if (err instanceof SessaoIndisponivelError) return erro(ERRO_INDISPONIVEL);
    throw err;
  }

  await limparDesafio();
  clearRateLimit(chaves);
  return { ok: true, mensagem: resultado.message, nome };
}

/* ---------------- método 2: login e senha do SAC ---------------- */

/** Login direto por credenciais do SAC — sem código, por decisão do projeto. */
export async function acessarSacServer(data: SacInput): Promise<LoginConcluido | LoginErro> {
  const login = data.login.trim();
  const chaves = [porIdentificador(`sac:${login.toLowerCase()}`), chaveIp()];

  const bloqueio = checkRateLimit(chaves);
  if (bloqueio.blocked) return erro(blockedMessage(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(data.recaptchaToken);
  if (isLikelyBot(recaptcha)) return erro(ERRO_ROBO);

  const resultado = await postToPainelWebhook(
    envelope("acesso_sac", { login, senha: data.senha }, recaptcha),
    "Área do cliente (SAC)",
  );

  if (!resultado.ok) {
    const falha = registerFailure(chaves);
    if (falha.blocked) return erro(blockedMessage(falha.retryAfterSeconds));
    return erro(mensagemDeFalha(resultado, ERRO_CREDENCIAIS));
  }

  const idCliente = lerIdCliente(resultado.data);
  if (!idCliente) {
    console.error("Webhook aceitou o acesso SAC sem devolver id_cliente");
    return erro(ERRO_INDISPONIVEL);
  }

  const nome = lerNomeCliente(resultado.data);
  const documento = asString(asRecord(resultado.data["cliente"])["documento"]);
  try {
    await gravarSessao({
      idCliente,
      nome,
      documento: documento ? mascararDocumento(documento) : login,
      metodo: "sac",
    });
  } catch (err) {
    if (err instanceof SessaoIndisponivelError) return erro(ERRO_INDISPONIVEL);
    throw err;
  }

  clearRateLimit(chaves);
  return { ok: true, mensagem: resultado.message, nome };
}

/* ---------------- solicitação de login e senha ---------------- */

/** Pede ao n8n o envio das credenciais do SAC pelo WhatsApp ou e-mail. */
export async function solicitarLoginServer(
  data: SolicitacaoInput,
): Promise<MensagemOk | LoginErro> {
  const documento = onlyDigits(data.documento);
  const chaves = [porIdentificador(`solicitacao:${documento}`), chaveIp()];

  const bloqueio = checkRateLimit(chaves);
  if (bloqueio.blocked) return erro(blockedMessage(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(data.recaptchaToken);
  if (isLikelyBot(recaptcha)) return erro(ERRO_ROBO);

  const resultado = await postToPainelWebhook(
    envelope(
      "solicitacao_login",
      { tipo_documento: data.tipoDocumento, documento, metodo: data.metodo },
      recaptcha,
    ),
    "Área do cliente (solicitação de login)",
  );

  if (!resultado.ok) {
    const falha = registerFailure(chaves);
    if (falha.blocked) return erro(blockedMessage(falha.retryAfterSeconds));
    return erro(mensagemDeFalha(resultado, ERRO_GENERICO));
  }

  clearRateLimit(chaves);
  return {
    ok: true,
    mensagem: mensagemDoWebhook(
      resultado.message,
      "Se o documento estiver no nosso cadastro, seus dados de acesso foram enviados.",
    ),
  };
}
