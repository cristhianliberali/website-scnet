/**
 * O painel do cliente lido direto do Postgres.
 *
 * **Por que existe.** Até aqui toda leitura do painel ia ao n8n, que ia ao
 * banco. Para dado que já está numa tabela nossa, isso é um salto a mais no
 * caminho — e um ponto a mais para falhar. Este módulo faz a consulta de
 * abertura (`painel_bootstrap`) direto, e o n8n continua dono do que ele faz de
 * melhor: as **ações** (abrir chamado, trocar de plano, gerar segunda via),
 * que mexem em sistemas que só ele alcança.
 *
 * **O que autoriza a consulta.** O `id_cliente` sai do cookie de sessão, que é
 * selado (criptografado e assinado com `SESSION_SECRET`) e foi escrito pelo n8n
 * no login. O navegador não lê nem forja esse cookie, e nenhuma função daqui
 * aceita um id vindo do formulário — é por isso que um `WHERE cod_cliente = $1`
 * basta para ninguém enxergar o cliente do vizinho.
 *
 * **Leitura é sempre daqui.** O webhook ficou com o que só ele faz: as ações
 * (abrir chamado, trocar de plano, gerar segunda via), que mexem em sistemas
 * que o site não alcança. Consulta não passa mais por lá — antes passava, como
 * reserva, e essa reserva escondia por dias que o banco estava errado: a tela
 * carregava vazia em vez de dizer que não conseguiu ler.
 *
 * Variáveis próprias deste módulo:
 *
 *   POSTGRES_CLIENTES_TABLE    padrão "clientes_web"
 *   POSTGRES_CONTRATOS_TABLE   padrão "contratos_web"
 *   POSTGRES_FATURAS_TABLE     padrão "faturas_web"
 *
 * O schema está em `docs/n8n/schema-painel.sql`.
 */

import { env, getClient, identifier, type Sql } from "./postgres.server";
import type { DadosPainel, ValorJson } from "./cliente-tipos";

const DEFAULT_SCHEMA = "public";
const DEFAULT_CLIENTES = "clientes_web";
const DEFAULT_CONTRATOS = "contratos_web";
const DEFAULT_FATURAS = "faturas_web";
const DEFAULT_PLANOS = "planos_web";

/**
 * O que a leitura do painel devolve.
 *
 * O motivo importa: "o banco não respondeu" e "este cliente não está na tabela"
 * pedem mensagens diferentes na tela e ações diferentes de quem opera. Enquanto
 * os dois eram `null`, os dois viravam a mesma tela vazia — e foi isso que fez
 * um banco errado passar dias sem ser notado.
 */
export type LeituraPainel =
  | { ok: true; dados: DadosPainel }
  | { ok: false; motivo: "sem_conexao" | "cliente_ausente" | "erro"; detalhe: string };

/* ---------------- linhas do banco ---------------- */

/** `numeric` e `bigint` chegam como string do postgres.js; `date` vem como texto por `::text`. */
type Texto = string | null;

type ClienteRow = {
  id_cliente: Texto;
  nome: Texto;
  documento: Texto;
  celular: Texto;
  email: Texto;
  data_nascimento: Texto;
  tipo_cadastro: Texto;
  cep: Texto;
  uf: Texto;
  cidade: Texto;
  bairro: Texto;
  logradouro: Texto;
  numero: Texto;
  complemento: Texto;
  status_cliente: Texto;
};

type ContratoRow = {
  cod_contrato: Texto;
  nome_plano: Texto;
  valor: Texto;
  status_contrato: Texto;
  status_fatura: Texto;
  velocidade: Texto;
  composicao: Texto;
  endereco: Texto;
  dia_vencimento: number | null;
  data_adesao: Texto;
  data_vencimento_contrato: Texto;
};

type FaturaRow = {
  codigo_fatura: Texto;
  cod_contrato: Texto;
  status_fatura: Texto;
  descricao: Texto;
  dia_vencimento: number | null;
  data_vencimento: Texto;
  valor_original: Texto;
  valor_atual: Texto;
  linha_digitavel: Texto;
  pix_copia_e_cola: Texto;
};

type PlanoRow = {
  id_plano: Texto;
  nome: Texto;
  valor: Texto;
  composicao: Texto;
  destaque: boolean | null;
  nome_destaque: Texto;
};

const txt = (v: Texto) => v?.trim() ?? "";
const num = (v: Texto) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/* ---------------- montagem do payload ---------------- */

function montarCliente(row: ClienteRow, contratos: ContratoRow[]): ValorJson {
  /*
   * "Cliente desde" não é uma coluna: é a adesão do contrato mais antigo. Um
   * campo separado para isso seria uma segunda verdade sobre o mesmo fato, e as
   * duas divergiriam na primeira migração de cadastro.
   */
  const adesoes = contratos
    .map((c) => txt(c.data_adesao))
    .filter(Boolean)
    .sort();

  return {
    id: txt(row.id_cliente),
    nome: txt(row.nome),
    documento: txt(row.documento),
    email: txt(row.email),
    telefone: txt(row.celular),
    codigo: txt(row.id_cliente),
    data_nascimento: txt(row.data_nascimento),
    tipo_cadastro: txt(row.tipo_cadastro),
    status_cliente: txt(row.status_cliente) || "ativo",
    cliente_desde: adesoes[0] ?? "",
    endereco: {
      cep: txt(row.cep),
      logradouro: txt(row.logradouro),
      numero: txt(row.numero),
      complemento: txt(row.complemento),
      bairro: txt(row.bairro),
      cidade: txt(row.cidade),
      uf: txt(row.uf),
    },
  };
}

/**
 * O título do card do contrato.
 *
 * O cadastro não tem um apelido ("Casa", "Escritório"), e é o endereço que
 * distingue um ponto do outro para quem tem mais de um — então o primeiro
 * trecho dele serve de nome. Sem endereço, sobra o número do contrato, que ao
 * menos identifica a linha.
 */
function apelidoDoContrato(row: ContratoRow): string {
  const endereco = txt(row.endereco);
  const primeiro = endereco.split(",")[0]?.trim();
  if (primeiro) return primeiro;
  const codigo = txt(row.cod_contrato);
  return codigo ? `Contrato ${codigo}` : "Contrato";
}

function montarContrato(row: ContratoRow): ValorJson {
  return {
    id: txt(row.cod_contrato),
    numero: txt(row.cod_contrato),
    apelido: apelidoDoContrato(row),
    plano: txt(row.nome_plano),
    download: txt(row.velocidade),
    valor_mensal: num(row.valor),
    // no banco os dois papéis são colunas separadas, e é assim que a tela lê:
    // `status_contrato` diz se a conexão está de pé, `status_fatura` se o
    // contrato está em dia
    status_conexao: txt(row.status_contrato),
    status_financeiro: txt(row.status_fatura),
    dia_vencimento: row.dia_vencimento ?? 0,
    composicao: txt(row.composicao),
    endereco: txt(row.endereco),
    data_adesao: txt(row.data_adesao),
    data_vencimento_contrato: txt(row.data_vencimento_contrato),
  };
}

function montarFatura(row: FaturaRow): ValorJson {
  return {
    id: txt(row.codigo_fatura),
    id_contrato: txt(row.cod_contrato),
    referencia: txt(row.descricao),
    descricao: txt(row.descricao),
    vencimento: txt(row.data_vencimento),
    dia_vencimento: row.dia_vencimento ?? 0,
    valor_original: num(row.valor_original),
    valor_atual: num(row.valor_atual),
    status: txt(row.status_fatura),
    linha_digitavel: txt(row.linha_digitavel),
    pix_copia_e_cola: txt(row.pix_copia_e_cola),
  };
}

function montarPlano(row: PlanoRow): ValorJson {
  return {
    id: txt(row.id_plano),
    nome: txt(row.nome),
    valor: num(row.valor),
    vantagens: txt(row.composicao),
    destaque: Boolean(row.destaque),
    selo: txt(row.nome_destaque),
  };
}

/* ---------------- a consulta ---------------- */

const tabela = (nome: string, padrao: string, variavel: string) =>
  identifier(env(variavel), padrao, variavel);

/**
 * Monta o painel de um cliente a partir das tabelas.
 *
 * Devolve `null` quando o banco não está configurado ou a consulta falha —
 * quem chamou decide se cai para o webhook. Um `null` nunca significa "cliente
 * sem dados": isso é um objeto com listas vazias.
 */
export async function carregarPainelDoBanco(idCliente: string): Promise<LeituraPainel> {
  const sql = getClient();
  if (!sql) {
    return {
      ok: false,
      motivo: "sem_conexao",
      detalhe: "Postgres não configurado (POSTGRES_URL/POSTGRES_HOST).",
    };
  }

  const schema = identifier(env("POSTGRES_SCHEMA"), DEFAULT_SCHEMA, "POSTGRES_SCHEMA");
  /*
   * `clientes_web` é uma tabela nesta instalação, mas o `schema.sql` também
   * documenta a variante em view — por isso o nome antigo da variável continua
   * aceito. Quem já o definiu não precisa mexer em nada.
   */
  const clientes = env("POSTGRES_CLIENTES_TABLE")
    ? tabela(DEFAULT_CLIENTES, DEFAULT_CLIENTES, "POSTGRES_CLIENTES_TABLE")
    : tabela(DEFAULT_CLIENTES, DEFAULT_CLIENTES, "POSTGRES_CLIENTES_VIEW");
  const contratos = tabela(DEFAULT_CONTRATOS, DEFAULT_CONTRATOS, "POSTGRES_CONTRATOS_TABLE");
  const faturas = tabela(DEFAULT_FATURAS, DEFAULT_FATURAS, "POSTGRES_FATURAS_TABLE");
  const planos = tabela(DEFAULT_PLANOS, DEFAULT_PLANOS, "POSTGRES_PLANOS_TABLE");

  try {
    const [linhasCliente, linhasContratos, linhasFaturas, linhasPlanos] = await Promise.all([
      consultarCliente(sql, schema, clientes, idCliente),
      consultarContratos(sql, schema, contratos, idCliente),
      consultarFaturas(sql, schema, faturas, idCliente),
      consultarPlanos(sql, schema, planos),
    ]);

    const cliente = linhasCliente[0];
    if (!cliente) {
      /*
       * A sessão é válida — o n8n a emitiu — mas o cadastro que o site lê não
       * tem esse cliente. Na prática isso quase sempre significa que o n8n e o
       * site estão olhando bancos diferentes, e é melhor dizer isso do que
       * mostrar um painel vazio como se o cliente não tivesse nada.
       */
      const detalhe = `cliente ${idCliente} não está em ${schema}.${clientes}`;
      console.warn(
        `Painel: ${detalhe}. O n8n autenticou este id, então confira se ele e o site ` +
          "apontam para o MESMO banco (veja /diagnostico?token=...).",
      );
      return { ok: false, motivo: "cliente_ausente", detalhe };
    }

    const dados: DadosPainel = {
      cliente: montarCliente(cliente, linhasContratos),
      contratos: linhasContratos.map(montarContrato),
      faturas: linhasFaturas.map(montarFatura),
      planos: linhasPlanos.map(montarPlano),
      /*
       * Sem tabela ainda: a tela mostra o estado vazio de cada uma. Quando
       * existirem, é aqui que entram — nada mais precisa mudar.
       */
      notas_fiscais: [],
      indicacoes: [],
      chamados: [],
      adicionais: [],
      avisos: [],
      /*
       * Padrão, não política: oferecemos o desbloqueio a quem está com a
       * conexão cortada. Quem decide de verdade quem pode pedir é o provedor —
       * para mandar nisso, responda o formulário `painel_desbloqueio_confianca`
       * com uma recusa.
       */
      desbloqueio_disponivel: linhasContratos.some((c) =>
        ["bloqueado", "suspenso"].includes(txt(c.status_contrato).toLowerCase()),
      ),
    };

    return { ok: true, dados };
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    console.error(`Falha ao carregar o painel do cliente ${idCliente} no Postgres`, err);
    return { ok: false, motivo: "erro", detalhe };
  }
}

function consultarCliente(sql: Sql, schema: string, view: string, idCliente: string) {
  return sql<ClienteRow[]>`
    select
      id_cliente::text        as id_cliente,
      nome, documento, celular, email,
      data_nascimento::text   as data_nascimento,
      tipo_cadastro::text     as tipo_cadastro,
      cep, uf, cidade, bairro, logradouro, numero, complemento,
      status_cliente::text    as status_cliente
    from ${sql(schema)}.${sql(view)}
    where id_cliente = ${idCliente}
    limit 1
  ` as unknown as Promise<ClienteRow[]>;
}

/*
 * Contrato cancelado fica de fora: ele não tem mais nada que o cliente possa
 * fazer na tela, e listá-lo entre os ativos só confunde quem abriu o painel
 * para ver o que tem contratado hoje.
 */
function consultarContratos(sql: Sql, schema: string, tab: string, idCliente: string) {
  return sql<ContratoRow[]>`
    select
      cod_contrato, nome_plano, valor::text as valor,
      status_contrato::text as status_contrato,
      status_fatura::text   as status_fatura,
      velocidade, composicao, endereco, dia_vencimento,
      data_adesao::text              as data_adesao,
      data_vencimento_contrato::text as data_vencimento_contrato
    from ${sql(schema)}.${sql(tab)}
    where cod_cliente = ${idCliente}
      and status_contrato <> 'cancelado'
    order by data_adesao asc nulls last, cod_contrato asc
  ` as unknown as Promise<ContratoRow[]>;
}

/*
 * Fatura cancelada também fica de fora: não é devida, e mostrá-la ao lado das
 * abertas é o tipo de coisa que faz um cliente ligar para o financeiro.
 *
 * O teto de 24 existe porque a tela mostra o histórico recente, não o
 * histórico inteiro — e um cadastro antigo tem centenas de linhas.
 */
function consultarFaturas(sql: Sql, schema: string, tab: string, idCliente: string) {
  return sql<FaturaRow[]>`
    select
      codigo_fatura, cod_contrato,
      status_fatura::text as status_fatura,
      descricao, dia_vencimento,
      data_vencimento::text as data_vencimento,
      valor_original::text  as valor_original,
      valor_atual::text     as valor_atual,
      linha_digitavel, pix_copia_e_cola
    from ${sql(schema)}.${sql(tab)}
    where cod_cliente = ${idCliente}
      and status_fatura <> 'cancelada'
    order by data_vencimento desc nulls last, codigo_fatura desc
    limit 24
  ` as unknown as Promise<FaturaRow[]>;
}

/**
 * Os planos oferecidos na troca de plano — a mesma tabela que alimenta a home.
 *
 * Uma falha aqui não derruba o painel: sem catálogo, o modal de troca mostra o
 * estado vazio e o resto da página continua de pé.
 */
async function consultarPlanos(sql: Sql, schema: string, tab: string): Promise<PlanoRow[]> {
  try {
    return (await sql<PlanoRow[]>`
      select
        id_plano::text as id_plano,
        nome, valor::text as valor, composicao, destaque, nome_destaque
      from ${sql(schema)}.${sql(tab)}
      where ativo is true
      order by ordem_grade asc, id_plano asc
    `) as unknown as PlanoRow[];
  } catch (err) {
    console.error("Falha ao carregar os planos para a troca de plano", err);
    return [];
  }
}
