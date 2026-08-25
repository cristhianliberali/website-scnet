/**
 * O que o painel super admin lê e escreve no Postgres.
 *
 * Quatro assuntos, quatro tabelas:
 *
 *   planos_web        a vitrine — home e /contratacao
 *   planos_upgrade    o catálogo da troca de plano do painel
 *   web_formularios   a fila de atendimento (o que o cliente pediu)
 *   indicacoes_web    as indicações e o bônus de cada uma
 *
 * Tudo aqui roda **depois** da sessão de admin ter sido conferida por quem
 * chamou (`admin.ts`). Nenhuma função deste arquivo confere credencial: elas
 * assumem que quem chegou até aqui já passou pela porta, e é por isso que
 * nenhuma delas pode ser exportada para o navegador.
 *
 * Variáveis de tabela (todas com padrão):
 *
 *   POSTGRES_PLANOS_TABLE           planos_web
 *   POSTGRES_PLANOS_UPGRADE_TABLE   planos_upgrade
 *   POSTGRES_FORMULARIOS_TABLE      web_formularios
 *   POSTGRES_INDICACOES_TABLE       indicacoes_web
 *   POSTGRES_CLIENTES_TABLE         clientes_web
 */

import { env, getClient, identifier, type Sql } from "./postgres.server";
import type {
  CatalogoPlanos,
  IndicacaoAdmin,
  PlanoAdmin,
  SolicitacaoAdmin,
  StatusIndicacaoAdmin,
  StatusSolicitacao,
  TipoBonus,
} from "./admin-tipos";

const DEFAULT_SCHEMA = "public";

const schema = () => identifier(env("POSTGRES_SCHEMA"), DEFAULT_SCHEMA, "POSTGRES_SCHEMA");

const tabelaPlanos = (catalogo: CatalogoPlanos) =>
  catalogo === "site"
    ? identifier(env("POSTGRES_PLANOS_TABLE"), "planos_web", "POSTGRES_PLANOS_TABLE")
    : identifier(
        env("POSTGRES_PLANOS_UPGRADE_TABLE"),
        "planos_upgrade",
        "POSTGRES_PLANOS_UPGRADE_TABLE",
      );

const tabelaFormularios = () =>
  identifier(env("POSTGRES_FORMULARIOS_TABLE"), "web_formularios", "POSTGRES_FORMULARIOS_TABLE");

const tabelaIndicacoes = () =>
  identifier(env("POSTGRES_INDICACOES_TABLE"), "indicacoes_web", "POSTGRES_INDICACOES_TABLE");

const tabelaClientes = () =>
  identifier(
    env("POSTGRES_CLIENTES_TABLE") ?? env("POSTGRES_CLIENTES_VIEW"),
    "clientes_web",
    "POSTGRES_CLIENTES_TABLE",
  );

/** Sem banco não há admin: a tela inteira vive de ler e escrever tabelas. */
function cliente(): Sql {
  const sql = getClient();
  if (!sql) throw new Error("Postgres não configurado (POSTGRES_URL/POSTGRES_HOST).");
  return sql;
}

/* ---------------- conversões ---------------- */

type Texto = string | null;

const txt = (v: Texto | number | boolean | null) =>
  v === null || v === undefined ? "" : String(v).trim();

/** Campo de texto vazio vira `NULL` no banco, e não string vazia. */
const ouNulo = (v: string) => (v.trim() ? v.trim() : null);

/**
 * Número que o formulário digitou.
 *
 * Aceita "129,90" e "129.90" — quem preenche está pensando em dinheiro, não em
 * formato de máquina. Vazio vira `NULL`; texto que não é número vira `NULL`
 * também, em vez de gravar 0 e o preço sumir sem ninguém notar.
 */
function numeroOuNulo(v: string): string | null {
  const limpo = v.trim().replace(/\s/g, "");
  if (!limpo) return null;
  const normalizado =
    limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo.replace(/,/g, "");
  return Number.isFinite(Number(normalizado)) ? normalizado : null;
}

const numeroOuZero = (v: string) => numeroOuNulo(v) ?? "0";

const inteiroOuZero = (v: string) => {
  const n = Number.parseInt(v.trim(), 10);
  return Number.isFinite(n) ? n : 0;
};

/* ---------------- planos ---------------- */

type PlanoRow = {
  id_plano: Texto;
  ativo: boolean | null;
  ordem_grade: number | null;
  destaque: boolean | null;
  codigo_mk: Texto;
  nome: Texto;
  descricao: Texto;
  valor: Texto;
  valor_primeiras_faturas: Texto;
  quant_meses_desconto: number | null;
  composicao_resumo: Texto;
  composicao: Texto;
  url_logo_agregados: Texto;
  nome_destaque: Texto;
  codigo_oferta_mk: Texto;
  codigo_oferta?: Texto;
};

function montarPlano(row: PlanoRow, catalogo: CatalogoPlanos): PlanoAdmin {
  return {
    idPlano: txt(row.id_plano),
    ativo: row.ativo !== false,
    ordemGrade: String(row.ordem_grade ?? 0),
    destaque: Boolean(row.destaque),
    codigoMk: txt(row.codigo_mk),
    nome: txt(row.nome),
    descricao: txt(row.descricao),
    valor: txt(row.valor),
    valorPrimeirasFaturas: txt(row.valor_primeiras_faturas),
    quantMesesDesconto: row.quant_meses_desconto == null ? "" : String(row.quant_meses_desconto),
    composicaoResumo: txt(row.composicao_resumo),
    composicao: txt(row.composicao),
    urlLogoAgregados: txt(row.url_logo_agregados),
    nomeDestaque: txt(row.nome_destaque),
    codigoOfertaMk: txt(row.codigo_oferta_mk),
    ...(catalogo === "site" ? { codigoOferta: txt(row.codigo_oferta ?? null) } : {}),
  };
}

export async function listarPlanos(catalogo: CatalogoPlanos): Promise<PlanoAdmin[]> {
  const sql = cliente();
  const tab = tabelaPlanos(catalogo);

  /*
   * Duas consultas quase iguais, e de propósito: `codigo_oferta` existe só na
   * vitrine. Montar a lista de colunas em tempo de execução para economizar
   * seis linhas deixaria o SQL ilegível e a diferença entre as tabelas
   * escondida atrás de um `if`.
   */
  const linhas =
    catalogo === "site"
      ? ((await sql`
          select
            id_plano::text as id_plano, ativo, ordem_grade, destaque,
            codigo_mk::text as codigo_mk, nome, descricao,
            valor::text as valor,
            valor_primeiras_faturas::text as valor_primeiras_faturas,
            quant_meses_desconto, composicao_resumo, composicao,
            url_logo_agregados, nome_destaque,
            codigo_oferta_mk::text as codigo_oferta_mk,
            codigo_oferta::text as codigo_oferta
          from ${sql(schema())}.${sql(tab)}
          order by ordem_grade asc, id_plano asc
        `) as unknown as PlanoRow[])
      : ((await sql`
          select
            id_plano::text as id_plano, ativo, ordem_grade, destaque,
            codigo_mk::text as codigo_mk, nome, descricao,
            valor::text as valor,
            valor_primeiras_faturas::text as valor_primeiras_faturas,
            quant_meses_desconto, composicao_resumo, composicao,
            url_logo_agregados, nome_destaque,
            codigo_oferta_mk::text as codigo_oferta_mk
          from ${sql(schema())}.${sql(tab)}
          order by ${sql(tab)}.valor asc, ordem_grade asc, id_plano asc
        `) as unknown as PlanoRow[]);

  return linhas.map((row) => montarPlano(row, catalogo));
}

/**
 * Cria ou atualiza um plano.
 *
 * O `id_plano` é a chave, e ele é escolhido por quem cadastra — nas duas
 * tabelas ele não tem `DEFAULT`, porque costuma ser o mesmo número do sistema
 * do provedor. Quando vem vazio, o próximo livre é calculado aqui: cadastrar um
 * plano novo não devia exigir uma consulta antes só para descobrir um número.
 */
export async function salvarPlano(catalogo: CatalogoPlanos, plano: PlanoAdmin): Promise<string> {
  const sql = cliente();
  const tab = tabelaPlanos(catalogo);

  let id = plano.idPlano.trim();
  if (!id) {
    const proximo = (await sql`
      select coalesce(max(id_plano), 0) + 1 as proximo from ${sql(schema())}.${sql(tab)}
    `) as unknown as { proximo: string | number }[];
    id = String(proximo[0]?.proximo ?? 1);
  }

  const comuns = {
    ativo: plano.ativo,
    ordem_grade: inteiroOuZero(plano.ordemGrade),
    destaque: plano.destaque,
    codigo_mk: numeroOuNulo(plano.codigoMk),
    nome: plano.nome.trim(),
    descricao: ouNulo(plano.descricao),
    valor: numeroOuZero(plano.valor),
    valor_primeiras_faturas: numeroOuNulo(plano.valorPrimeirasFaturas),
    quant_meses_desconto: numeroOuNulo(plano.quantMesesDesconto),
    composicao_resumo: ouNulo(plano.composicaoResumo),
    composicao: ouNulo(plano.composicao),
    url_logo_agregados: ouNulo(plano.urlLogoAgregados),
    nome_destaque: ouNulo(plano.nomeDestaque),
    codigo_oferta_mk: numeroOuNulo(plano.codigoOfertaMk),
  };

  if (catalogo === "site") {
    await sql`
      insert into ${sql(schema())}.${sql(tab)} (
        id_plano, ativo, ordem_grade, destaque, codigo_mk, nome, descricao, valor,
        valor_primeiras_faturas, quant_meses_desconto, composicao_resumo, composicao,
        url_logo_agregados, nome_destaque, codigo_oferta_mk, codigo_oferta
      ) values (
        ${id}::bigint, ${comuns.ativo}, ${comuns.ordem_grade}, ${comuns.destaque},
        ${comuns.codigo_mk}::bigint, ${comuns.nome}, ${comuns.descricao},
        ${comuns.valor}::numeric, ${comuns.valor_primeiras_faturas}::numeric,
        ${comuns.quant_meses_desconto}::int, ${comuns.composicao_resumo},
        ${comuns.composicao}, ${comuns.url_logo_agregados}, ${comuns.nome_destaque},
        ${comuns.codigo_oferta_mk}::bigint, ${ouNulo(plano.codigoOferta ?? "")}
      )
      on conflict (id_plano) do update set
        ativo = excluded.ativo,
        ordem_grade = excluded.ordem_grade,
        destaque = excluded.destaque,
        codigo_mk = excluded.codigo_mk,
        nome = excluded.nome,
        descricao = excluded.descricao,
        valor = excluded.valor,
        valor_primeiras_faturas = excluded.valor_primeiras_faturas,
        quant_meses_desconto = excluded.quant_meses_desconto,
        composicao_resumo = excluded.composicao_resumo,
        composicao = excluded.composicao,
        url_logo_agregados = excluded.url_logo_agregados,
        nome_destaque = excluded.nome_destaque,
        codigo_oferta_mk = excluded.codigo_oferta_mk,
        codigo_oferta = excluded.codigo_oferta
    `;
  } else {
    await sql`
      insert into ${sql(schema())}.${sql(tab)} (
        id_plano, ativo, ordem_grade, destaque, codigo_mk, nome, descricao, valor,
        valor_primeiras_faturas, quant_meses_desconto, composicao_resumo, composicao,
        url_logo_agregados, nome_destaque, codigo_oferta_mk
      ) values (
        ${id}::bigint, ${comuns.ativo}, ${comuns.ordem_grade}, ${comuns.destaque},
        ${comuns.codigo_mk}::bigint, ${comuns.nome}, ${comuns.descricao},
        ${comuns.valor}::numeric, ${comuns.valor_primeiras_faturas}::numeric,
        ${comuns.quant_meses_desconto}::int, ${comuns.composicao_resumo},
        ${comuns.composicao}, ${comuns.url_logo_agregados}, ${comuns.nome_destaque},
        ${comuns.codigo_oferta_mk}::bigint
      )
      on conflict (id_plano) do update set
        ativo = excluded.ativo,
        ordem_grade = excluded.ordem_grade,
        destaque = excluded.destaque,
        codigo_mk = excluded.codigo_mk,
        nome = excluded.nome,
        descricao = excluded.descricao,
        valor = excluded.valor,
        valor_primeiras_faturas = excluded.valor_primeiras_faturas,
        quant_meses_desconto = excluded.quant_meses_desconto,
        composicao_resumo = excluded.composicao_resumo,
        composicao = excluded.composicao,
        url_logo_agregados = excluded.url_logo_agregados,
        nome_destaque = excluded.nome_destaque,
        codigo_oferta_mk = excluded.codigo_oferta_mk
    `;
  }

  return id;
}

/**
 * Apaga um plano.
 *
 * Vale lembrar de quem apaga: desativar (`ativo = false`) some da tela do mesmo
 * jeito e preserva o histórico de quem contratou por aquele número. Apagar é
 * para a linha que nunca devia ter existido.
 */
export async function excluirPlano(catalogo: CatalogoPlanos, idPlano: string): Promise<void> {
  const sql = cliente();
  await sql`
    delete from ${sql(schema())}.${sql(tabelaPlanos(catalogo))}
    where id_plano = ${idPlano}::bigint
  `;
}

/* ---------------- solicitações ---------------- */

type SolicitacaoRow = {
  id: Texto;
  protocolo: Texto;
  id_cliente: Texto;
  nome_cliente: Texto;
  formulario: Texto;
  categoria: Texto;
  assunto: Texto;
  descricao: Texto;
  cod_contrato: Texto;
  status: Texto;
  agendado_para: Texto;
  observacao_interna: Texto;
  criado_em: Texto;
  atualizado_em: Texto;
  campos: unknown;
};

const STATUS_SOLICITACAO_VALIDOS: StatusSolicitacao[] = ["em_aberto", "cancelado", "concluido"];

const statusSolicitacao = (v: Texto): StatusSolicitacao =>
  STATUS_SOLICITACAO_VALIDOS.find((s) => s === txt(v)) ?? "em_aberto";

function montarSolicitacao(row: SolicitacaoRow): SolicitacaoAdmin {
  return {
    id: txt(row.id),
    protocolo: txt(row.protocolo),
    idCliente: txt(row.id_cliente),
    nomeCliente: txt(row.nome_cliente),
    formulario: txt(row.formulario),
    categoria: txt(row.categoria),
    assunto: txt(row.assunto),
    descricao: txt(row.descricao),
    codContrato: txt(row.cod_contrato),
    status: statusSolicitacao(row.status),
    agendadoPara: txt(row.agendado_para),
    observacaoInterna: txt(row.observacao_interna),
    criadoEm: txt(row.criado_em),
    atualizadoEm: txt(row.atualizado_em),
    campos: row.campos ? JSON.stringify(row.campos, null, 2) : "",
  };
}

export type FiltroSolicitacoes = {
  status?: StatusSolicitacao | "todos";
  busca?: string;
};

/**
 * A fila de atendimento.
 *
 * O teto de 300 linhas existe porque esta tela é uma fila de trabalho, não um
 * relatório: quem precisa do histórico inteiro tem o banco. A busca cobre
 * protocolo, cliente e assunto — que é por onde alguém procura quando o cliente
 * liga.
 */
export async function listarSolicitacoes(filtro: FiltroSolicitacoes): Promise<SolicitacaoAdmin[]> {
  const sql = cliente();
  const status = filtro.status && filtro.status !== "todos" ? filtro.status : null;
  const busca = filtro.busca?.trim() ? `%${filtro.busca.trim()}%` : null;

  const linhas = (await sql`
    select
      f.id::text            as id,
      f.protocolo, f.id_cliente,
      c.nome                as nome_cliente,
      f.formulario, f.categoria, f.assunto, f.descricao, f.cod_contrato,
      f.status::text        as status,
      f.agendado_para::text as agendado_para,
      f.observacao_interna,
      f.criado_em::text     as criado_em,
      f.atualizado_em::text as atualizado_em,
      f.campos
    from ${sql(schema())}.${sql(tabelaFormularios())} f
    left join ${sql(schema())}.${sql(tabelaClientes())} c on c.id_cliente = f.id_cliente
    where (${status}::text is null or f.status::text = ${status})
      and (
        ${busca}::text is null
        or f.protocolo ilike ${busca}
        or f.id_cliente ilike ${busca}
        or coalesce(c.nome, '') ilike ${busca}
        or coalesce(f.assunto, '') ilike ${busca}
        or f.formulario ilike ${busca}
      )
    order by f.criado_em desc
    limit 300
  `) as unknown as SolicitacaoRow[];

  return linhas.map(montarSolicitacao);
}

export type EdicaoSolicitacao = {
  id: string;
  status: StatusSolicitacao;
  assunto: string;
  agendadoPara: string;
  observacaoInterna: string;
};

export async function atualizarSolicitacao(edicao: EdicaoSolicitacao): Promise<void> {
  const sql = cliente();
  await sql`
    update ${sql(schema())}.${sql(tabelaFormularios())}
       set status = ${edicao.status}::public.status_solicitacao,
           assunto = ${ouNulo(edicao.assunto)},
           agendado_para = ${ouNulo(edicao.agendadoPara)}::date,
           observacao_interna = ${ouNulo(edicao.observacaoInterna)}
     where id = ${edicao.id}::bigint
  `;
}

/* ---------------- indicações ---------------- */

type IndicacaoRow = {
  id: Texto;
  protocolo: Texto;
  id_cliente: Texto;
  nome_cliente: Texto;
  nome_indicacao: Texto;
  telefone_indicacao: Texto;
  cidade: Texto;
  observacoes: Texto;
  cod_novo_cliente: Texto;
  cod_contrato_novo_cliente: Texto;
  status: Texto;
  campanha: Texto;
  tipo_bonus: Texto;
  descricao_bonus: Texto;
  valor_indicacao: Texto;
  data: Texto;
};

const STATUS_INDICACAO_VALIDOS: StatusIndicacaoAdmin[] = [
  "em_aberto",
  "sem_sucesso",
  "dados_invalidos",
  "concluido",
];

const statusIndicacao = (v: Texto): StatusIndicacaoAdmin =>
  STATUS_INDICACAO_VALIDOS.find((s) => s === txt(v)) ?? "em_aberto";

const TIPOS_BONUS_VALIDOS: TipoBonus[] = ["desconto_fatura", "premio", "pix"];

const tipoBonus = (v: Texto): TipoBonus => TIPOS_BONUS_VALIDOS.find((t) => t === txt(v)) ?? "";

function montarIndicacao(row: IndicacaoRow): IndicacaoAdmin {
  return {
    id: txt(row.id),
    protocolo: txt(row.protocolo),
    idCliente: txt(row.id_cliente),
    nomeCliente: txt(row.nome_cliente),
    nomeIndicacao: txt(row.nome_indicacao),
    telefoneIndicacao: txt(row.telefone_indicacao),
    cidade: txt(row.cidade),
    observacoes: txt(row.observacoes),
    codNovoCliente: txt(row.cod_novo_cliente),
    codContratoNovoCliente: txt(row.cod_contrato_novo_cliente),
    status: statusIndicacao(row.status),
    campanha: txt(row.campanha),
    tipoBonus: tipoBonus(row.tipo_bonus),
    descricaoBonus: txt(row.descricao_bonus),
    valorIndicacao: txt(row.valor_indicacao),
    data: txt(row.data),
  };
}

export type FiltroIndicacoes = {
  status?: StatusIndicacaoAdmin | "todos";
  busca?: string;
};

export async function listarIndicacoes(filtro: FiltroIndicacoes): Promise<IndicacaoAdmin[]> {
  const sql = cliente();
  const status = filtro.status && filtro.status !== "todos" ? filtro.status : null;
  const busca = filtro.busca?.trim() ? `%${filtro.busca.trim()}%` : null;

  const linhas = (await sql`
    select
      i.id::text              as id,
      i.protocolo, i.id_cliente,
      coalesce(c.nome, i.nome_cliente) as nome_cliente,
      i.nome_indicacao, i.telefone_indicacao, i.cidade, i.observacoes,
      i.cod_novo_cliente, i.cod_contrato_novo_cliente,
      i.status::text          as status,
      i.campanha,
      i.tipo_bonus::text      as tipo_bonus,
      i.descricao_bonus,
      i.valor_indicacao::text as valor_indicacao,
      i.data::text            as data
    from ${sql(schema())}.${sql(tabelaIndicacoes())} i
    left join ${sql(schema())}.${sql(tabelaClientes())} c on c.id_cliente = i.id_cliente
    where (${status}::text is null or i.status::text = ${status})
      and (
        ${busca}::text is null
        or i.protocolo ilike ${busca}
        or i.nome_indicacao ilike ${busca}
        or i.telefone_indicacao ilike ${busca}
        or coalesce(i.cidade, '') ilike ${busca}
        or coalesce(i.campanha, '') ilike ${busca}
        or coalesce(c.nome, i.nome_cliente, '') ilike ${busca}
      )
    order by i.data desc nulls last, i.id desc
    limit 300
  `) as unknown as IndicacaoRow[];

  return linhas.map(montarIndicacao);
}

export type EdicaoIndicacao = {
  id: string;
  nomeIndicacao: string;
  telefoneIndicacao: string;
  cidade: string;
  observacoes: string;
  codNovoCliente: string;
  codContratoNovoCliente: string;
  status: StatusIndicacaoAdmin;
  campanha: string;
  tipoBonus: TipoBonus;
  descricaoBonus: string;
  valorIndicacao: string;
};

/**
 * Salva o que o humano mexeu numa indicação.
 *
 * `cod_novo_cliente` e `cod_contrato_novo_cliente` têm chave estrangeira: um
 * código que não existe no cadastro é recusado pelo banco, e a mensagem sobe
 * para a tela. É o comportamento que se quer — vincular a indicação a um
 * contrato inventado é pior do que não vincular.
 */
export async function salvarIndicacao(edicao: EdicaoIndicacao): Promise<void> {
  const sql = cliente();
  await sql`
    update ${sql(schema())}.${sql(tabelaIndicacoes())}
       set nome_indicacao = ${edicao.nomeIndicacao.trim()},
           telefone_indicacao = ${edicao.telefoneIndicacao.replace(/\D/g, "")},
           cidade = ${ouNulo(edicao.cidade)},
           observacoes = ${ouNulo(edicao.observacoes)},
           cod_novo_cliente = ${ouNulo(edicao.codNovoCliente)},
           cod_contrato_novo_cliente = ${ouNulo(edicao.codContratoNovoCliente)},
           status = ${edicao.status}::public.status_indicacao,
           campanha = ${ouNulo(edicao.campanha)},
           tipo_bonus = ${edicao.tipoBonus || null}::public.tipo_bonus_indicacao,
           descricao_bonus = ${ouNulo(edicao.descricaoBonus)},
           valor_indicacao = ${numeroOuNulo(edicao.valorIndicacao)}::numeric
     where id = ${edicao.id}::bigint
  `;
}

export async function excluirIndicacao(id: string): Promise<void> {
  const sql = cliente();
  await sql`
    delete from ${sql(schema())}.${sql(tabelaIndicacoes())} where id = ${id}::bigint
  `;
}

/* ---------------- resumo ---------------- */

export type ResumoAdmin = {
  planosSite: number;
  planosUpgrade: number;
  solicitacoesAbertas: number;
  indicacoesAbertas: number;
};

/**
 * Os quatro números do topo da tela.
 *
 * Cada `count` vai num `catch` próprio: uma tabela que ainda não existe deixa
 * aquele número em zero em vez de derrubar a tela inteira — que é o que
 * aconteceria no primeiro acesso de quem ainda não rodou o SQL.
 */
export async function resumoAdmin(): Promise<ResumoAdmin> {
  const sql = cliente();

  const contar = async (consulta: Promise<unknown>) => {
    try {
      const linhas = (await consulta) as { n: number | string }[];
      return Number(linhas[0]?.n ?? 0);
    } catch {
      return 0;
    }
  };

  const [planosSite, planosUpgrade, solicitacoesAbertas, indicacoesAbertas] = await Promise.all([
    contar(sql`select count(*)::int as n from ${sql(schema())}.${sql(tabelaPlanos("site"))}`),
    contar(sql`select count(*)::int as n from ${sql(schema())}.${sql(tabelaPlanos("upgrade"))}`),
    contar(
      sql`select count(*)::int as n from ${sql(schema())}.${sql(tabelaFormularios())}
          where status = 'em_aberto'`,
    ),
    contar(
      sql`select count(*)::int as n from ${sql(schema())}.${sql(tabelaIndicacoes())}
          where status = 'em_aberto'`,
    ),
  ]);

  return { planosSite, planosUpgrade, solicitacoesAbertas, indicacoesAbertas };
}
