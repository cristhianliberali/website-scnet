/**
 * Sessão do painel super admin (só servidor).
 *
 * Mesmo mecanismo da área do cliente — cookie selado pelo `useSession` do
 * TanStack Start, criptografado e assinado com `SESSION_SECRET` — mas com nome
 * próprio (`scnet_admin`) e prazo próprio. Separar os dois cookies não é
 * capricho: uma sessão de cliente nunca deve virar acesso de admin por engano,
 * e sair de um lado não pode derrubar o outro.
 *
 * Aqui não há token de terceiros para guardar. O selo carrega só o usuário que
 * entrou — o suficiente para saber que a pessoa passou pelo login e para
 * escrever quem foi no log.
 */

/*
 * `useSession` é um helper de requisição do TanStack Start, não um hook React —
 * a regra do eslint só reage ao prefixo "use", então não vale aqui.
 */
/* eslint-disable react-hooks/rules-of-hooks */

import {
  getCookie,
  getRequestProtocol,
  unsealSession,
  useSession,
} from "@tanstack/react-start/server";

import type { SessaoAdmin } from "./admin-tipos";

const MIN_SECRET_LENGTH = 32;
const ADMIN_COOKIE = "scnet_admin";
/** Oito horas: um turno. Depois disso, entra de novo. */
const ADMIN_MAX_AGE = 8 * 60 * 60;

export class AdminIndisponivelError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "AdminIndisponivelError";
  }
}

function secret(): string {
  const value = process.env["SESSION_SECRET"];
  if (!value || value.length < MIN_SECRET_LENGTH) {
    console.error(
      value
        ? `SESSION_SECRET tem ${value.length} caracteres — o mínimo é ${MIN_SECRET_LENGTH}.`
        : "SESSION_SECRET não configurada — o painel admin não pode criar sessão.",
    );
    throw new AdminIndisponivelError("SESSION_SECRET ausente ou curta demais.");
  }
  return value;
}

function config() {
  return {
    password: secret(),
    name: ADMIN_COOKIE,
    maxAge: ADMIN_MAX_AGE,
    // Só cookie: sem isso a sessão também poderia chegar por header.
    sessionHeader: false as const,
    cookie: {
      httpOnly: true,
      // Em http local o navegador descartaria um cookie Secure.
      secure: getRequestProtocol() === "https",
      /*
       * `strict`, e não `lax` como no cliente: o /admin não é linkado de lugar
       * nenhum e não precisa sobreviver a uma navegação vinda de fora. Com
       * `strict`, um link plantado em outro site não chega ao painel já logado.
       */
      sameSite: "strict" as const,
      path: "/",
      maxAge: ADMIN_MAX_AGE,
    },
  };
}

export async function gravarSessaoAdmin(dados: SessaoAdmin) {
  const session = await useSession<SessaoAdmin>(config());
  await session.update(dados);
}

/**
 * Lê o cookie **sem gravar nada**.
 *
 * `useSession` cria e grava uma sessão vazia quando não encontra uma, o que
 * daria um cookie de admin a todo visitante que abrisse a URL. Na leitura só
 * interessa o que já existe.
 */
export async function lerSessaoAdmin(): Promise<SessaoAdmin | null> {
  const selado = getCookie(ADMIN_COOKIE);
  if (!selado) return null;

  try {
    const aberto = await unsealSession(config(), selado);
    const usuario = (aberto.data as Partial<SessaoAdmin> | undefined)?.usuario;
    return usuario ? { usuario } : null;
  } catch {
    // sem segredo, selo adulterado ou prazo vencido
    return null;
  }
}

export async function limparSessaoAdmin() {
  if (!getCookie(ADMIN_COOKIE)) return;
  try {
    const session = await useSession<SessaoAdmin>(config());
    await session.clear();
  } catch {
    // sem segredo não há sessão para limpar
  }
}
