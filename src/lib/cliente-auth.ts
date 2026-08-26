/**
 * Server functions da área do cliente — a ponte entre o formulário e a lógica
 * de `cliente-auth.server.ts`.
 *
 * O navegador nunca fala com o n8n: tudo passa por aqui, já protegido contra
 * requisições de outros sites pelo middleware CSRF de `src/start.ts`. O token
 * de acesso emitido no login também mora só deste lado — ele é acrescentado às
 * chamadas do painel aqui no servidor, a partir do cookie selado, e nenhuma
 * dessas funções o aceita como parâmetro.
 *
 * Este arquivo é importado pelo componente de login, então não pode conter nada
 * de servidor fora dos handlers — daí a lógica morar nos módulos `.server.ts`,
 * que o bundle do cliente recusaria.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { LIMITE } from "./form-limits";
import {
  acessarComSenhaServer,
  consultarPainelServer,
  enviarCodigoServer,
  esquecerPainelServer,
  enviarFormularioPainelServer,
  iniciarAcessoDocumentoServer,
  solicitarLoginServer,
  verificarCodigoServer,
} from "./cliente-auth.server";
import { lerSessao, limparDesafio, limparSessao } from "./cliente-sessao.server";
import type {
  EtapaDocumentoOk,
  LoginConcluido,
  LoginErro,
  MensagemOk,
  PainelErro,
  PainelOk,
  SessaoPublica,
  ValorJson,
} from "./cliente-tipos";

/* ---------------- schemas ---------------- */

const documentoSchema = z.object({
  tipoDocumento: z.enum(["cpf", "cnpj"]),
  documento: z.string().min(11).max(LIMITE.documento),
  recaptchaToken: z.string().optional(),
});

const canalSchema = z.object({
  metodo: z.enum(["sms", "whatsapp", "email"]),
  recaptchaToken: z.string().optional(),
});

const codigoSchema = z.object({
  codigo: z.string().min(4).max(LIMITE.codigoVerificacao),
  recaptchaToken: z.string().optional(),
});

/*
 * Login e senha do SAC. Os dois são de formato livre — quem define o que vale é
 * o SAC, não esta tela. Os tetos existem só para não empurrar 100 KB de texto
 * ao n8n; quem diz se as credenciais existem é o cadastro.
 */
const senhaSchema = z.object({
  login: z.string().min(1).max(LIMITE.login),
  senha: z.string().min(1).max(LIMITE.senha),
  recaptchaToken: z.string().optional(),
});

const solicitacaoSchema = z.object({
  tipoDocumento: z.enum(["cpf", "cnpj"]),
  documento: z.string().min(11).max(LIMITE.documento),
  metodo: z.enum(["whatsapp", "email"]),
  recaptchaToken: z.string().optional(),
});

/* ---------------- login ---------------- */

/** Etapa 1 do acesso por documento: confere o cadastro e abre o desafio. */
export const iniciarAcessoDocumento = createServerFn({ method: "POST" })
  .validator(documentoSchema)
  .handler(async ({ data }): Promise<EtapaDocumentoOk | LoginErro> =>
    iniciarAcessoDocumentoServer(data),
  );

/** Etapa 2: envia o código pelo canal escolhido. */
export const enviarCodigo = createServerFn({ method: "POST" })
  .validator(canalSchema)
  .handler(async ({ data }): Promise<MensagemOk | LoginErro> => enviarCodigoServer(data));

/** Etapa 3: confere o código e cria a sessão. */
export const verificarCodigo = createServerFn({ method: "POST" })
  .validator(codigoSchema)
  .handler(async ({ data }): Promise<LoginConcluido | LoginErro> => verificarCodigoServer(data));

/** Método 2: login e senha do SAC, conferidos pelo n8n. */
export const acessarComSenha = createServerFn({ method: "POST" })
  .validator(senhaSchema)
  .handler(async ({ data }): Promise<LoginConcluido | LoginErro> => acessarComSenhaServer(data));

/** Envia os dados de acesso pelo WhatsApp ou e-mail do cadastro. */
export const solicitarLogin = createServerFn({ method: "POST" })
  .validator(solicitacaoSchema)
  .handler(async ({ data }): Promise<MensagemOk | LoginErro> => solicitarLoginServer(data));

/* ---------------- sessão ---------------- */

/**
 * Usada pelas rotas para saber se há sessão válida.
 *
 * Devolve tudo menos o token: o resultado atravessa a fronteira para o
 * navegador, e o token é a credencial que abre os dados do cliente no n8n.
 * Ele fica no cookie selado e é acrescentado às chamadas aqui no servidor.
 */
export const getSessaoCliente = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessaoPublica | null> => {
    const sessao = await lerSessao();
    if (!sessao) return null;
    const { token, ...publica } = sessao;
    void token;
    return publica;
  },
);

/**
 * Encerra a sessão e o desafio em andamento.
 *
 * O retrato do painel guardado na memória do servidor sai junto: manter os
 * dados de quem acabou de sair seria guardar o que ninguém pediu para guardar.
 */
export const logoutCliente = createServerFn({ method: "POST" }).handler(async () => {
  const sessao = await lerSessao();
  if (sessao) await esquecerPainelServer(sessao.idCliente);
  await limparSessao();
  await limparDesafio();
  return { ok: true };
});

/* ---------------- painel (já autenticado pelo token) ---------------- */

const consultaSchema = z.object({
  // nomes simples: a seção decide o evento e é o que o n8n usa para rotear
  secao: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_-]+$/i),
  /** Pula o cache do servidor — usado pelo botão de atualizar da tela. */
  forcar: z.boolean().optional(),
  recaptchaToken: z.string().optional(),
});

/*
 * Os campos do formulário. O conteúdo é livre — cada tela do painel manda o
 * seu, e quem valida campo a campo é o n8n —, mas o formato é fechado em JSON
 * simples: nada de `unknown`, que as server functions recusam serializar.
 */
const valorJsonSchema: z.ZodType<ValorJson> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(valorJsonSchema),
    z.record(valorJsonSchema),
  ]),
);

const formularioSchema = z.object({
  formulario: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_-]+$/i),
  dados: z.record(valorJsonSchema),
  recaptchaToken: z.string().optional(),
});

/**
 * Lê uma seção do painel. O token da sessão vai junto, no servidor.
 *
 * `secao: "bootstrap"` é a chamada de abertura: sai uma vez logo depois do
 * login e traz o painel inteiro numa ida só.
 */
export const consultarPainel = createServerFn({ method: "POST" })
  .validator(consultaSchema)
  .handler(async ({ data }): Promise<PainelOk | PainelErro> => consultarPainelServer(data));

/** Envia um formulário da área do cliente, com o token da sessão junto. */
export const enviarFormularioPainel = createServerFn({ method: "POST" })
  .validator(formularioSchema)
  .handler(async ({ data }): Promise<PainelOk | PainelErro> => enviarFormularioPainelServer(data));
