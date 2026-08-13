/**
 * Conexão com o Postgres que alimenta os planos do site.
 *
 * Roda só no servidor (é usada pelo server function `fetchPlanos`), lendo a
 * configuração de `process.env` em tempo de execução:
 *
 *   POSTGRES_URL              string de conexão completa (tem prioridade)
 *   POSTGRES_HOST             host do banco
 *   POSTGRES_PORT             porta (padrão 5432)
 *   POSTGRES_DB               nome do banco
 *   POSTGRES_USER             usuário
 *   POSTGRES_PASSWORD         senha
 *   POSTGRES_SSL              "require" | "no-verify" | "true" | "false"
 *   POSTGRES_SCHEMA           schema da tabela (padrão "public")
 *   POSTGRES_PLANOS_TABLE     tabela dos planos (padrão "planos_web")
 *   POSTGRES_PLANOS_CACHE_SECONDS  cache em memória do resultado (padrão 60)
 *
 * Sem host nem URL a conexão nem é aberta: o site cai no `FALLBACK_PLANOS`.
 */

import postgres from "postgres";
import { FALLBACK_PLANOS, formatBRL, splitList, type Plan } from "./plans";

const DEFAULT_SCHEMA = "public";
const DEFAULT_TABLE = "planos_web";
const DEFAULT_CACHE_SECONDS = 60;
/** Identificadores vêm de env var — só aceitamos nomes simples de tabela/schema. */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;

const env = (name: string) => process.env[name]?.trim() || undefined;

function identifier(name: string | undefined, fallback: string, varName: string) {
  if (!name) return fallback;
  if (!IDENTIFIER_RE.test(name)) {
    console.error(`${varName} inválido ("${name}") — usando "${fallback}".`);
    return fallback;
  }
  return name;
}

function sslOption(): NonNullable<postgres.Options<Record<string, never>>["ssl"]> {
  const value = env("POSTGRES_SSL")?.toLowerCase();
  if (!value || value === "false" || value === "disable" || value === "0") return false;
  // Certificado autoassinado (comum em banco gerenciado atrás de proxy).
  if (value === "no-verify" || value === "allow" || value === "prefer") {
    return { rejectUnauthorized: false };
  }
  return "require";
}

type Sql = ReturnType<typeof postgres>;

let client: Sql | null = null;
let clientReady = false;

/** Abre (uma vez) a conexão; devolve null quando o banco não está configurado. */
function getClient(): Sql | null {
  if (clientReady) return client;
  clientReady = true;

  const url = env("POSTGRES_URL");
  const host = env("POSTGRES_HOST");
  if (!url && !host) {
    console.warn(
      "Postgres não configurado (POSTGRES_URL/POSTGRES_HOST) — usando planos de fallback.",
    );
    return null;
  }

  const options: postgres.Options<Record<string, never>> = {
    max: 3,
    idle_timeout: 30,
    connect_timeout: 10,
    ssl: sslOption(),
    onnotice: () => {},
  };

  try {
    client = url
      ? postgres(url, options)
      : postgres({
          ...options,
          host: host as string,
          port: Number(env("POSTGRES_PORT") ?? 5432),
          database: env("POSTGRES_DB") ?? "postgres",
          username: env("POSTGRES_USER") ?? "postgres",
          password: env("POSTGRES_PASSWORD") ?? "",
        });
  } catch (err) {
    console.error("Falha ao inicializar a conexão com o Postgres", err);
    client = null;
  }
  return client;
}

/* ---------------- consulta ---------------- */

type PlanoRow = {
  id_plano: string | number;
  codigo_mk: string | number | null;
  nome: string;
  descricao: string | null;
  valor: string | number;
  valor_primeiras_faturas: string | number | null;
  quant_meses_desconto: number | null;
  composicao_resumo: string | null;
  composicao: string | null;
  url_logo_agregados: string | null;
  destaque: boolean;
  nome_destaque: string | null;
  ordem_grade: number;
};

function toPlan(row: PlanoRow): Plan {
  const composicao = row.composicao?.trim() || null;
  return {
    id_plano: Number(row.id_plano),
    codigo_mk: row.codigo_mk == null ? null : Number(row.codigo_mk),
    nome: row.nome,
    descricao: row.descricao?.trim() || null,
    valor: formatBRL(row.valor) ?? "0,00",
    valor_primeiras_faturas: formatBRL(row.valor_primeiras_faturas),
    quant_meses_desconto: row.quant_meses_desconto ?? null,
    composicao,
    composicao_resumo: row.composicao_resumo?.trim() || null,
    itens: splitList(composicao),
    logos: splitList(row.url_logo_agregados),
    destaque: Boolean(row.destaque),
    nome_destaque: row.nome_destaque?.trim() || null,
    ordem_grade: row.ordem_grade ?? 0,
  };
}

let cache: { planos: Plan[]; expiresAt: number } | null = null;

const cacheMs = () => {
  const seconds = Number(env("POSTGRES_PLANOS_CACHE_SECONDS") ?? DEFAULT_CACHE_SECONDS);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_CACHE_SECONDS) * 1000;
};

/**
 * Planos ativos, na ordem da grade. Erros de banco não derrubam a página:
 * o último resultado em cache é reaproveitado e, na falta dele, entram os
 * planos de fallback.
 */
export async function loadPlanos(): Promise<Plan[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.planos;

  const sql = getClient();
  if (!sql) return FALLBACK_PLANOS;

  const schema = identifier(env("POSTGRES_SCHEMA"), DEFAULT_SCHEMA, "POSTGRES_SCHEMA");
  const table = identifier(env("POSTGRES_PLANOS_TABLE"), DEFAULT_TABLE, "POSTGRES_PLANOS_TABLE");

  try {
    const rows = (await sql<PlanoRow[]>`
      select
        id_plano, codigo_mk, nome, descricao, valor, valor_primeiras_faturas,
        quant_meses_desconto, composicao_resumo, composicao, url_logo_agregados,
        destaque, nome_destaque, ordem_grade
      from ${sql(schema)}.${sql(table)}
      where ativo is true
      order by ordem_grade asc, id_plano asc
    `) as unknown as PlanoRow[];

    const planos = rows.map(toPlan);
    // Tabela vazia é configuração, não falha: melhor mostrar o fallback.
    if (!planos.length) return FALLBACK_PLANOS;

    cache = { planos, expiresAt: Date.now() + cacheMs() };
    return planos;
  } catch (err) {
    console.error("Falha ao consultar os planos no Postgres", err);
    return cache?.planos ?? FALLBACK_PLANOS;
  }
}
