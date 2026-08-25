/**
 * A porta do painel super admin (só servidor).
 *
 * **Quem entra.** Um par de variáveis de ambiente, `ADMIN_USUARIO` e
 * `ADMIN_SENHA`. Não há tabela de usuários, e é uma escolha: um cadastro pede
 * recuperação de senha, rotação e uma tela para administrar administradores —
 * três coisas que ninguém mantém num painel de uma pessoa. Duas variáveis são
 * trocadas em dez segundos no EasyPanel e não deixam hash parado no banco.
 *
 * **Sem as duas, o /admin não existe.** A rota responde 404, e não 401: um 401
 * confirmaria a quem está tentando que a página está lá.
 *
 * **A comparação é em tempo constante.** Um `===` de string vaza, pelo tempo,
 * quantos caracteres do começo estavam certos — o bastante para descobrir uma
 * senha a partir de fora, um caractere por vez.
 */

import { getRequest } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

import { clientIpFromHeaders } from "./rate-limit";
import {
  checkTentativas,
  limparTentativas,
  mensagemDeBloqueio,
  porIdentificador,
  porIp,
  registrarFalha,
} from "./tentativas-login";
import { gravarSessaoAdmin, lerSessaoAdmin, limparSessaoAdmin } from "./admin-sessao.server";
import type { AdminResultado, SessaoAdmin } from "./admin-tipos";

const ERRO_CREDENCIAIS = "Usuário ou senha incorretos.";
const ERRO_INDISPONIVEL =
  "O painel administrativo não está configurado neste servidor (ADMIN_USUARIO/ADMIN_SENHA).";

const env = (nome: string) => process.env[nome]?.trim() || "";

/** As duas variáveis estão definidas? É o que decide se a rota existe. */
export function adminConfigurado(): boolean {
  return Boolean(env("ADMIN_USUARIO") && env("ADMIN_SENHA"));
}

/**
 * Compara sem vazar o tempo.
 *
 * `timingSafeEqual` exige buffers do mesmo tamanho, e o tamanho em si é uma
 * pista — por isso os dois lados passam por um hash de tamanho fixo antes.
 */
function iguais(recebido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

const ipOrigem = () => clientIpFromHeaders(getRequest().headers);

export type LoginAdminInput = { usuario: string; senha: string };

/**
 * Confere as credenciais e abre a sessão.
 *
 * O contador de tentativas é o mesmo do login do cliente: erra demais, espera.
 * Aqui ele importa mais do que lá — do outro lado desta porta está a edição de
 * preço de plano.
 */
export async function loginAdminServer(
  data: LoginAdminInput,
): Promise<AdminResultado<SessaoAdmin>> {
  if (!adminConfigurado()) {
    console.error("Tentativa de login no /admin sem ADMIN_USUARIO/ADMIN_SENHA definidos.");
    return { ok: false, mensagem: ERRO_INDISPONIVEL };
  }

  const chaves = [
    porIdentificador(`admin:${data.usuario.trim().toLowerCase()}`),
    porIp(ipOrigem()),
  ];
  const bloqueio = checkTentativas(chaves);
  if (bloqueio.blocked)
    return { ok: false, mensagem: mensagemDeBloqueio(bloqueio.retryAfterSeconds) };

  /*
   * As duas comparações rodam sempre, mesmo quando a primeira já falhou: parar
   * na primeira devolveria a resposta mais rápido para "usuário errado" do que
   * para "senha errada", e essa diferença diz a quem tenta que o usuário existe.
   */
  const usuarioOk = iguais(data.usuario.trim(), env("ADMIN_USUARIO"));
  const senhaOk = iguais(data.senha, env("ADMIN_SENHA"));

  if (!usuarioOk || !senhaOk) {
    const falha = registrarFalha(chaves);
    console.warn(`Login recusado no /admin (ip ${ipOrigem() || "desconhecido"}).`);
    if (falha.blocked) return { ok: false, mensagem: mensagemDeBloqueio(falha.retryAfterSeconds) };
    return { ok: false, mensagem: ERRO_CREDENCIAIS };
  }

  const sessao: SessaoAdmin = { usuario: env("ADMIN_USUARIO") };
  await gravarSessaoAdmin(sessao);
  limparTentativas(chaves);
  console.info(`Login no /admin (ip ${ipOrigem() || "desconhecido"}).`);
  return { ok: true, dados: sessao };
}

export async function logoutAdminServer(): Promise<void> {
  await limparSessaoAdmin();
}

/** A sessão de quem está pedindo — `null` quando não há nenhuma válida. */
export async function sessaoAdminServer(): Promise<SessaoAdmin | null> {
  if (!adminConfigurado()) return null;
  return lerSessaoAdmin();
}

/**
 * O guarda de toda ação do admin.
 *
 * Cada server function chama isto antes de tocar no banco. Não basta a tela ter
 * sido carregada com sessão: as server functions são endpoints HTTP públicos, e
 * quem quiser pode postar nelas direto.
 */
export async function exigirSessaoAdmin(): Promise<SessaoAdmin> {
  const sessao = await sessaoAdminServer();
  if (!sessao) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  return sessao;
}
