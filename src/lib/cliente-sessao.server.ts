/**
 * Sessão da área do cliente (só servidor).
 *
 * O n8n verifica as credenciais; quem é dono da sessão é este servidor. Os dois
 * cookies usam a sessão selada do próprio TanStack Start (`useSession`), que
 * criptografa e assina o conteúdo com `SESSION_SECRET`: o navegador guarda um
 * texto opaco, não consegue lê-lo nem forjá-lo, e o cookie é `HttpOnly`, então
 * nem o JavaScript da página o alcança.
 *
 * - `scnet_cliente` (2h) — a sessão de fato, criada só depois do login completo.
 * - `scnet_cliente_desafio` (10min) — o meio do caminho do login por documento,
 *   entre "documento aceito" e "código conferido". É ele que guarda de quem é o
 *   login em andamento: o `id_cliente` nunca trafega pelo navegador, então não
 *   há como trocar de cliente entre uma etapa e outra.
 *
 * Sem `SESSION_SECRET` nenhuma sessão é criada e o login falha — um login que
 * passa por falta de configuração é um login que qualquer um atravessa.
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

import type { DesafioCliente, SessaoCliente } from "./cliente-tipos";

/** Mínimo exigido pelo selo da sessão. */
const MIN_SECRET_LENGTH = 32;

const SESSAO_COOKIE = "scnet_cliente";
const DESAFIO_COOKIE = "scnet_cliente_desafio";
const SESSAO_MAX_AGE = 2 * 60 * 60;
const DESAFIO_MAX_AGE = 10 * 60;

/** Lançado quando falta configuração — vira mensagem de erro para o cliente. */
export class SessaoIndisponivelError extends Error {
  constructor() {
    super("Sessão indisponível: SESSION_SECRET não configurada.");
    this.name = "SessaoIndisponivelError";
  }
}

function secret(): string {
  const value = process.env["SESSION_SECRET"];
  if (!value || value.length < MIN_SECRET_LENGTH) {
    console.error(
      value
        ? `SESSION_SECRET tem ${value.length} caracteres — o mínimo é ${MIN_SECRET_LENGTH}.`
        : "SESSION_SECRET não configurada — nenhuma sessão da área do cliente pode ser criada.",
    );
    throw new SessaoIndisponivelError();
  }
  return value;
}

function config(name: string, maxAge: number) {
  return {
    password: secret(),
    name,
    maxAge,
    // Só cookie: sem isso a sessão também poderia chegar por header.
    sessionHeader: false as const,
    cookie: {
      httpOnly: true,
      // Em http local o navegador descartaria um cookie Secure.
      secure: getRequestProtocol() === "https",
      sameSite: "lax" as const,
      path: "/",
      maxAge,
    },
  };
}

/**
 * Lê e confere um cookie selado **sem gravar nada**.
 *
 * `useSession` cria e grava uma sessão vazia quando não encontra uma, o que
 * daria um cookie a todo visitante anônimo de /cliente. Na leitura só nos
 * interessa o que já existe, então abrimos o selo à mão. `unsealSession` recusa
 * assinatura inválida e também o que passou do `maxAge`.
 */
async function lerCookieSelado<T>(nome: string, maxAge: number): Promise<Partial<T> | null> {
  const selado = getCookie(nome);
  if (!selado) return null;
  try {
    const aberto = await unsealSession(config(nome, maxAge), selado);
    return (aberto.data ?? null) as Partial<T> | null;
  } catch {
    // sem segredo, selo adulterado ou prazo vencido
    return null;
  }
}

/* ---------------- sessão ---------------- */

export async function gravarSessao(dados: SessaoCliente) {
  const session = await useSession<SessaoCliente>(config(SESSAO_COOKIE, SESSAO_MAX_AGE));
  await session.update(dados);
}

export async function lerSessao(): Promise<SessaoCliente | null> {
  const data = await lerCookieSelado<SessaoCliente>(SESSAO_COOKIE, SESSAO_MAX_AGE);
  if (!data) return null;

  const { idCliente, nome, documento, metodo } = data;
  if (!idCliente || !nome || !documento || !metodo) return null;
  return { idCliente, nome, documento, metodo };
}

export async function limparSessao() {
  if (!getCookie(SESSAO_COOKIE)) return;
  try {
    const session = await useSession<SessaoCliente>(config(SESSAO_COOKIE, SESSAO_MAX_AGE));
    await session.clear();
  } catch {
    // sem segredo não havia sessão para limpar
  }
}

/* ---------------- desafio ---------------- */

export async function gravarDesafio(dados: DesafioCliente) {
  const session = await useSession<DesafioCliente>(config(DESAFIO_COOKIE, DESAFIO_MAX_AGE));
  await session.update(dados);
}

export async function lerDesafio(): Promise<DesafioCliente | null> {
  const data = await lerCookieSelado<DesafioCliente>(DESAFIO_COOKIE, DESAFIO_MAX_AGE);
  if (!data) return null;

  const { idCliente, documento, canais, contatos, canalEscolhido, tentativas } = data;
  if (!idCliente || !documento || !canais) return null;
  return {
    idCliente,
    documento,
    canais,
    contatos: contatos ?? {},
    canalEscolhido,
    tentativas: tentativas ?? 0,
  };
}

export async function limparDesafio() {
  if (!getCookie(DESAFIO_COOKIE)) return;
  try {
    const session = await useSession<DesafioCliente>(config(DESAFIO_COOKIE, DESAFIO_MAX_AGE));
    await session.clear();
  } catch {
    // idem
  }
}
