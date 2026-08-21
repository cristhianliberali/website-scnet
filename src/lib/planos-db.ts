/**
 * Os planos do site, lidos do Postgres.
 *
 * Roda só no servidor (é usada pelo server function `fetchPlanos`). A conexão
 * em si mora em `postgres.server.ts`; daqui saem só a consulta e o cache:
 *
 *   POSTGRES_SCHEMA           schema da tabela (padrão "public")
 *   POSTGRES_PLANOS_TABLE     tabela dos planos (padrão "planos_web")
 *   POSTGRES_PLANOS_CACHE_SECONDS  cache em memória do resultado (padrão 60)
 *
 * O banco é a única fonte de planos: sem configuração, sem tabela ou sem linhas
 * ativas o site fica sem plano nenhum (e diz isso no log). Nada de lista
 * embutida de reserva — ela só mascararia uma falha de configuração.
 */

import { env, getClient, identifier } from "./postgres.server";
import { formatBRL, splitList, type Plan } from "./plans";

const DEFAULT_SCHEMA = "public";
const DEFAULT_TABLE = "planos_web";
const DEFAULT_CACHE_SECONDS = 60;

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
  codigo_oferta_mk: string | number | null;
  codigo_oferta: string | number | null;
};

/**
 * `codigo_oferta_mk` pode ser numérico ou texto na tabela — o postgres.js
 * entrega bigint como string nos dois casos. Devolve número quando o valor é
 * só dígitos, senão mantém o texto, para o webhook receber o mesmo que está
 * gravado no banco.
 */
function codigoOfertaMk(value: string | number | null): number | string | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const texto = value.trim();
  if (!texto) return null;
  return /^\d+$/.test(texto) ? Number(texto) : texto;
}

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
    codigo_oferta_mk: codigoOfertaMk(row.codigo_oferta_mk),
    codigo_oferta: row.codigo_oferta == null ? null : String(row.codigo_oferta).trim() || null,
  };
}

let cache: { planos: Plan[]; expiresAt: number } | null = null;

const cacheMs = () => {
  const seconds = Number(env("POSTGRES_PLANOS_CACHE_SECONDS") ?? DEFAULT_CACHE_SECONDS);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_CACHE_SECONDS) * 1000;
};

/**
 * Por quanto tempo, no máximo, vale servir o último resultado bom depois que a
 * consulta passou a falhar.
 *
 * Antes não havia limite: numa falha permanente o site servia o mesmo retrato
 * para sempre, e a página parecia viva enquanto o banco estava fora. Um preço
 * errado no ar por dias é pior que um "indisponível" honesto — o primeiro vira
 * promessa comercial que o provedor não vai cumprir.
 */
const DEFAULT_STALE_SECONDS = 600;

const staleMs = () => {
  const seconds = Number(env("POSTGRES_PLANOS_STALE_SECONDS") ?? DEFAULT_STALE_SECONDS);
  return (Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_STALE_SECONDS) * 1000;
};

/**
 * Planos ativos, na ordem da grade. Cada caminho aparece no log do servidor —
 * é por ele que se sabe se a página está mostrando dados do banco.
 *
 * Uma falha na consulta reaproveita o último resultado bem-sucedido em cache
 * (dado real, só que velho) para não derrubar a página numa oscilação de rede.
 * Sem cache, devolve lista vazia e a página mostra o estado vazio.
 */
export async function loadPlanos(): Promise<Plan[]> {
  if (cache && cache.expiresAt > Date.now()) {
    console.info(`Planos servidos do cache (${cache.planos.length}).`);
    return cache.planos;
  }

  const sql = getClient();
  if (!sql) {
    // o "por quê" sai em postgres.server.ts; aqui fica a consequência
    console.error("Sem banco configurado — nenhum plano será exibido.");
    return [];
  }

  const schema = identifier(env("POSTGRES_SCHEMA"), DEFAULT_SCHEMA, "POSTGRES_SCHEMA");
  const table = identifier(env("POSTGRES_PLANOS_TABLE"), DEFAULT_TABLE, "POSTGRES_PLANOS_TABLE");

  console.info(`Carregando planos do Postgres (${schema}.${table})...`);
  await registrarBanco(sql);
  try {
    const rows = (await sql<PlanoRow[]>`
      select
        id_plano, codigo_mk, nome, descricao, valor, valor_primeiras_faturas,
        quant_meses_desconto, composicao_resumo, composicao, url_logo_agregados,
        destaque, nome_destaque, ordem_grade, codigo_oferta_mk, codigo_oferta
      from ${sql(schema)}.${sql(table)}
      where ativo is true
      order by ordem_grade asc, id_plano asc
    `) as unknown as PlanoRow[];

    const planos = rows.map(toPlan);
    if (!planos.length) {
      console.warn(
        `Nenhum plano ATIVO em ${schema}.${table} — a página ficará sem planos. ` +
          "A consulta funcionou; o filtro é `where ativo is true`, então confira se as " +
          "linhas existem e se `ativo` está marcado.",
      );
      return [];
    }

    /*
     * Plano com `codigo_oferta` é de campanha: ele só aparece quando a URL traz
     * `?codigo_oferta=` com o mesmo valor (veja `planosVisiveis`). Se TODOS
     * estiverem assim, a home fica vazia mesmo com a consulta perfeita — e sem
     * este aviso não há como descobrir isso olhando a tela ou a tabela.
     */
    const restritos = planos.filter((p) => p.codigo_oferta).length;
    if (restritos === planos.length) {
      console.warn(
        `Todos os ${planos.length} planos ativos de ${schema}.${table} têm \`codigo_oferta\` ` +
          "preenchido, ou seja, são de campanha: a home só os mostra com ?codigo_oferta=<código> " +
          "na URL. Para um plano aparecer sempre, deixe `codigo_oferta` nulo.",
      );
    } else if (restritos > 0) {
      console.info(`${restritos} de ${planos.length} planos são de campanha (codigo_oferta).`);
    }

    console.info(`Planos carregados do Postgres: ${planos.length}.`);
    cache = { planos, expiresAt: Date.now() + cacheMs() };
    return planos;
  } catch (err) {
    console.error("Falha ao consultar os planos no Postgres", err);
    if (cache) {
      const vencidoHa = Date.now() - cache.expiresAt;
      if (vencidoHa <= staleMs()) {
        console.warn(
          `Reaproveitando o último resultado do banco (${cache.planos.length}), ` +
            `vencido há ${Math.round(vencidoHa / 1000)}s.`,
        );
        return cache.planos;
      }
      console.error(
        `O último resultado do banco venceu há ${Math.round(vencidoHa / 1000)}s e não será ` +
          "mais servido — a página vai mostrar o estado vazio até o banco voltar.",
      );
      cache = null;
    }
    return [];
  }
}

/**
 * Diz uma vez, no log, a QUAL banco este processo se conectou.
 *
 * Saber a tabela não basta quando o problema é o site estar lendo outro banco
 * — e essa foi exatamente a confusão que levou horas para desfazer. Sai uma vez
 * por processo, porque a conexão não muda no meio do caminho.
 */
let bancoRegistrado = false;

async function registrarBanco(sql: ReturnType<typeof getClient>) {
  if (bancoRegistrado || !sql) return;
  bancoRegistrado = true;
  try {
    const linhas = (await sql`
      select current_database()::text                            as banco,
             coalesce(inet_server_addr()::text, '(socket local)') as servidor,
             inet_server_port()                                  as porta
    `) as unknown as { banco: string; servidor: string; porta: number }[];
    const i = linhas[0];
    if (i) console.info(`Postgres conectado: banco "${i.banco}" em ${i.servidor}:${i.porta}.`);
  } catch {
    // saber o nome do banco é conforto, não requisito — nunca derruba a consulta
  }
}
