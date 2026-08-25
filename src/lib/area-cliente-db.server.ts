/**
 * O liga/desliga da área de membros, guardado em `web_config` (chave
 * `area_cliente`).
 *
 * ## Onde isto é lido
 *
 * Em toda entrada na área do cliente (`/cliente` e `/cliente/painel`) e no
 * carregamento da home e da `/contratacao` — estas duas porque o "Já sou
 * cliente" precisa saber, no momento do clique, se manda a pessoa para o login
 * ou para o WhatsApp da central.
 *
 * São páginas, não envios: por isso o cache existe e é o mesmo desenho dos
 * scripts. O banco é consultado no máximo uma vez por
 * `AREA_CLIENTE_CACHE_SECONDS` (padrão 30), e salvar no /admin esvazia a memória
 * na hora — desligar a área do cliente é decisão de urgência, e meio minuto de
 * espera com o n8n fora do ar é meio minuto de cliente vendo erro.
 *
 * ## Se o banco não responder
 *
 * A área continua **ligada**. É a escolha certa: uma falha ao ler a
 * configuração não pode fechar a área do cliente por conta própria — o pior
 * caso vira o comportamento de antes desta tela existir.
 */

import { env, getClient, identifier } from "./postgres.server";
import { CONFIG_AREA_CLIENTE_PADRAO, type ConfigAreaCliente } from "./admin-tipos";

const DEFAULT_SCHEMA = "public";
const DEFAULT_CONFIG = "web_config";

export const CHAVE_AREA_CLIENTE = "area_cliente";

const schema = () => identifier(env("POSTGRES_SCHEMA"), DEFAULT_SCHEMA, "POSTGRES_SCHEMA");
const tabela = () =>
  identifier(env("POSTGRES_CONFIG_TABLE"), DEFAULT_CONFIG, "POSTGRES_CONFIG_TABLE");

function segundosDeCache(): number {
  const n = Number(env("AREA_CLIENTE_CACHE_SECONDS"));
  if (!Number.isFinite(n) || n < 0) return 30;
  return Math.min(n, 600);
}

type LinhaConfig = { valor: Record<string, unknown> | null };

export function normalizarAreaCliente(bruto: Record<string, unknown> | null): ConfigAreaCliente {
  if (!bruto) return CONFIG_AREA_CLIENTE_PADRAO;
  const ativa = bruto["ativa"];
  const mensagem = bruto["mensagem"];
  return {
    // Só um `false` explícito desliga: lixo na coluna mantém a área no ar.
    ativa: ativa === false ? false : true,
    mensagem:
      typeof mensagem === "string" && mensagem.trim() !== ""
        ? mensagem.trim()
        : CONFIG_AREA_CLIENTE_PADRAO.mensagem,
  };
}

/* ---------------- cache ---------------- */

type Guardado = { em: number; config: ConfigAreaCliente };

let guardado: Guardado | null = null;
let emVoo: Promise<ConfigAreaCliente> | null = null;

export function invalidarAreaCliente(): void {
  guardado = null;
  emVoo = null;
}

async function consultar(): Promise<ConfigAreaCliente> {
  const sql = getClient();
  if (!sql) return CONFIG_AREA_CLIENTE_PADRAO;

  const linhas = (await sql<LinhaConfig[]>`
    select valor
    from ${sql(schema())}.${sql(tabela())}
    where chave = ${CHAVE_AREA_CLIENTE}
    limit 1
  `) as unknown as LinhaConfig[];

  return normalizarAreaCliente(linhas[0]?.valor ?? null);
}

async function recarregar(): Promise<ConfigAreaCliente> {
  try {
    const config = await consultar();
    guardado = { em: Date.now(), config };
    return config;
  } catch (err) {
    console.error("Falha ao ler o estado da área do cliente; ela segue ligada.", err);
    return guardado?.config ?? CONFIG_AREA_CLIENTE_PADRAO;
  } finally {
    emVoo = null;
  }
}

/** O estado em vigor, com cache. É o que as páginas consultam. */
export async function lerAreaCliente(): Promise<ConfigAreaCliente> {
  if (guardado && Date.now() - guardado.em < segundosDeCache() * 1000) return guardado.config;
  if (!emVoo) emVoo = recarregar();
  return emVoo;
}

/** Sem cache — o /admin precisa ver o que está gravado, não o que está guardado. */
export async function lerAreaClienteFresca(): Promise<ConfigAreaCliente> {
  const sql = getClient();
  if (!sql) return CONFIG_AREA_CLIENTE_PADRAO;
  try {
    return await consultar();
  } catch (err) {
    console.error("Falha ao ler o estado da área do cliente para o /admin.", err);
    return CONFIG_AREA_CLIENTE_PADRAO;
  }
}

export async function gravarAreaCliente(config: ConfigAreaCliente): Promise<void> {
  const sql = getClient();
  if (!sql) throw new Error("Postgres não configurado (POSTGRES_URL/POSTGRES_HOST).");

  await sql`
    insert into ${sql(schema())}.${sql(tabela())} (chave, valor)
    values (${CHAVE_AREA_CLIENTE}, ${sql.json({ ativa: config.ativa, mensagem: config.mensagem })})
    on conflict (chave) do update set valor = excluded.valor
  `;

  invalidarAreaCliente();
}
