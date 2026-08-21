/**
 * O que o servidor de fato enxerga do Postgres — para responder "de onde vêm
 * esses dados?" sem depender de log nem de acesso ao container.
 *
 * Existe porque duas perguntas ficaram caras de responder: **qual banco** o
 * processo abriu, e **quais linhas** ele leria agora. As duas são triviais para
 * o servidor e invisíveis de fora, e a falta delas transformou um erro de
 * configuração numa caça de dias.
 *
 * Nada aqui é ligado por padrão: sem `DIAGNOSTICO_TOKEN` a página não existe.
 * E nada aqui devolve segredo — senhas e tokens saem como "(definida)".
 */

import { env, getClient, identifier } from "./postgres.server";

export type TabelaDiag = {
  nome: string;
  existe: boolean;
  linhas: number | null;
  erro: string | null;
};

export type PlanoDiag = {
  id_plano: string;
  nome: string;
  valor: string;
  ativo: boolean;
  ordem_grade: number;
};

export type Diagnostico = {
  gerado_em: string;
  ambiente: Record<string, string>;
  conexao: {
    ok: boolean;
    erro: string | null;
    banco: string | null;
    usuario: string | null;
    servidor: string | null;
    porta: number | null;
  };
  schema: string;
  tabelas: TabelaDiag[];
  colunas_faltando_em_clientes_web: string[];
  planos: { tabela: string; total: number; ativos: PlanoDiag[]; erro: string | null };
};

/** Esconde a senha dentro da URL de conexão, mantendo host e banco visíveis. */
const mascararUrl = (u: string) => u.replace(/:\/\/([^:@/]+):([^@]*)@/, "://$1:***@");

/** As colunas que o painel exige em `clientes_web` (veja `schema-painel.sql`). */
const COLUNAS_PAINEL = [
  "data_nascimento",
  "tipo_cadastro",
  "cep",
  "uf",
  "cidade",
  "bairro",
  "logradouro",
  "numero",
  "complemento",
  "status_cliente",
];

function ambiente(): Record<string, string> {
  const url = env("POSTGRES_URL");
  const segredo = (v: string | undefined) => (v ? "(definida)" : "(vazia)");

  return {
    POSTGRES_URL: url ? mascararUrl(url) : "(vazia)",
    POSTGRES_HOST: env("POSTGRES_HOST") ?? "(vazia)",
    POSTGRES_PORT: env("POSTGRES_PORT") ?? "(vazia → 5432)",
    POSTGRES_DB: env("POSTGRES_DB") ?? "(vazia → postgres)",
    POSTGRES_USER: env("POSTGRES_USER") ?? "(vazia → postgres)",
    POSTGRES_PASSWORD: segredo(env("POSTGRES_PASSWORD")),
    POSTGRES_SSL: env("POSTGRES_SSL") ?? "(vazia → false)",
    POSTGRES_SCHEMA: env("POSTGRES_SCHEMA") ?? "(vazia → public)",
    POSTGRES_PLANOS_TABLE: env("POSTGRES_PLANOS_TABLE") ?? "(vazia → planos_web)",
    POSTGRES_PLANOS_CACHE_SECONDS: env("POSTGRES_PLANOS_CACHE_SECONDS") ?? "(vazia → 60)",
    POSTGRES_CLIENTES_TABLE: env("POSTGRES_CLIENTES_TABLE") ?? "(vazia → clientes_web)",
    POSTGRES_CONTRATOS_TABLE: env("POSTGRES_CONTRATOS_TABLE") ?? "(vazia → contratos_web)",
    POSTGRES_FATURAS_TABLE: env("POSTGRES_FATURAS_TABLE") ?? "(vazia → faturas_web)",
    PAINEL_FONTE: env("PAINEL_FONTE") ?? "(vazia → auto)",
    PAINEL_EVENTOS: env("PAINEL_EVENTOS") ?? "(vazia → auto)",
    PAINEL_CACHE_SECONDS: env("PAINEL_CACHE_SECONDS") ?? "(vazia → 60)",
    WEBHOOK_LOGIN_URL: env("WEBHOOK_LOGIN_URL") ? "(definida)" : "(vazia)",
    SESSION_SECRET: segredo(env("SESSION_SECRET")),
  };
}

const mensagem = (err: unknown) => (err instanceof Error ? err.message : String(err));

export async function coletarDiagnostico(): Promise<Diagnostico> {
  const schema = identifier(env("POSTGRES_SCHEMA"), "public", "POSTGRES_SCHEMA");
  const tabelaPlanos = identifier(
    env("POSTGRES_PLANOS_TABLE"),
    "planos_web",
    "POSTGRES_PLANOS_TABLE",
  );

  const base: Diagnostico = {
    gerado_em: new Date().toISOString(),
    ambiente: ambiente(),
    conexao: { ok: false, erro: null, banco: null, usuario: null, servidor: null, porta: null },
    schema,
    tabelas: [],
    colunas_faltando_em_clientes_web: [],
    planos: { tabela: `${schema}.${tabelaPlanos}`, total: 0, ativos: [], erro: null },
  };

  const sql = getClient();
  if (!sql) {
    base.conexao.erro = "Postgres não configurado (POSTGRES_URL/POSTGRES_HOST).";
    return base;
  }

  // Quem é o banco do outro lado. É a pergunta que o resto do relatório depende.
  try {
    const linhas = (await sql`
      select current_database()::text                              as banco,
             current_user::text                                    as usuario,
             coalesce(inet_server_addr()::text, '(socket local)')   as servidor,
             inet_server_port()                                    as porta
    `) as unknown as { banco: string; usuario: string; servidor: string; porta: number }[];
    const i = linhas[0];
    if (i) {
      base.conexao = { ok: true, erro: null, ...i };
    }
  } catch (err) {
    base.conexao.erro = mensagem(err);
    return base;
  }

  const nomes = [
    identifier(env("POSTGRES_CLIENTES_TABLE"), "clientes_web", "POSTGRES_CLIENTES_TABLE"),
    identifier(env("POSTGRES_CONTRATOS_TABLE"), "contratos_web", "POSTGRES_CONTRATOS_TABLE"),
    identifier(env("POSTGRES_FATURAS_TABLE"), "faturas_web", "POSTGRES_FATURAS_TABLE"),
    tabelaPlanos,
  ];

  for (const nome of nomes) {
    const diag: TabelaDiag = { nome, existe: false, linhas: null, erro: null };
    try {
      const r = (await sql`
        select to_regclass(${`${schema}.${nome}`}) is not null as existe
      `) as unknown as { existe: boolean }[];
      diag.existe = Boolean(r[0]?.existe);

      if (diag.existe) {
        const c = (await sql.unsafe(
          `select count(*)::int as n from "${schema}"."${nome}"`,
        )) as unknown as { n: number }[];
        diag.linhas = c[0]?.n ?? null;
      }
    } catch (err) {
      diag.erro = mensagem(err);
    }
    base.tabelas.push(diag);
  }

  // As colunas que o painel exige — a ausência delas quebra a consulta inteira.
  try {
    const clientes = nomes[0] as string;
    const cols = (await sql`
      select column_name::text as nome
        from information_schema.columns
       where table_schema = ${schema} and table_name = ${clientes}
    `) as unknown as { nome: string }[];
    const presentes = new Set(cols.map((c) => c.nome));
    base.colunas_faltando_em_clientes_web = COLUNAS_PAINEL.filter((c) => !presentes.has(c));
  } catch (err) {
    base.colunas_faltando_em_clientes_web = [`(não deu para conferir: ${mensagem(err)})`];
  }

  /*
   * Os planos que a home renderizaria agora, lidos na hora — sem passar pelo
   * cache de `planos-db.ts`. É o que responde "de onde vêm esses planos": se a
   * lista aqui for a que está na tela, ela vem deste banco.
   */
  try {
    const linhas = (await sql.unsafe(
      `select id_plano::text as id_plano, nome, valor::text as valor, ativo, ordem_grade
         from "${schema}"."${tabelaPlanos}"
        order by ordem_grade asc, id_plano asc`,
    )) as unknown as PlanoDiag[];
    base.planos.total = linhas.length;
    base.planos.ativos = linhas.filter((p) => p.ativo);
  } catch (err) {
    base.planos.erro = mensagem(err);
  }

  return base;
}
