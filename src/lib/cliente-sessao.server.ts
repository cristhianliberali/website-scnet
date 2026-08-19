/**
 * Sessão da área do cliente (só servidor).
 *
 * O n8n verifica as credenciais e emite o token de acesso; quem é dono da
 * sessão é este servidor. Os dois cookies usam a sessão selada do próprio
 * TanStack Start (`useSession`), que criptografa e assina o conteúdo com
 * `SESSION_SECRET`: o navegador guarda um texto opaco, não consegue lê-lo nem
 * forjá-lo, e o cookie é `HttpOnly`, então nem o JavaScript da página o alcança.
 *
 * É dentro desse selo que mora o **token de acesso** do n8n. Ele não é um
 * detalhe de armazenamento: é a credencial que abre os dados do cliente no n8n.
 * Guardá-lo aqui, e não em localStorage ou num cookie legível, é o que impede
 * que um XSS na página o roube e passe a falar com o n8n direto.
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

import type { DesafioCliente, SessaoCliente, TokenAcesso } from "./cliente-tipos";

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

  // `documento` e `contato` são só exibição: um login por senha pode não trazer
  // documento nenhum, e isso não invalida a sessão.
  const { idCliente, nome, documento, contato, metodo, token } = data;
  if (!idCliente || !nome || !metodo) return null;

  /*
   * Sem token não há sessão. Uma sessão sem token não consegue consultar nada
   * no n8n, então manter o cliente "logado" só o levaria a uma tela de erro
   * atrás da outra — melhor mandá-lo ao login e acabar com isso.
   *
   * O prazo é conferido aqui, e não só no cookie: o `maxAge` de 2h do cookie e
   * a validade que o n8n deu ao token são coisas diferentes, e vale a mais
   * curta das duas.
   */
  if (!token?.valor || !token.expiraEm) return null;
  if (token.expiraEm <= Math.floor(Date.now() / 1000)) return null;

  return { idCliente, nome, metodo, token, documento, contato };
}

/**
 * Troca só o token da sessão, preservando o resto.
 *
 * O n8n pode devolver um token novo em qualquer resposta autenticada — é assim
 * que a validade desliza enquanto o cliente está usando o painel, sem um evento
 * de renovação separado e sem obrigá-lo a entrar de novo no meio do caminho.
 */
export async function renovarToken(token: TokenAcesso) {
  const session = await useSession<SessaoCliente>(config(SESSAO_COOKIE, SESSAO_MAX_AGE));
  // `update` recebe o estado atual e devolve o novo: sem isso um token novo
  // apagaria nome, documento e método junto.
  await session.update((atual) => ({ ...atual, token }));
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
