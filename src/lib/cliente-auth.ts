/**
 * Server functions da área do cliente — a ponte entre o formulário e a lógica
 * de `cliente-auth.server.ts`.
 *
 * O navegador nunca fala com o n8n: tudo passa por aqui, já protegido contra
 * requisições de outros sites pelo middleware CSRF de `src/start.ts`. Este
 * arquivo é importado pelo componente de login, então não pode conter nada de
 * servidor fora dos handlers — daí a lógica morar nos módulos `.server.ts`, que
 * o bundle do cliente recusaria.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  acessarSacServer,
  enviarCodigoServer,
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
  SessaoCliente,
} from "./cliente-tipos";

/* ---------------- schemas ---------------- */

const documentoSchema = z.object({
  tipoDocumento: z.enum(["cpf", "cnpj"]),
  documento: z.string().min(11).max(20),
  recaptchaToken: z.string().optional(),
});

const canalSchema = z.object({
  metodo: z.enum(["sms", "whatsapp", "email"]),
  recaptchaToken: z.string().optional(),
});

const codigoSchema = z.object({
  codigo: z.string().min(4).max(10),
  recaptchaToken: z.string().optional(),
});

const sacSchema = z.object({
  login: z.string().min(1).max(120),
  senha: z.string().min(1).max(120),
  recaptchaToken: z.string().optional(),
});

const solicitacaoSchema = z.object({
  tipoDocumento: z.enum(["cpf", "cnpj"]),
  documento: z.string().min(11).max(20),
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

/** Método 2: login e senha do SAC, sem código. */
export const acessarSac = createServerFn({ method: "POST" })
  .validator(sacSchema)
  .handler(async ({ data }): Promise<LoginConcluido | LoginErro> => acessarSacServer(data));

/** Envia as credenciais do SAC pelo WhatsApp ou e-mail do cadastro. */
export const solicitarLogin = createServerFn({ method: "POST" })
  .validator(solicitacaoSchema)
  .handler(async ({ data }): Promise<MensagemOk | LoginErro> => solicitarLoginServer(data));

/* ---------------- sessão ---------------- */

/** Usada pelas rotas para saber se há sessão válida. */
export const getSessaoCliente = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessaoCliente | null> => lerSessao(),
);

/** Encerra a sessão e o desafio em andamento. */
export const logoutCliente = createServerFn({ method: "POST" }).handler(async () => {
  await limparSessao();
  await limparDesafio();
  return { ok: true };
});
