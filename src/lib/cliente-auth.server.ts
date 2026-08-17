/**
 * Lógica de autenticação da área do cliente (só servidor).
 *
 * São dois caminhos de entrada, com provedores diferentes de propósito:
 *
 * - **Documento do cadastro + código** (SMS, WhatsApp ou e-mail) — vai ao n8n
 *   pelo `WEBHOOK_LOGIN_URL`. Quem conhece o cadastro do provedor é o n8n, e o
 *   documento é a referência inicial do cliente: é ele que diz quais canais
 *   existem e para onde o código pode ir.
 * - **E-mail ou telefone + senha** — vai ao Supabase (`supabase.server.ts`),
 *   que guarda as credenciais e as confere.
 *
 * Os dois desembocam no mesmo lugar: o cookie selado deste servidor. Nenhum
 * token do Supabase e nenhuma resposta do n8n chegam ao navegador.
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

import { getRequest } from "@tanstack/react-start/server";
import { randomUUID } from "node:crypto";

import {
  isLikelyBot,
  recaptchaScore,
  verifyRecaptcha,
  type RecaptchaVerdict,
} from "./verify-recaptcha";
import { postToPainelWebhook, type WebhookOutcomeWithData } from "./webhook";
import { clientIpFromHeaders } from "./rate-limit";
import {
  checkTentativas,
  limparTentativas,
  mensagemDeBloqueio,
  porIdentificador,
  porIp,
  registrarFalha,
} from "./tentativas-login";
import {
  gravarDesafio,
  gravarSessao,
  lerDesafio,
  limparDesafio,
  SessaoIndisponivelError,
} from "./cliente-sessao.server";
import {
  chaveDoIdentificador,
  classificarIdentificador,
  loginComSenha,
  type Identificador,
} from "./supabase.server";
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
const ERRO_IDENTIFICADOR = "Informe o e-mail cadastrado ou o telefone com DDD.";

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

type Evento = "documento_cliente" | "envio_codigo" | "verificacao_codigo" | "solicitacao_login";

function envelope(evento: Evento, dados: Record<string, unknown>, recaptcha: RecaptchaVerdict) {
  return {
    evento,
    id_sessao: randomUUID(),
    id_requisicao: randomUUID(),
    page: "/cliente",
    submitted_at: new Date().toISOString(),
    recaptcha_score: recaptchaScore(recaptcha),
    dados,
  };
}

/** IP de origem, atrás do proxy do EasyPanel. */
const ipOrigem = () => clientIpFromHeaders(getRequest().headers);
const chaveIp = () => porIp(ipOrigem());

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

export type SenhaInput = {
  /** E-mail ou telefone, como o cliente digitou. */
  identificador: string;
  senha: string;
  recaptchaToken?: string | undefined;
};

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

  const bloqueio = checkTentativas(chaves);
  if (bloqueio.blocked) return erro(mensagemDeBloqueio(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(data.recaptchaToken, "cliente_documento", ipOrigem());
  if (isLikelyBot(recaptcha)) {
    console.error("Acesso por documento bloqueado pelo reCAPTCHA");
    return erro(ERRO_ROBO);
  }

  const resultado = await postToPainelWebhook(
    envelope("documento_cliente", { tipo_documento: data.tipoDocumento, documento }, recaptcha),
    "Área do cliente (documento)",
  );

  if (!resultado.ok) {
    const falha = registrarFalha(chaves);
    if (falha.blocked) return erro(mensagemDeBloqueio(falha.retryAfterSeconds));
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

  limparTentativas(chaves);
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
  const bloqueio = checkTentativas(chaves);
  if (bloqueio.blocked) return erro(mensagemDeBloqueio(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(data.recaptchaToken, "cliente_envio_codigo", ipOrigem());
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
    const falha = registrarFalha(chaves);
    if (falha.blocked) return erro(mensagemDeBloqueio(falha.retryAfterSeconds));
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
  const bloqueio = checkTentativas(chaves);
  if (bloqueio.blocked) return erro(mensagemDeBloqueio(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(
    data.recaptchaToken,
    "cliente_verificacao_codigo",
    ipOrigem(),
  );
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
    const falha = registrarFalha(chaves);
    // o desafio pode ter expirado nesse meio-tempo; o bloqueio acima já responde
    await gravarDesafio({ ...desafio, tentativas: desafio.tentativas + 1 }).catch(() => {});
    if (falha.blocked) {
      await limparDesafio();
      return erro(mensagemDeBloqueio(falha.retryAfterSeconds));
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
  limparTentativas(chaves);
  return { ok: true, mensagem: resultado.message, nome };
}

/* ---------------- método 2: e-mail ou telefone + senha (Supabase) ---------------- */

/** Como o contato aparece no painel — nunca inteiro. */
const contatoMascarado = (id: Identificador) =>
  id.tipo === "email" ? mascararEmail(id.email) : mascararTelefone(id.telefone);

/**
 * Login por senha, conferido no Supabase — sem código, por decisão do projeto.
 *
 * O identificador é normalizado antes de contar tentativas para que
 * `49 99999-1234`, `+5549999991234` e `(49) 99999-1234` sejam a mesma chave:
 * do contrário bastaria variar a pontuação para reiniciar o contador de três
 * falhas.
 */
export async function acessarComSenhaServer(data: SenhaInput): Promise<LoginConcluido | LoginErro> {
  const identificador = classificarIdentificador(data.identificador);
  if (!identificador) return erro(ERRO_IDENTIFICADOR);

  const chaves = [porIdentificador(`senha:${chaveDoIdentificador(identificador)}`), chaveIp()];
  const bloqueio = checkTentativas(chaves);
  if (bloqueio.blocked) return erro(mensagemDeBloqueio(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(data.recaptchaToken, "cliente_senha", ipOrigem());
  if (isLikelyBot(recaptcha)) return erro(ERRO_ROBO);

  const resultado = await loginComSenha(identificador, data.senha);
  if (!resultado.ok) {
    // Supabase fora do ar não gasta a cota de três tentativas de quem sabe a senha
    if (!resultado.credencial) return erro(resultado.mensagem);
    const falha = registrarFalha(chaves);
    if (falha.blocked) return erro(mensagemDeBloqueio(falha.retryAfterSeconds));
    return erro(resultado.mensagem);
  }

  const { id, idCliente, nome, documento } = resultado.usuario;
  try {
    await gravarSessao({
      idCliente,
      nome,
      metodo: "senha",
      idSupabase: id,
      contato: contatoMascarado(identificador),
      ...(documento ? { documento: mascararDocumento(documento) } : {}),
    });
  } catch (err) {
    if (err instanceof SessaoIndisponivelError) return erro(ERRO_INDISPONIVEL);
    throw err;
  }

  limparTentativas(chaves);
  return { ok: true, nome };
}

/* ---------------- solicitação de acesso ---------------- */

/**
 * Pede ao n8n que envie os dados de acesso pelo WhatsApp ou e-mail do cadastro.
 *
 * Continua no webhook, e não no `resetPasswordForEmail` do Supabase, por dois
 * motivos: a entrada aqui é o documento (o cliente que esqueceu a senha
 * costuma não lembrar com qual e-mail se cadastrou), e o WhatsApp, que é o canal
 * que o cliente de fato usa, o Supabase não alcança. Do lado do n8n, o fluxo
 * deve criar ou redefinir a credencial no Supabase pela chave de serviço antes
 * de mandar a mensagem.
 */
export async function solicitarLoginServer(
  data: SolicitacaoInput,
): Promise<MensagemOk | LoginErro> {
  const documento = onlyDigits(data.documento);
  const chaves = [porIdentificador(`solicitacao:${documento}`), chaveIp()];

  const bloqueio = checkTentativas(chaves);
  if (bloqueio.blocked) return erro(mensagemDeBloqueio(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(
    data.recaptchaToken,
    "cliente_solicitacao_login",
    ipOrigem(),
  );
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
    const falha = registrarFalha(chaves);
    if (falha.blocked) return erro(mensagemDeBloqueio(falha.retryAfterSeconds));
    return erro(mensagemDeFalha(resultado, ERRO_GENERICO));
  }

  limparTentativas(chaves);
  return {
    ok: true,
    mensagem: mensagemDoWebhook(
      resultado.message,
      "Se o documento estiver no nosso cadastro, seus dados de acesso foram enviados.",
    ),
  };
}
