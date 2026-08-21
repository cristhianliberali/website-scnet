/**
 * Lógica de autenticação da área do cliente (só servidor).
 *
 * Tudo passa pelo n8n, no `WEBHOOK_LOGIN_URL`. São dois caminhos de entrada:
 *
 * - **Documento do cadastro + código** (SMS, WhatsApp ou e-mail). O documento é
 *   a referência inicial do cliente: é ele que diz quais canais existem e para
 *   onde o código pode ir.
 * - **Login e senha do SAC**, conferidos pelo n8n contra o cadastro.
 *
 * Os dois terminam igual: o n8n emite um **token de acesso temporário**, que
 * fica no cookie selado deste servidor e acompanha toda consulta e todo
 * formulário do painel daí em diante. Nenhuma resposta do n8n — e o token menos
 * ainda — chega ao navegador.
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
import { lerToken } from "./token-acesso";
import { carregarPainelDoBanco } from "./painel-db.server";
import { env } from "./postgres.server";
import {
  gravarCachePainel,
  invalidarCachePainel,
  lerCachePainel,
  limparCachePainel,
} from "./painel-cache.server";
import {
  CONSULTAS_PAINEL,
  FORMULARIOS_PAINEL,
  SECOES_AFETADAS,
  type FormularioPainel,
  type SecaoPainel,
} from "./painel-tipos";
import {
  gravarDesafio,
  gravarSessao,
  lerDesafio,
  lerSessao,
  limparSessao,
  limparDesafio,
  renovarToken,
  SessaoIndisponivelError,
} from "./cliente-sessao.server";
import type {
  CanaisDisponiveis,
  ContatosMascarados,
  DesafioCliente,
  EtapaDocumentoOk,
  LoginConcluido,
  LoginErro,
  DadosPainel,
  MensagemOk,
  PainelErro,
  PainelOk,
  TokenAcesso,
} from "./cliente-tipos";

const ERRO_GENERICO = "Não foi possível concluir o acesso agora. Tente novamente em instantes.";
const ERRO_INDISPONIVEL =
  "A área do cliente está indisponível no momento. Fale com nosso atendimento pelo WhatsApp.";
const ERRO_DESAFIO_EXPIRADO = "Sua tentativa expirou. Recomece informando seu documento.";
const ERRO_ROBO =
  "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.";
const ERRO_CODIGO = "Código inválido. Confira e digite de novo.";
const ERRO_CREDENCIAIS = "Login ou senha incorretos.";
const ERRO_SESSAO_EXPIRADA = "Sua sessão expirou. Entre novamente para continuar.";

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

type EventoLogin =
  | "documento_cliente"
  | "envio_codigo"
  | "verificacao_codigo"
  | "acesso_senha"
  | "solicitacao_login";

/**
 * Os eventos do painel: um por consulta e um por formulário.
 *
 * Assim o Switch do n8n roteia direto por `evento`, sem precisar abrir `dados`
 * para descobrir do que a chamada trata. Os dois nomes genéricos
 * (`consulta_painel` e `formulario_painel`) continuam valendo: uma seção ou um
 * formulário fora do registro cai neles, e um fluxo antigo segue funcionando.
 */
type EventoPainel = (typeof FORMULARIOS_PAINEL)[FormularioPainel] | "formulario_painel";

type Evento = EventoLogin | EventoPainel;

function envelope(
  evento: Evento,
  dados: Record<string, unknown>,
  recaptcha: RecaptchaVerdict,
  /** Presente só nas chamadas já autenticadas do painel. */
  autenticacao?: { token: string; idCliente: string },
) {
  return {
    evento,
    id_sessao: randomUUID(),
    id_requisicao: randomUUID(),
    page: "/cliente",
    submitted_at: new Date().toISOString(),
    recaptcha_score: recaptchaScore(recaptcha),
    /*
     * O token vai no corpo, e não num header, de propósito: o corpo é o que a
     * assinatura HMAC cobre. Num header ele ficaria fora da assinatura e
     * poderia ser trocado no caminho sem invalidar nada.
     */
    ...(autenticacao ? { token: autenticacao.token, id_cliente: autenticacao.idCliente } : {}),
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
  /** Login do SAC, como o cliente digitou. Formato livre. */
  login: string;
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

  /*
   * Código certo, mas sem token: o n8n aceitou e não emitiu a credencial que
   * abre os dados do cliente. Entrar assim daria uma sessão que não consulta
   * nada, então é mais honesto recusar aqui.
   */
  const token = lerToken(resultado.data);
  if (!token) {
    console.error("Webhook aceitou o código sem devolver token de acesso");
    return erro(ERRO_INDISPONIVEL);
  }

  const nome = lerNomeCliente(resultado.data);
  try {
    await gravarSessao({
      idCliente: desafio.idCliente,
      nome,
      metodo: "documento",
      token,
      documento: mascararDocumento(desafio.documento),
    });
  } catch (err) {
    if (err instanceof SessaoIndisponivelError) return erro(ERRO_INDISPONIVEL);
    throw err;
  }

  await limparDesafio();
  limparTentativas(chaves);
  aquecerPainel(desafio.idCliente);
  return { ok: true, mensagem: resultado.message, nome };
}

/* ---------------- método 2: login e senha do SAC ---------------- */

/**
 * Login pelas credenciais do SAC, conferidas pelo n8n — sem código, por decisão
 * do projeto.
 *
 * O login é de **formato livre**: é o mesmo que o cliente usa no SAC, e o SAC
 * não impõe forma nenhuma. Por isso não há validação de formato aqui — quem
 * sabe se existe é o cadastro, e a única resposta possível para um login que
 * não existe é a mesma de uma senha errada.
 *
 * Termina igual ao login por documento: o n8n devolve o cliente e o token de
 * acesso, e a sessão selada guarda os dois.
 */
export async function acessarComSenhaServer(data: SenhaInput): Promise<LoginConcluido | LoginErro> {
  const login = data.login.trim();
  if (!login) return erro(ERRO_CREDENCIAIS);

  /*
   * A chave de tentativas usa o login em minúsculas para que `Maria` e `maria`
   * contem juntos — do contrário bastaria alternar a caixa para reiniciar o
   * contador de três falhas.
   */
  const chaves = [porIdentificador(`sac:${login.toLowerCase()}`), chaveIp()];
  const bloqueio = checkTentativas(chaves);
  if (bloqueio.blocked) return erro(mensagemDeBloqueio(bloqueio.retryAfterSeconds));

  const recaptcha = await verifyRecaptcha(data.recaptchaToken, "cliente_senha", ipOrigem());
  if (isLikelyBot(recaptcha)) {
    console.error("Acesso por login e senha bloqueado pelo reCAPTCHA");
    return erro(ERRO_ROBO);
  }

  const resultado = await postToPainelWebhook(
    envelope("acesso_senha", { login, senha: data.senha }, recaptcha),
    "Área do cliente (login e senha)",
  );

  if (!resultado.ok) {
    /*
     * Webhook fora do ar não gasta a cota de três tentativas de quem sabe a
     * senha: quem errou foi o serviço, não o cliente.
     */
    if (resultado.reason === "not_configured" || resultado.reason === "network_error") {
      return erro(mensagemDeFalha(resultado, ERRO_INDISPONIVEL));
    }
    const falha = registrarFalha(chaves);
    if (falha.blocked) return erro(mensagemDeBloqueio(falha.retryAfterSeconds));
    return erro(mensagemDeFalha(resultado, ERRO_CREDENCIAIS));
  }

  const idCliente = lerIdCliente(resultado.data);
  if (!idCliente) {
    console.error("Webhook aceitou o login sem devolver id_cliente");
    return erro(ERRO_INDISPONIVEL);
  }

  const token = lerToken(resultado.data);
  if (!token) {
    console.error("Webhook aceitou o login sem devolver token de acesso");
    return erro(ERRO_INDISPONIVEL);
  }

  const nome = lerNomeCliente(resultado.data);
  const documento = asString(asRecord(resultado.data["cliente"])["documento"]);
  try {
    await gravarSessao({
      idCliente,
      nome,
      metodo: "senha",
      token,
      // sem documento no cadastro, o próprio login identifica a sessão na tela
      documento: documento ? mascararDocumento(documento) : undefined,
      contato: documento ? undefined : login,
    });
  } catch (err) {
    if (err instanceof SessaoIndisponivelError) return erro(ERRO_INDISPONIVEL);
    throw err;
  }

  limparTentativas(chaves);
  aquecerPainel(idCliente);
  return { ok: true, mensagem: resultado.message, nome };
}

/* ---------------- solicitação de acesso ---------------- */

/**
 * Pede ao n8n que envie os dados de acesso pelo WhatsApp ou e-mail do cadastro.
 *
 * A entrada aqui é o documento, e não o e-mail: quem esqueceu a senha costuma
 * não lembrar com qual e-mail se cadastrou. Do lado do n8n, o fluxo deve
 * redefinir a credencial no cadastro antes de mandar a mensagem, e responder
 * `ok` mesmo quando o documento não existe — confirmar que um CPF está na base
 * entrega essa informação a quem só sabe testar documentos.
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

/* ---------------- painel: chamadas já autenticadas ---------------- */

/**
 * Consultas e formulários do painel, com o token de acesso junto.
 *
 * É o motivo de o token existir: depois do login, é ele — e não o `id_cliente`
 * — que autoriza o n8n a devolver dados do cliente. O `id_cliente` vai junto
 * por conveniência do fluxo, mas quem manda é o token, e o n8n deve conferir
 * que os dois pertencem um ao outro em vez de confiar no id que recebeu.
 *
 * O token sai do cookie selado, nunca do formulário. Uma requisição do
 * navegador não tem como escolher em nome de quem fala.
 */

const erroPainel = (mensagem: string, expirado = false): PainelErro => ({
  ok: false,
  mensagem,
  ...(expirado ? { expirado: true } : {}),
});

/** Status com que o n8n avisa que o token morreu, além do 401. */
const STATUS_TOKEN_MORTO = new Set([
  "token_invalido",
  "token_expirado",
  "nao_autorizado",
  "unauthorized",
  "expirado",
]);

function tokenRecusado(resultado: WebhookOutcomeWithData): boolean {
  if (resultado.httpStatus === 401 || resultado.httpStatus === 403) return true;
  const status = resultado.status?.trim().toLowerCase();
  if (status && STATUS_TOKEN_MORTO.has(status)) return true;
  return asBool(resultado.data["token_expirado"]) || asBool(resultado.data["expirado"]);
}

/**
 * Onde ficam os dados úteis da resposta: `dados`, ou o próprio corpo.
 *
 * O `as DadosPainel` é seguro pela origem: `resultado.data` saiu de um
 * `JSON.parse` do corpo do webhook, já limitado a 64 KB por `readBounded`.
 */
function lerDadosPainel(data: Record<string, unknown>): DadosPainel {
  const dados = asRecord(data["dados"]);
  if (Object.keys(dados).length > 0) return dados as DadosPainel;

  // sem `dados`, devolve o corpo sem os campos de protocolo
  const { status, Status, mensagem, message, token, ...resto } = data;
  void status;
  void Status;
  void mensagem;
  void message;
  void token;
  return resto as DadosPainel;
}

type ChamadaPainel = {
  evento: EventoPainel;
  /**
   * O nome antigo do mesmo evento, para quando o n8n não conhecer o novo.
   * Veja `modoEventos()`.
   */
  eventoGenerico: "formulario_painel";
  dados: Record<string, unknown>;
  label: string;
  acaoRecaptcha: string;
  recaptchaToken?: string | undefined;
  /** Formulário: o que derrubar do cache quando o envio der certo. */
  invalidar?: readonly SecaoPainel[] | undefined;
};

/**
 * Como o site nomeia os eventos do painel.
 *
 * O site manda um evento por assunto (`painel_bootstrap`,
 * `painel_abrir_chamado`, ...), mas um workflow do n8n que ainda não tenha
 * esses ramos só conhece os dois nomes antigos — e responde "Evento não
 * reconhecido" a todo o resto, o que derruba o painel inteiro.
 *
 *   auto        (padrão) tenta o específico e, se o n8n recusar, refaz com o
 *               genérico e passa a usar o genérico daí em diante
 *   especificos só o nome novo, sem rede de proteção
 *   genericos   só os nomes antigos — para quem ainda não criou os ramos
 */
type ModoEventos = "auto" | "especificos" | "genericos";

function modoEventos(): ModoEventos {
  const escolha = env("PAINEL_EVENTOS")?.toLowerCase();
  if (escolha === "especificos" || escolha === "especifico") return "especificos";
  if (escolha === "genericos" || escolha === "generico" || escolha === "compat") {
    return "genericos";
  }
  return "auto";
}

/**
 * O que já se descobriu sobre o n8n do outro lado, em modo `auto`.
 *
 * `null` é "ainda não sei". Vive na memória do processo: o custo do
 * aprendizado é uma chamada a mais por processo, e um deploy o refaz — que é o
 * certo, porque o workflow pode ter ganhado os ramos novos nesse meio-tempo.
 */
let n8nConheceEventosNovos: boolean | null = null;

/*
 * O workflow responde `{"status":"erro","mensagem":"Evento não reconhecido."}`
 * ao que ele não sabe rotear. Casar por texto é frágil como contrato — por
 * isso `PAINEL_EVENTOS=genericos` existe: ele força o caminho compatível sem
 * depender de adivinhar a frase.
 */
const EVENTO_RECUSADO = /n[ãa]o\s+reconhecid|evento\s+desconhecid|unknown\s+event/i;

const eventoNaoReconhecido = (resultado: WebhookOutcomeWithData) =>
  EVENTO_RECUSADO.test(resultado.message ?? "");

async function chamarPainel(chamada: ChamadaPainel): Promise<PainelOk | PainelErro> {
  const sessao = await lerSessao();
  // `lerSessao` já recusa token vencido, então "sem sessão" aqui inclui
  // "o token expirou desde a última tela".
  if (!sessao) return erroPainel(ERRO_SESSAO_EXPIRADA, true);

  /*
   * Sem contador de tentativas aqui, de propósito. Ele existe para frear quem
   * adivinha credencial, e no painel já não há o que adivinhar: quem chegou
   * tem token. Contar as falhas do webhook bloquearia o cliente por 5 minutos
   * a cada soluço do n8n. O que se quer frear neste ponto é volume, e disso
   * cuida o limite por IP do middleware (`src/start.ts`).
   */
  const recaptcha = await verifyRecaptcha(
    chamada.recaptchaToken,
    chamada.acaoRecaptcha,
    ipOrigem(),
  );
  if (isLikelyBot(recaptcha)) return erroPainel(ERRO_ROBO);

  const autenticacao = { token: sessao.token.valor, idCliente: sessao.idCliente };
  const modo = modoEventos();

  /*
   * Em `auto`, depois de descobrir que o n8n não conhece os nomes novos, já se
   * manda o antigo — insistir no específico gastaria duas idas a cada clique.
   */
  const usarGenerico =
    modo === "genericos" || (modo === "auto" && n8nConheceEventosNovos === false);
  const primeiro = usarGenerico ? chamada.eventoGenerico : chamada.evento;

  let resultado = await postToPainelWebhook(
    envelope(primeiro, chamada.dados, recaptcha, autenticacao),
    chamada.label,
  );

  /*
   * O n8n não soube rotear o evento novo. Isso não é falha do cliente nem da
   * sessão: é o workflow ainda sem os ramos. Refaz com o nome antigo, que todo
   * workflow tem, e anota para não repetir a descoberta.
   */
  if (!resultado.ok && modo === "auto" && !usarGenerico && eventoNaoReconhecido(resultado)) {
    console.warn(
      `O n8n não reconheceu "${primeiro}". Repetindo como "${chamada.eventoGenerico}" e ` +
        "usando os nomes antigos daqui em diante. Para calar este aviso, crie os ramos novos " +
        "no workflow ou defina PAINEL_EVENTOS=genericos.",
    );
    n8nConheceEventosNovos = false;
    resultado = await postToPainelWebhook(
      envelope(chamada.eventoGenerico, chamada.dados, recaptcha, autenticacao),
      chamada.label,
    );
  } else if (resultado.ok && !usarGenerico) {
    n8nConheceEventosNovos = true;
  }

  if (!resultado.ok) {
    if (tokenRecusado(resultado)) {
      /*
       * O n8n revogou o token antes da hora que ele mesmo tinha dito. Derrubar
       * a sessão aqui é o que faz o cliente voltar ao login em vez de ficar
       * batendo numa parede a cada clique.
       */
      await limparSessao();
      return erroPainel(mensagemDoWebhook(resultado.message, ERRO_SESSAO_EXPIRADA), true);
    }
    /*
     * "Evento não reconhecido" é recado de configuração entre o site e o n8n,
     * não algo que o cliente possa entender ou resolver. Ele vai para o log,
     * onde alguém age; a tela recebe o texto de indisponibilidade.
     */
    if (eventoNaoReconhecido(resultado)) {
      console.error(
        `O n8n recusou o evento "${chamada.evento}" e também "${chamada.eventoGenerico}". ` +
          "O workflow precisa rotear pelo menos os nomes antigos (consulta_painel/formulario_painel).",
      );
      return erroPainel(ERRO_INDISPONIVEL);
    }
    return erroPainel(mensagemDeFalha(resultado, ERRO_GENERICO));
  }

  /*
   * Token novo em qualquer resposta troca o antigo. É assim que a validade
   * desliza enquanto o cliente usa o painel, sem um evento de renovação
   * separado — e é opcional: sem token na resposta, o atual continua valendo.
   */
  const renovado = lerToken(resultado.data);
  if (renovado) {
    await renovarToken(renovado).catch((err: unknown) => {
      // falhar a renovação não invalida a resposta que já veio
      console.error("Não foi possível renovar o token da sessão", err);
    });
  }

  const dados = lerDadosPainel(resultado.data);
  if (chamada.invalidar) invalidarCachePainel(sessao.idCliente, chamada.invalidar);

  return { ok: true, mensagem: resultado.message, dados };
}

export type ConsultaInput = {
  secao: string;
  /** Ignora o cache do servidor e vai ao n8n de novo. */
  forcar?: boolean | undefined;
  recaptchaToken?: string | undefined;
};

/**
 * Lê o painel do Postgres. É o único caminho de leitura.
 *
 * Não existe mais reserva pelo webhook. Ela existia, e foi ela que escondeu um
 * banco mal configurado por dias: quando a consulta falhava, a chamada seguia
 * para o n8n em silêncio, e a tela carregava **vazia** — como se o cliente não
 * tivesse contrato nenhum — em vez de dizer que não conseguiu ler. Falhar
 * visível é melhor que suceder errado.
 *
 * O webhook continua dono das **ações**: abrir chamado, trocar de plano, gerar
 * segunda via. Isso ele faz em sistemas que o site não alcança.
 */
async function lerPainel(forcar: boolean): Promise<PainelOk | PainelErro> {
  const sessao = await lerSessao();
  if (!sessao) return erroPainel(ERRO_SESSAO_EXPIRADA, true);

  /*
   * O retrato guardado responde na hora. É o que faz abrir e fechar modais, e
   * um F5, não custarem uma ida ao banco.
   */
  if (!forcar) {
    const guardado = lerCachePainel(sessao.idCliente, "bootstrap");
    if (guardado) return { ok: true, dados: guardado };
  }

  const leitura = await carregarPainelDoBanco(sessao.idCliente);
  if (leitura.ok) {
    gravarCachePainel(sessao.idCliente, "bootstrap", leitura.dados);
    return { ok: true, dados: leitura.dados };
  }

  /*
   * Cada motivo tem a sua mensagem. Nenhuma delas manda o cliente "tentar de
   * novo" quando tentar de novo não vai adiantar.
   */
  if (leitura.motivo === "sem_conexao") {
    console.error(
      "Painel: sem conexão com o Postgres. Confira POSTGRES_URL/POSTGRES_HOST " +
        "e abra /diagnostico?token=... para ver o que o servidor enxerga.",
    );
    return erroPainel(ERRO_INDISPONIVEL);
  }

  if (leitura.motivo === "cliente_ausente") {
    return erroPainel(
      "Não encontramos seu cadastro completo. Nosso atendimento resolve isso rapidinho pelo WhatsApp.",
    );
  }

  return erroPainel(ERRO_INDISPONIVEL);
}

/**
 * Deixa o painel pronto no cache logo depois do login.
 *
 * Roda solta, sem `await`: o cliente não deve esperar por ela para entrar, e se
 * ela falhar o painel simplesmente consulta por conta própria daqui a um
 * instante. O ganho é a primeira tela já vir do cache.
 */
function aquecerPainel(idCliente: string) {
  void carregarPainelDoBanco(idCliente)
    .then((leitura) => {
      if (leitura.ok) gravarCachePainel(idCliente, "bootstrap", leitura.dados);
    })
    .catch((err: unknown) => {
      console.error("Não foi possível preparar o painel depois do login", err);
    });
}

const ehFormularioConhecido = (nome: string): nome is FormularioPainel =>
  nome in FORMULARIOS_PAINEL;

/**
 * Lê uma seção do painel no n8n.
 *
 * A seção vira o evento: `bootstrap` sai como `painel_bootstrap`, `faturas`
 * como `painel_faturas`. Uma seção fora do registro ainda funciona — vai como
 * `consulta_painel`, com o nome dela em `dados.secao` — mas não é guardada em
 * cache: sem saber o que ela contém, não dá para saber quando fica velha.
 */
export async function consultarPainelServer(data: ConsultaInput): Promise<PainelOk | PainelErro> {
  /*
   * A seção não muda mais o caminho: a leitura traz o painel inteiro do banco
   * numa consulta só, e recarregar "faturas" custaria exatamente o mesmo que
   * recarregar tudo. O nome segue aceito para as telas que já o mandam.
   */
  void data.secao;
  return lerPainel(Boolean(data.forcar));
}

export type FormularioInput = {
  formulario: string;
  dados: DadosPainel;
  recaptchaToken?: string | undefined;
};

/**
 * Envia um formulário do painel (abrir chamado, trocar de plano, indicar...).
 *
 * Cada formulário do registro tem o seu próprio evento, então o n8n roteia
 * direto por `evento` e cada ramo trata de um assunto só. `dados.formulario` e
 * `dados.campos` seguem no corpo de qualquer jeito — um fluxo que prefira um
 * único ramo genérico continua dando conta.
 *
 * Quando o envio dá certo, as seções que aquele formulário desatualiza saem do
 * cache na hora: quem acabou de trocar de plano não fica um minuto olhando
 * para o plano antigo.
 */
export async function enviarFormularioPainelServer(
  data: FormularioInput,
): Promise<PainelOk | PainelErro> {
  const formulario = data.formulario;
  const conhecido = ehFormularioConhecido(formulario);
  return chamarPainel({
    evento: conhecido ? FORMULARIOS_PAINEL[formulario] : "formulario_painel",
    eventoGenerico: "formulario_painel",
    dados: { formulario, campos: data.dados },
    label: `Área do cliente (formulário: ${formulario})`,
    acaoRecaptcha: "cliente_formulario",
    recaptchaToken: data.recaptchaToken,
    // formulário fora do registro pode ter mexido em qualquer coisa: derruba tudo
    invalidar: conhecido
      ? SECOES_AFETADAS[formulario]
      : (Object.keys(CONSULTAS_PAINEL) as SecaoPainel[]),
  });
}

/** Esquece o retrato guardado deste cliente — chamado ao encerrar a sessão. */
export async function esquecerPainelServer(idCliente: string) {
  limparCachePainel(idCliente);
}
