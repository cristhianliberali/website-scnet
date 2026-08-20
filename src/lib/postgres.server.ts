/**
 * A conexão com o Postgres, compartilhada por quem precisa dela no servidor.
 *
 * São dois usos hoje, e eles não têm nada a ver um com o outro: os planos da
 * home (`planos-db.ts`) e o painel do cliente (`painel-db.server.ts`). O que
 * eles compartilham é o *banco* — e abrir dois pools para o mesmo banco só
 * gastaria conexões, que num Postgres gerenciado são um recurso contado.
 *
 * A configuração é lida de `process.env` em tempo de execução:
 *
 *   POSTGRES_URL       string de conexão completa (tem prioridade)
 *   POSTGRES_HOST      host do banco
 *   POSTGRES_PORT      porta (padrão 5432)
 *   POSTGRES_DB        nome do banco
 *   POSTGRES_USER      usuário
 *   POSTGRES_PASSWORD  senha
 *   POSTGRES_SSL       "require" | "no-verify" | "true" | "false"
 *
 * Sem `POSTGRES_URL` nem `POSTGRES_HOST`, `getClient()` devolve `null` e quem
 * chamou decide o que fazer — os planos ficam vazios, o painel cai para o
 * webhook do n8n. Nenhum dos dois derruba a página.
 */

import postgres from "postgres";

/** Identificadores vêm de env var — só aceitamos nomes simples de tabela/schema. */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;

export const env = (name: string) => process.env[name]?.trim() || undefined;

/**
 * Nome de tabela ou schema vindo do ambiente.
 *
 * Ele entra numa consulta, então não pode ser qualquer coisa: o que não parecer
 * um identificador simples é recusado e o padrão vale no lugar — com o motivo
 * no log, para não virar um "sumiu tudo" sem explicação.
 */
export function identifier(name: string | undefined, fallback: string, varName: string) {
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

export type Sql = ReturnType<typeof postgres>;

let client: Sql | null = null;
let clientReady = false;

/**
 * Abre (uma vez) a conexão; devolve null quando o banco não está configurado.
 *
 * O aviso de "não configurado" sai uma vez só, na primeira chamada: repeti-lo a
 * cada carregamento de página encheria o log sem dizer nada de novo.
 */
export function getClient(): Sql | null {
  if (clientReady) return client;
  clientReady = true;

  const url = env("POSTGRES_URL");
  const host = env("POSTGRES_HOST");
  if (!url && !host) {
    console.error("Postgres não configurado (POSTGRES_URL/POSTGRES_HOST).");
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

/** O banco está configurado? Usado para decidir o caminho antes de consultar. */
export const postgresConfigurado = () => Boolean(env("POSTGRES_URL") ?? env("POSTGRES_HOST"));
