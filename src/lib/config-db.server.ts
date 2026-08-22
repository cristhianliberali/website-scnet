/**
 * Os ajustes editáveis do site, guardados em `web_config`.
 *
 * Uma linha por assunto, o conteúdo em `jsonb`. Hoje há um assunto só — a
 * seção de indicação —, e ele é lido pelo painel do cliente (para saber se a
 * indicação está ligada e com que texto) e escrito pelo /admin.
 *
 * **Nada aqui é obrigatório.** Sem banco, sem tabela ou sem a linha, a leitura
 * devolve o padrão do código. É de propósito: um texto de seção que some
 * porque uma migração não rodou seria uma tela quebrada por causa de um enfeite.
 *
 *   POSTGRES_CONFIG_TABLE   tabela dos ajustes (padrão "web_config")
 *
 * O schema está em `docs/n8n/schema-admin.sql`.
 */

import { env, getClient, identifier } from "./postgres.server";
import {
  CONFIG_INDICACAO_PADRAO,
  TIPOS_BONUS,
  type ConfigIndicacao,
  type TipoBonus,
} from "./admin-tipos";

const DEFAULT_SCHEMA = "public";
const DEFAULT_CONFIG = "web_config";

export const CHAVE_INDICACAO = "indicacao";

const schema = () => identifier(env("POSTGRES_SCHEMA"), DEFAULT_SCHEMA, "POSTGRES_SCHEMA");
const tabela = () =>
  identifier(env("POSTGRES_CONFIG_TABLE"), DEFAULT_CONFIG, "POSTGRES_CONFIG_TABLE");

type LinhaConfig = { valor: Record<string, unknown> | null };

/** `jsonb` chega como objeto; o resto do mundo pode mandar qualquer coisa. */
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const booleano = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);

/** Um tipo de bônus que o banco reconhece — o resto vira vazio. */
const bonus = (v: unknown): TipoBonus => {
  const valor = texto(v);
  return valor in TIPOS_BONUS ? (valor as TipoBonus) : "";
};

export function normalizarConfigIndicacao(bruto: Record<string, unknown> | null): ConfigIndicacao {
  if (!bruto) return CONFIG_INDICACAO_PADRAO;
  return {
    ativo: booleano(bruto["ativo"], CONFIG_INDICACAO_PADRAO.ativo),
    titulo: texto(bruto["titulo"]) || CONFIG_INDICACAO_PADRAO.titulo,
    descricao: texto(bruto["descricao"]) || CONFIG_INDICACAO_PADRAO.descricao,
    bannerDesktopUrl: texto(bruto["banner_desktop_url"]),
    bannerMobileUrl: texto(bruto["banner_mobile_url"]),
    bannerAlt: texto(bruto["banner_alt"]),
    bannerLink: texto(bruto["banner_link"]),
    campanhaNome: texto(bruto["campanha_nome"]),
    campanhaTipoBonus: bonus(bruto["campanha_tipo_bonus"]),
    campanhaDescricaoBonus: texto(bruto["campanha_descricao_bonus"]),
    campanhaValor: texto(bruto["campanha_valor"]),
  };
}

/**
 * A configuração da indicação.
 *
 * Uma falha aqui não derruba nada: o painel do cliente segue com o texto
 * padrão e a indicação ligada, que é o comportamento de antes de existir esta
 * tabela.
 */
export async function lerConfigIndicacao(): Promise<ConfigIndicacao> {
  const sql = getClient();
  if (!sql) return CONFIG_INDICACAO_PADRAO;

  try {
    const linhas = (await sql<LinhaConfig[]>`
      select valor
      from ${sql(schema())}.${sql(tabela())}
      where chave = ${CHAVE_INDICACAO}
      limit 1
    `) as unknown as LinhaConfig[];
    return normalizarConfigIndicacao(linhas[0]?.valor ?? null);
  } catch (err) {
    console.error(
      "Falha ao ler a configuração da indicação — usando o padrão. " +
        "Rode docs/n8n/schema-admin.sql se a tabela ainda não existe.",
      err,
    );
    return CONFIG_INDICACAO_PADRAO;
  }
}

/** Grava a configuração da indicação. Só o /admin chama. */
export async function gravarConfigIndicacao(config: ConfigIndicacao): Promise<void> {
  const sql = getClient();
  if (!sql) throw new Error("Postgres não configurado (POSTGRES_URL/POSTGRES_HOST).");

  /*
   * As chaves do JSON são as do banco (snake_case), e não as do TypeScript:
   * quem abre a linha no `psql` para conferir um texto lê o mesmo nome que vê
   * no resto do schema.
   */
  const valor = {
    ativo: config.ativo,
    titulo: config.titulo,
    descricao: config.descricao,
    banner_desktop_url: config.bannerDesktopUrl,
    banner_mobile_url: config.bannerMobileUrl,
    banner_alt: config.bannerAlt,
    banner_link: config.bannerLink,
    campanha_nome: config.campanhaNome,
    campanha_tipo_bonus: config.campanhaTipoBonus,
    campanha_descricao_bonus: config.campanhaDescricaoBonus,
    campanha_valor: config.campanhaValor,
  };

  /*
   * `sql.json` e não `JSON.stringify`: o postgres.js já serializa o objeto para
   * a coluna `jsonb`. Mandar o texto pronto faz ele serializar de novo, e o que
   * fica gravado é uma **string** JSON — `"{\"ativo\":true}"` em vez de
   * `{"ativo": true}`. A tela some com o ajuste sem erro nenhum no caminho.
   */
  await sql`
    insert into ${sql(schema())}.${sql(tabela())} (chave, valor)
    values (${CHAVE_INDICACAO}, ${sql.json(valor)})
    on conflict (chave) do update set valor = excluded.valor
  `;
}
