/**
 * O interruptor do anti-robô, guardado em `web_config` (chave `seguranca`).
 *
 * ## Por que não é só uma variável de ambiente
 *
 * Era. E foi exatamente esse o problema: quando o reCAPTCHA começa a recusar
 * gente de verdade — a chave pública não entrou no build, o domínio não está na
 * lista da chave no painel do Google, ou a pontuação do site novo está baixa —,
 * o formulário para para TODO MUNDO, e desligar exigia mexer no painel do
 * servidor e reiniciar o container. Quem está atendendo não tem esse acesso, e
 * um provedor não fica sem receber pedido esperando um deploy.
 *
 * ## Custo
 *
 * Isto é lido só quando alguém ENVIA um formulário — não em toda visita —, e
 * ainda assim fica em memória por `SEGURANCA_CACHE_SECONDS` (padrão 30, curto de
 * propósito: quando se desliga o anti-robô às pressas, meio minuto já é espera).
 * Salvar no /admin esvazia a memória na hora.
 *
 * ## Se o banco não responder
 *
 * Vale o que está no ambiente, como antes desta tela existir. Uma falha de
 * leitura aqui **nunca** desliga a verificação sozinha: `recaptchaAtivo` só fica
 * falso se alguém tiver desligado de propósito.
 */

import { env, getClient, identifier } from "./postgres.server";
import { CONFIG_SEGURANCA_PADRAO, type ConfigSeguranca } from "./admin-tipos";

const DEFAULT_SCHEMA = "public";
const DEFAULT_CONFIG = "web_config";

export const CHAVE_SEGURANCA = "seguranca";

const schema = () => identifier(env("POSTGRES_SCHEMA"), DEFAULT_SCHEMA, "POSTGRES_SCHEMA");
const tabela = () =>
  identifier(env("POSTGRES_CONFIG_TABLE"), DEFAULT_CONFIG, "POSTGRES_CONFIG_TABLE");

function segundosDeCache(): number {
  const n = Number(env("SEGURANCA_CACHE_SECONDS"));
  if (!Number.isFinite(n) || n < 0) return 30;
  return Math.min(n, 600);
}

type LinhaConfig = { valor: Record<string, unknown> | null };

export function normalizarSeguranca(bruto: Record<string, unknown> | null): ConfigSeguranca {
  if (!bruto) return CONFIG_SEGURANCA_PADRAO;
  const ativo = bruto["recaptcha_ativo"];
  const corte = bruto["min_score"];
  return {
    // Só um `false` explícito desliga. Lixo na coluna mantém a proteção ligada.
    recaptchaAtivo: ativo === false ? false : true,
    minScore: typeof corte === "string" ? corte.trim() : "",
  };
}

/* ---------------- cache ---------------- */

type Guardado = { em: number; config: ConfigSeguranca };

let guardado: Guardado | null = null;
let emVoo: Promise<ConfigSeguranca> | null = null;

export function invalidarSeguranca(): void {
  guardado = null;
  emVoo = null;
}

async function consultar(): Promise<ConfigSeguranca> {
  const sql = getClient();
  if (!sql) return CONFIG_SEGURANCA_PADRAO;

  const linhas = (await sql<LinhaConfig[]>`
    select valor
    from ${sql(schema())}.${sql(tabela())}
    where chave = ${CHAVE_SEGURANCA}
    limit 1
  `) as unknown as LinhaConfig[];

  return normalizarSeguranca(linhas[0]?.valor ?? null);
}

async function recarregar(): Promise<ConfigSeguranca> {
  try {
    const config = await consultar();
    guardado = { em: Date.now(), config };
    return config;
  } catch (err) {
    console.error("Falha ao ler a configuração de segurança; valendo o que está no ambiente.", err);
    return guardado?.config ?? CONFIG_SEGURANCA_PADRAO;
  } finally {
    emVoo = null;
  }
}

/** A configuração em vigor. Consultada só no envio de formulário. */
export async function lerSeguranca(): Promise<ConfigSeguranca> {
  if (guardado && Date.now() - guardado.em < segundosDeCache() * 1000) return guardado.config;
  if (!emVoo) emVoo = recarregar();
  return emVoo;
}

/** Sempre do banco, sem cache — é o que o /admin precisa mostrar ao abrir. */
export async function lerSegurancaFresca(): Promise<ConfigSeguranca> {
  const sql = getClient();
  if (!sql) return CONFIG_SEGURANCA_PADRAO;
  try {
    return await consultar();
  } catch (err) {
    console.error("Falha ao ler a configuração de segurança para o /admin.", err);
    return CONFIG_SEGURANCA_PADRAO;
  }
}

export async function gravarSeguranca(config: ConfigSeguranca): Promise<void> {
  const sql = getClient();
  if (!sql) throw new Error("Postgres não configurado (POSTGRES_URL/POSTGRES_HOST).");

  const valor = {
    recaptcha_ativo: config.recaptchaAtivo,
    min_score: config.minScore,
  };

  await sql`
    insert into ${sql(schema())}.${sql(tabela())} (chave, valor)
    values (${CHAVE_SEGURANCA}, ${sql.json(valor)})
    on conflict (chave) do update set valor = excluded.valor
  `;

  // Desligar o anti-robô é uma decisão de urgência: precisa valer no próximo
  // envio, não daqui a meio minuto.
  invalidarSeguranca();
}
