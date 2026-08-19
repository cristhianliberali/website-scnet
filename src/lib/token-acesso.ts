/**
 * Leitura do token de acesso que o n8n devolve no login.
 *
 * Arquivo puro, sem import de runtime: é só interpretação de uma resposta
 * externa, e assim dá para exercitá-lo em teste sem subir uma requisição.
 *
 * A tolerância de formatos aqui é deliberada. O outro lado é um workflow do
 * n8n, montado à mão numa tela; exigir uma grafia exata trocaria um bug de
 * configuração silencioso por um login que não funciona sem dizer por quê.
 */

import type { TokenAcesso } from "./cliente-tipos";

/** Quanto vale o token quando o n8n não diz — o mesmo prazo do cookie. */
export const TOKEN_PADRAO_SEGUNDOS = 2 * 60 * 60;

/** Teto de validade aceito, por mais que o n8n peça. */
export const TOKEN_MAX_SEGUNDOS = 12 * 60 * 60;

const agoraEmSegundos = () => Math.floor(Date.now() / 1000);

const asString = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const asRecord = (v: unknown): Record<string, unknown> =>
  v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const numero = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && /^\d+$/.test(v.trim())
      ? Number(v.trim())
      : undefined;

/**
 * Lê o token emitido pelo n8n, aceitando os formatos usuais.
 *
 * A validade pode vir como duração (`expira_em_segundos`, `expires_in`) ou como
 * instante (`expira_em`/`expires_at`, epoch em segundos ou ISO 8601).
 *
 * Duas recusas valem explicar. Um prazo **já vencido** devolve `undefined` em
 * vez de virar sessão: melhor recusar o login do que deixar o cliente entrar e
 * cair na primeira consulta. E um prazo **absurdo** é cortado em
 * `TOKEN_MAX_SEGUNDOS` — um `expires_in` digitado com um zero a mais viraria uma
 * sessão praticamente eterna, que é o oposto de um token temporário.
 */
export function lerToken(data: Record<string, unknown>): TokenAcesso | undefined {
  const bloco = asRecord(data["token"]);
  const valor =
    asString(data["token"]) ??
    asString(bloco["valor"]) ??
    asString(bloco["token"]) ??
    asString(data["access_token"]) ??
    asString(data["token_acesso"]);
  if (!valor) return undefined;

  const agora = agoraEmSegundos();

  const duracao =
    numero(bloco["expira_em_segundos"]) ??
    numero(data["expira_em_segundos"]) ??
    numero(bloco["expires_in"]) ??
    numero(data["expires_in"]);

  const bruto =
    bloco["expira_em"] ?? data["expira_em"] ?? bloco["expires_at"] ?? data["expires_at"];
  const instante = numero(bruto);
  const iso = typeof bruto === "string" && instante === undefined ? Date.parse(bruto) : NaN;

  const expiraEm =
    duracao !== undefined
      ? agora + duracao
      : instante !== undefined
        ? instante
        : Number.isFinite(iso)
          ? Math.floor(iso / 1000)
          : agora + TOKEN_PADRAO_SEGUNDOS;

  if (expiraEm <= agora) return undefined;
  return { valor, expiraEm: Math.min(expiraEm, agora + TOKEN_MAX_SEGUNDOS) };
}
