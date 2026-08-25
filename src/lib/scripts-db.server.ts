/**
 * Os trechos de código (tags) que o /admin cola na página.
 *
 * ## O problema: isto é lido em TODA requisição
 *
 * Rastreamento entra em toda página, de todo visitante. Uma consulta ao banco
 * por requisição transformaria o Postgres no gargalo do site inteiro — e, pior,
 * uma oscilação do banco viraria página lenta para quem só queria ver os planos.
 *
 * ## A solução: o banco é consultado uma vez por minuto, no máximo
 *
 * Os trechos vivem numa linha de `web_config` (chave `scripts`), como todo o
 * resto que o /admin edita. Mas nada disso é lido durante a requisição:
 *
 * 1. Na primeira requisição depois de o container subir, o servidor lê a linha
 *    UMA vez e guarda na memória do processo — já **montada como texto pronto**,
 *    os três blocos de HTML separados por posição. Montar o HTML é trabalho que
 *    não precisa ser refeito a cada visita.
 * 2. Daí em diante, servir uma página custa exatamente três concatenações de
 *    texto. Zero consulta, zero espera.
 * 3. O texto guardado vale por `SCRIPTS_CACHE_SECONDS` (padrão 60). Passado o
 *    prazo, a próxima requisição relê e guarda de novo — uma consulta por
 *    minuto, no pior caso.
 * 4. **Salvar no /admin apaga a memória na hora.** Nesse processo, a mudança é
 *    instantânea; em outros containers (se houver mais de um), ela entra quando
 *    o prazo do item 3 vencer. É por isso que o prazo é curto.
 *
 * ## E se o banco cair
 *
 * O último texto bom continua sendo servido, mesmo vencido, e a falha vai para
 * o log. As tags não param de funcionar porque o banco piscou — e, no primeiro
 * arranque com o banco fora, o site sobe sem tags em vez de não subir.
 *
 * Nenhuma migração é necessária: `web_config` já existe desde
 * `docs/n8n/schema-admin.sql`.
 */

import { randomUUID } from "node:crypto";

import { env, getClient, identifier } from "./postgres.server";
import { POSICOES_SCRIPT, type PosicaoScript, type ScriptAdmin } from "./admin-tipos";

const DEFAULT_SCHEMA = "public";
const DEFAULT_CONFIG = "web_config";

export const CHAVE_SCRIPTS = "scripts";

/** Teto por trecho e no total — um `web_config` gigante atrasaria o arranque. */
export const MAX_CODIGO = 20_000;
export const MAX_SCRIPTS = 30;

const schema = () => identifier(env("POSTGRES_SCHEMA"), DEFAULT_SCHEMA, "POSTGRES_SCHEMA");
const tabela = () =>
  identifier(env("POSTGRES_CONFIG_TABLE"), DEFAULT_CONFIG, "POSTGRES_CONFIG_TABLE");

/** Por quanto tempo o texto montado vale sem reler o banco. 0 desliga o cache. */
function segundosDeCache(): number {
  const bruto = env("SCRIPTS_CACHE_SECONDS");
  if (bruto === undefined) return 60;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0) return 60;
  return Math.min(n, 3600);
}

/* ---------------- leitura e normalização ---------------- */

type LinhaConfig = { valor: unknown };

const texto = (v: unknown) => (typeof v === "string" ? v : "");

const posicao = (v: unknown): PosicaoScript => {
  const valor = texto(v);
  return valor in POSICOES_SCRIPT ? (valor as PosicaoScript) : "head";
};

/**
 * O que veio do `jsonb` virando lista tipada.
 *
 * Defensivo de propósito: esta linha pode ter sido editada à mão no pgAdmin, e
 * um campo com o tipo errado não pode derrubar o site inteiro — ele só perde
 * aquele trecho.
 */
function normalizar(bruto: unknown): ScriptAdmin[] {
  if (!Array.isArray(bruto)) return [];
  const lista: ScriptAdmin[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const codigo = texto(o["codigo"]);
    if (!codigo.trim()) continue;
    lista.push({
      id: texto(o["id"]) || randomUUID(),
      nome: texto(o["nome"]).slice(0, 120),
      posicao: posicao(o["posicao"]),
      codigo: codigo.slice(0, MAX_CODIGO),
      ativo: typeof o["ativo"] === "boolean" ? o["ativo"] : true,
      atualizadoEm: texto(o["atualizado_em"]) || texto(o["atualizadoEm"]),
    });
  }
  return lista.slice(0, MAX_SCRIPTS);
}

/* ---------------- os três blocos de HTML, prontos ---------------- */

export type BlocosDeScripts = {
  /** Vai antes de `</head>`. */
  head: string;
  /** Vai logo depois da tag `<body>`. */
  bodyInicio: string;
  /** Vai antes de `</body>`. */
  bodyFim: string;
};

export const BLOCOS_VAZIOS: BlocosDeScripts = { head: "", bodyInicio: "", bodyFim: "" };

export const temBlocos = (b: BlocosDeScripts) =>
  b.head !== "" || b.bodyInicio !== "" || b.bodyFim !== "";

/**
 * Junta os trechos ativos de cada posição num texto só.
 *
 * O comentário com o nome fica no HTML de propósito: quem abrir "ver código
 * fonte" para entender de onde saiu um script encontra o nome que você deu a
 * ele no /admin, em vez de um bloco anônimo.
 */
function montar(lista: ScriptAdmin[]): BlocosDeScripts {
  const porPosicao = (p: PosicaoScript) =>
    lista
      .filter((s) => s.ativo && s.posicao === p)
      .map((s) => `\n<!-- scnet:${s.nome || s.id} -->\n${s.codigo}\n`)
      .join("");

  return {
    head: porPosicao("head"),
    bodyInicio: porPosicao("body_inicio"),
    bodyFim: porPosicao("body_fim"),
  };
}

/* ---------------- o cache ---------------- */

type Guardado = { em: number; lista: ScriptAdmin[]; blocos: BlocosDeScripts };

let guardado: Guardado | null = null;
/** Uma leitura em voo, para N requisições simultâneas não virarem N consultas. */
let emVoo: Promise<Guardado> | null = null;

const vencido = (g: Guardado) => Date.now() - g.em >= segundosDeCache() * 1000;

/** Esquece o que está na memória. Chamado ao salvar no /admin. */
export function invalidarScripts(): void {
  guardado = null;
  emVoo = null;
}

async function consultar(): Promise<ScriptAdmin[]> {
  const sql = getClient();
  if (!sql) return [];

  const linhas = (await sql<LinhaConfig[]>`
    select valor
    from ${sql(schema())}.${sql(tabela())}
    where chave = ${CHAVE_SCRIPTS}
    limit 1
  `) as unknown as LinhaConfig[];

  return normalizar(linhas[0]?.valor ?? null);
}

async function recarregar(): Promise<Guardado> {
  try {
    const lista = await consultar();
    const novo: Guardado = { em: Date.now(), lista, blocos: montar(lista) };
    guardado = novo;
    return novo;
  } catch (err) {
    console.error(
      "Falha ao ler os scripts do /admin. " +
        (guardado
          ? "Seguindo com a última versão boa."
          : "Nenhuma tag será inserida até o banco responder."),
      err,
    );
    // Sem banco, o site sobe sem tags — nunca sem site.
    const novo: Guardado = guardado ?? { em: Date.now(), lista: [], blocos: BLOCOS_VAZIOS };
    // Não renova o carimbo de uma versão vencida: assim a próxima requisição
    // tenta de novo em vez de esperar mais um minuto para descobrir que voltou.
    return novo;
  } finally {
    emVoo = null;
  }
}

/**
 * Os blocos prontos para injetar. É isto que a requisição chama.
 *
 * Caminho comum: devolve o que já está na memória, sem `await` de banco nenhum.
 */
export async function blocosDeScripts(): Promise<BlocosDeScripts> {
  if (guardado && !vencido(guardado)) return guardado.blocos;
  if (!emVoo) emVoo = recarregar();
  return (await emVoo).blocos;
}

/* ---------------- o que o /admin usa ---------------- */

/** A lista para a tela do admin — sempre fresca, que é o que se espera ao editar. */
export async function listarScripts(): Promise<ScriptAdmin[]> {
  const sql = getClient();
  if (!sql) return [];
  return consultar();
}

async function gravarLista(lista: ScriptAdmin[]): Promise<void> {
  const sql = getClient();
  if (!sql) throw new Error("Postgres não configurado (POSTGRES_URL/POSTGRES_HOST).");

  // Chaves em snake_case, como o resto do schema: quem abrir a linha no pgAdmin
  // lê os mesmos nomes que vê nas outras tabelas.
  const valor = lista.map((s) => ({
    id: s.id,
    nome: s.nome,
    posicao: s.posicao,
    codigo: s.codigo,
    ativo: s.ativo,
    atualizado_em: s.atualizadoEm,
  }));

  // `sql.json` e não `JSON.stringify`: o postgres.js serializa para `jsonb`
  // sozinho, e mandar o texto pronto grava uma *string* JSON em vez do array.
  await sql`
    insert into ${sql(schema())}.${sql(tabela())} (chave, valor)
    values (${CHAVE_SCRIPTS}, ${sql.json(valor)})
    on conflict (chave) do update set valor = excluded.valor
  `;

  // A mudança precisa valer na próxima requisição, e não daqui a um minuto.
  invalidarScripts();
}

/**
 * Cria ou atualiza um trecho, devolvendo a lista nova.
 *
 * Lê-modifica-grava no servidor, e não "a tela manda a lista inteira": se duas
 * abas do admin estiverem abertas, a que salvar depois não apaga o que a outra
 * criou — ela só substitui o próprio item.
 */
export async function salvarScript(script: ScriptAdmin): Promise<string> {
  const lista = await listarScripts();
  const agora = new Date().toISOString();
  const id = script.id || randomUUID();

  const atualizado: ScriptAdmin = { ...script, id, atualizadoEm: agora };
  const i = lista.findIndex((s) => s.id === id);

  if (i >= 0) {
    lista[i] = atualizado;
  } else {
    if (lista.length >= MAX_SCRIPTS) {
      throw new Error(`Limite de ${MAX_SCRIPTS} trechos atingido. Apague algum antes de incluir.`);
    }
    lista.push(atualizado);
  }

  await gravarLista(lista);
  return id;
}

export async function excluirScript(id: string): Promise<void> {
  const lista = await listarScripts();
  await gravarLista(lista.filter((s) => s.id !== id));
}
