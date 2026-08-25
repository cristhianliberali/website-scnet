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
import { minScore, ultimosVereditos, type RegistroVeredito } from "./verify-recaptcha";

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
  /** Preenchido = plano de campanha: some da home sem ?codigo_oferta= na URL. */
  codigo_oferta: string | null;
};

export type OndeEsta = { tabela: string; schemas: string[] };

/**
 * O estado do reCAPTCHA, que é a segunda pergunta cara deste site: "por que não
 * deixa enviar o formulário?".
 *
 * Ela era impossível de responder de fora. A recusa chega ao cliente como uma
 * frase só ("não conseguimos confirmar que você não é um robô") e os motivos
 * possíveis são cinco, quatro deles sem relação com robô nenhum. Aqui estão os
 * três dados que separam um do outro: se a chave PÚBLICA entrou no build, se a
 * chave SECRETA existe no servidor, e o que o Google respondeu nas últimas
 * recusas.
 */
export type RecaptchaDiag = {
  /**
   * A VITE_RECAPTCHA_SITE_KEY chegou ao bundle. É a pegadinha mais comum da
   * implantação: no EasyPanel, variável VITE_* precisa estar também em
   * "Build Args" — só como Environment Variable ela não entra no JavaScript que
   * vai ao navegador, e aí NENHUM token é gerado e TODO envio é recusado.
   */
  site_key_no_bundle: boolean;
  /** A chave pública, que é pública mesmo — está no HTML. Serve para conferir com o painel do Google. */
  site_key: string | null;
  secret_no_servidor: boolean;
  /** Sem a secret, a verificação está desligada e nada é bloqueado por ela. */
  verificacao_ligada: boolean;
  /** Corte de score em vigor (RECAPTCHA_MIN_SCORE). 0 = não bloqueia por score. */
  min_score: number;
  /** Domínio derivado de VITE_SITE_URL; token emitido em outro domínio é recusado. */
  hostname_esperado: string | null;
  /** As últimas recusas e indisponibilidades, com o motivo do Google. */
  ultimos_bloqueios: RegistroVeredito[];
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
  recaptcha: RecaptchaDiag;
  tabelas: TabelaDiag[];
  colunas_faltando_em_clientes_web: string[];
  /** Outros bancos no MESMO servidor — o SQL pode ter sido rodado num deles. */
  bancos_no_servidor: string[];
  /** Em quais schemas deste banco cada tabela aparece, se aparecer. */
  onde_estao_as_tabelas: OndeEsta[];
  planos: {
    tabela: string;
    /** Linhas na tabela, sem filtro nenhum. */
    total: number;
    ativos: PlanoDiag[];
    /** Dos ativos, quantos são de campanha (some da home sem ?codigo_oferta=). */
    restritos_a_campanha: number;
    /** Os que a home mostra de verdade: ativos e sem `codigo_oferta`. */
    aparecem_na_home: number;
    erro: string | null;
  };
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

/** As tabelas que o site usa, pelo nome padrão — para procurá-las pelo servidor. */
const CONHECIDAS = [
  "clientes_web",
  "contratos_web",
  "faturas_web",
  "planos_web",
  "planos_upgrade",
  "indicacoes_web",
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
    POSTGRES_PLANOS_UPGRADE_TABLE:
      env("POSTGRES_PLANOS_UPGRADE_TABLE") ?? "(vazia → planos_upgrade)",
    POSTGRES_INDICACOES_TABLE: env("POSTGRES_INDICACOES_TABLE") ?? "(vazia → indicacoes_web)",
    PAINEL_EVENTOS: env("PAINEL_EVENTOS") ?? "(vazia → auto)",
    PAINEL_CACHE_SECONDS: env("PAINEL_CACHE_SECONDS") ?? "(vazia → 60)",
    WEBHOOK_LOGIN_URL: env("WEBHOOK_LOGIN_URL") ? "(definida)" : "(vazia)",
    SESSION_SECRET: segredo(env("SESSION_SECRET")),
  };
}

const mensagem = (err: unknown) => (err instanceof Error ? err.message : String(err));

function recaptchaDiag(): RecaptchaDiag {
  // Lido pelo nome literal: é assim que o Vite substitui o valor no build, e é
  // exatamente o mesmo valor que foi para o navegador — por isso este campo
  // responde de verdade se a Build Arg chegou.
  const siteKey = (import.meta.env["VITE_RECAPTCHA_SITE_KEY"] as string | undefined)?.trim();
  const siteUrl = (import.meta.env["VITE_SITE_URL"] as string | undefined)?.trim();
  const secret = Boolean(env("RECAPTCHA_SECRET_KEY"));

  let hostname: string | null = null;
  try {
    if (siteUrl) hostname = new URL(siteUrl).hostname;
  } catch {
    hostname = null;
  }

  return {
    site_key_no_bundle: Boolean(siteKey),
    site_key: siteKey || null,
    secret_no_servidor: secret,
    verificacao_ligada: secret,
    min_score: minScore(),
    hostname_esperado: hostname,
    ultimos_bloqueios: ultimosVereditos(),
  };
}

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
    // Antes de qualquer coisa de banco: o reCAPTCHA não depende do Postgres, e
    // precisa aparecer no relatório mesmo quando a conexão falha logo abaixo.
    recaptcha: recaptchaDiag(),
    tabelas: [],
    colunas_faltando_em_clientes_web: [],
    bancos_no_servidor: [],
    onde_estao_as_tabelas: [],
    planos: {
      tabela: `${schema}.${tabelaPlanos}`,
      total: 0,
      ativos: [],
      restritos_a_campanha: 0,
      aparecem_na_home: 0,
      erro: null,
    },
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
    /*
     * As duas do painel novo. Elas entram na lista porque a pergunta que traz
     * alguém a esta página é sempre "por que a tela está vazia?", e uma tabela
     * que não existe é a resposta mais comum.
     */
    identifier(
      env("POSTGRES_PLANOS_UPGRADE_TABLE"),
      "planos_upgrade",
      "POSTGRES_PLANOS_UPGRADE_TABLE",
    ),
    identifier(env("POSTGRES_INDICACOES_TABLE"), "indicacoes_web", "POSTGRES_INDICACOES_TABLE"),
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
   * "A tabela não existe" quase nunca é a resposta útil. As duas perguntas
   * seguintes é que resolvem, e são as que ninguém pensa em fazer:
   *
   *   - ela existe em OUTRO SCHEMA deste mesmo banco?
   *   - ou o SQL foi rodado em outro BANCO do mesmo servidor?
   *
   * O segundo caso é o mais traiçoeiro: conectar no servidor certo e rodar o
   * SQL no banco errado parece ter dado certo — o comando não reclama de nada.
   */
  try {
    const achadas = (await sql`
      select table_name::text as tabela, table_schema::text as schema
        from information_schema.tables
       where table_name = any(${CONHECIDAS})
       order by table_name, table_schema
    `) as unknown as { tabela: string; schema: string }[];

    const porTabela = new Map<string, string[]>();
    for (const a of achadas) {
      porTabela.set(a.tabela, [...(porTabela.get(a.tabela) ?? []), a.schema]);
    }
    base.onde_estao_as_tabelas = CONHECIDAS.map((tabela) => ({
      tabela,
      schemas: porTabela.get(tabela) ?? [],
    }));
  } catch {
    // catálogo indisponível é detalhe — o resto do relatório continua valendo
  }

  try {
    const bancos = (await sql`
      select datname::text as nome from pg_database
       where not datistemplate and datallowconn order by datname
    `) as unknown as { nome: string }[];
    base.bancos_no_servidor = bancos.map((b) => b.nome);
  } catch {
    // idem
  }

  /*
   * Os planos que a home renderizaria agora, lidos na hora — sem passar pelo
   * cache de `planos-db.ts`. É o que responde "de onde vêm esses planos": se a
   * lista aqui for a que está na tela, ela vem deste banco.
   */
  try {
    const linhas = (await sql.unsafe(
      `select id_plano::text as id_plano, nome, valor::text as valor, ativo, ordem_grade,
              nullif(trim(coalesce(codigo_oferta, '')), '') as codigo_oferta
         from "${schema}"."${tabelaPlanos}"
        order by ordem_grade asc, id_plano asc`,
    )) as unknown as PlanoDiag[];
    base.planos.total = linhas.length;
    base.planos.ativos = linhas.filter((p) => p.ativo);
    base.planos.restritos_a_campanha = base.planos.ativos.filter((p) => p.codigo_oferta).length;
    base.planos.aparecem_na_home = base.planos.ativos.length - base.planos.restritos_a_campanha;
  } catch (err) {
    base.planos.erro = mensagem(err);
  }

  return base;
}
