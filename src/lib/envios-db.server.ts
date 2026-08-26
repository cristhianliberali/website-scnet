/**
 * Os envios de formulário do site, no Postgres.
 *
 * Uma tabela, um arquivo: aqui mora tudo que toca `web_envios` — a gravação
 * feita pelos formulários públicos e a leitura feita pelo /admin. Separá-las
 * em dois módulos deixaria a forma da linha escrita em dois lugares, e é
 * justamente aí que uma coluna nova entra num e não no outro.
 *
 * ## A regra que rege este arquivo: gravar NUNCA derruba um envio
 *
 * Toda função de escrita engole o próprio erro. Sem banco, sem tabela, coluna
 * faltando, disco cheio — o cliente não pode ver um formulário falhar por causa
 * do nosso registro. O envio já foi para o n8n; o que se perde aqui é a nossa
 * cópia, e o motivo vai para o log com o nome do arquivo SQL que resolve.
 *
 * ## Como a contratação vira UMA linha
 *
 * O assistente da `/contratacao` manda o mesmo `id_sessao` nas quatro etapas e,
 * em cada uma, o retrato COMPLETO do que já foi preenchido. Então o
 * `INSERT ... ON CONFLICT (id_sessao) DO UPDATE` grava a etapa 1 e atualiza a
 * mesma linha nas seguintes. Quem parou na etapa 2 fica registrado como quem
 * parou na etapa 2 — que é a informação que faltava.
 *
 * Duas defesas no `ON CONFLICT`:
 *
 * - **`WHERE data > now() - interval '1 day'`.** O `id_sessao` vem do
 *   navegador. Um UUID v4 não se adivinha, mas um capturado da rede poderia ser
 *   reenviado meses depois para sobrescrever um registro antigo. Passado um
 *   dia, a linha não muda mais.
 * - **`GREATEST` na etapa e `COALESCE` no nome/telefone.** Uma etapa que chegue
 *   fora de ordem (rede lenta, cliente que volta) não pode fazer a linha
 *   regredir nem apagar o que já se sabia da pessoa.
 */

import { createHash } from "node:crypto";

import { env, getClient, identifier, type Sql } from "./postgres.server";
import {
  MAX_ETAPA_ID,
  corte,
  dadosDentroDoTeto,
  resumoDoEnvio,
  type AnexoResumo,
  type EnvioAdmin,
  type FormularioEnvio,
  type StatusEnvio,
} from "./envios-tipos";
import type { SafeAnexo } from "./attachment-validation";

const DEFAULT_SCHEMA = "public";

const schema = () => identifier(env("POSTGRES_SCHEMA"), DEFAULT_SCHEMA, "POSTGRES_SCHEMA");

const tabelaEnvios = () =>
  identifier(env("POSTGRES_ENVIOS_TABLE"), "web_envios", "POSTGRES_ENVIOS_TABLE");

const tabelaAnexos = () =>
  identifier(
    env("POSTGRES_ENVIOS_ANEXOS_TABLE"),
    "web_envios_anexos",
    "POSTGRES_ENVIOS_ANEXOS_TABLE",
  );

const AJUDA_SQL = "Rode docs/n8n/schema-envios.sql no banco do site.";

/**
 * Guardar o arquivo é opcional.
 *
 * `ENVIOS_GRAVAR_ANEXOS=false` mantém a ficha do anexo (nome, tipo, tamanho,
 * sha256) e descarta os bytes. Serve para quem não quer documento de identidade
 * dentro do banco — a ficha ainda prova que o anexo existiu e chegou ao n8n.
 */
const gravarAnexos = () => env("ENVIOS_GRAVAR_ANEXOS")?.toLowerCase() !== "false";

/**
 * O IP, em hash.
 *
 * Guardar o endereço em claro seria dado pessoal parado numa tabela que o
 * comercial abre todo dia, e para o uso real — "estes 400 envios vieram todos
 * do mesmo lugar" — o hash serve igual. `IP_HASH_SALT` é o que impede a lista
 * de IPv4 inteira de ser testada uma a uma; sem ele o hash ainda agrupa, e o
 * log diz o que fazer.
 */
function hashDoIp(ip: string | undefined): string | null {
  if (!ip || ip === "unknown") return null;
  const sal = env("IP_HASH_SALT") ?? "";
  return createHash("sha256").update(`${sal}:${ip}`).digest("hex");
}

/* ---------------- gravação ---------------- */

export type EnvioParaGravar = {
  /** Chave da linha: o mesmo valor nas quatro etapas de uma contratação. */
  idSessao: string;
  formulario: FormularioEnvio;
  etapa: number;
  etapaId: string;
  totalEtapas: number;
  concluido: boolean;
  statusEnvio: StatusEnvio;
  /** O formulário já saneado — o MESMO objeto que foi para o webhook. */
  dados: Record<string, unknown>;
  /** Anexos já validados pelo servidor (MIME, magic bytes, nome reescrito). */
  anexos?: SafeAnexo[] | undefined;
  ip?: string | undefined;
};

/**
 * Grava (ou atualiza) o envio. Nunca lança.
 *
 * Chamada com `await` de propósito: é um `INSERT` numa tabela indexada, na casa
 * do milissegundo, e soltá-la sem esperar arriscaria o processo encerrar a
 * requisição antes de a linha existir. O `catch` é o que garante que a demora
 * ou a falha não chegue ao cliente como erro.
 */
export async function registrarEnvio(envio: EnvioParaGravar): Promise<void> {
  const sql = getClient();
  if (!sql) return;

  try {
    const dados = dadosDentroDoTeto(envio.dados);
    const { nome, telefone, plano } = resumoDoEnvio(dados);
    const fichas = (envio.anexos ?? []).map(fichaDoAnexo);

    /*
     * `sql.json` e não `JSON.stringify`: o postgres.js serializa o objeto para
     * a coluna `jsonb` sozinho, e mandar o texto pronto o faria serializar duas
     * vezes — o que fica gravado vira uma string JSON, e nenhum `->>` acha mais
     * nada lá dentro.
     */
    const linhas = (await sql`
      insert into ${sql(schema())}.${sql(tabelaEnvios())}
        (formulario, id_sessao, nome, telefone, etapa, etapa_id, total_etapas,
         concluido, status_envio, plano, ip_hash, dados, anexos)
      values (
        ${envio.formulario},
        ${envio.idSessao},
        ${nome},
        ${telefone},
        ${envio.etapa},
        ${corte(envio.etapaId, MAX_ETAPA_ID)},
        ${envio.totalEtapas},
        ${envio.concluido},
        ${envio.statusEnvio},
        ${plano},
        ${hashDoIp(envio.ip)},
        ${sql.json(dados as never)},
        ${sql.json(fichas as never)}
      )
      on conflict (id_sessao) do update set
        -- a etapa nunca anda para trás, e o que já se sabia da pessoa não some
        etapa        = greatest(excluded.etapa, ${sql(tabelaEnvios())}.etapa),
        etapa_id     = coalesce(excluded.etapa_id, ${sql(tabelaEnvios())}.etapa_id),
        total_etapas = excluded.total_etapas,
        concluido    = ${sql(tabelaEnvios())}.concluido or excluded.concluido,
        status_envio = excluded.status_envio,
        nome         = coalesce(excluded.nome, ${sql(tabelaEnvios())}.nome),
        telefone     = coalesce(excluded.telefone, ${sql(tabelaEnvios())}.telefone),
        plano        = coalesce(excluded.plano, ${sql(tabelaEnvios())}.plano),
        ip_hash      = coalesce(excluded.ip_hash, ${sql(tabelaEnvios())}.ip_hash),
        -- concatenação, e não substituição: as chaves que vieram agora valem, e
        -- as que não vieram continuam valendo. O assistente manda o retrato
        -- completo a cada etapa, então na prática dá no mesmo — mas um envio que
        -- chegue incompleto não pode apagar o endereço que já estava aqui.
        dados        = ${sql(tabelaEnvios())}.dados || excluded.dados,
        -- a etapa sem anexo não apaga o que a etapa dos anexos gravou
        anexos       = case
                         when jsonb_array_length(excluded.anexos) = 0
                           then ${sql(tabelaEnvios())}.anexos
                         else excluded.anexos
                       end
      where ${sql(tabelaEnvios())}.data > now() - interval '1 day'
      returning id::text as id
    `) as unknown as { id: string }[];

    const id = linhas[0]?.id;
    if (!id) return; // conflito recusado pelo `where`: a linha antiga fica como está

    if (envio.anexos?.length && gravarAnexos()) {
      await gravarArquivos(sql, id, envio.anexos);
    }
  } catch (err) {
    console.error(`Não foi possível registrar o envio "${envio.formulario}". ${AJUDA_SQL}`, err);
  }
}

/** A ficha que fica na linha do envio. Os bytes vão para a outra tabela. */
function fichaDoAnexo(anexo: SafeAnexo): AnexoResumo {
  return {
    campo: anexo.campo,
    nome: anexo.nome,
    tipo: anexo.tipo,
    tamanho: anexo.tamanho,
    sha256: createHash("sha256").update(anexo.conteudo_base64, "base64").digest("hex"),
  };
}

/**
 * Os arquivos, um por campo.
 *
 * `on conflict (envio_id, campo)` porque a etapa dos anexos pode ser reenviada
 * — recusa do reCAPTCHA, erro do webhook, cliente que troca o arquivo. Sem
 * isto, cada tentativa deixaria mais uma cópia de 10MB no banco.
 *
 * A falha de UM arquivo não impede o outro nem apaga o envio: quem tem a ficha
 * na linha sabe que o anexo existiu, mesmo que o byte não tenha entrado.
 */
async function gravarArquivos(sql: Sql, envioId: string, anexos: SafeAnexo[]): Promise<void> {
  for (const anexo of anexos) {
    try {
      const conteudo = Buffer.from(anexo.conteudo_base64, "base64");
      await sql`
        insert into ${sql(schema())}.${sql(tabelaAnexos())}
          (envio_id, campo, nome, tipo, tamanho, sha256, conteudo)
        values (
          ${envioId}::bigint,
          ${anexo.campo},
          ${anexo.nome},
          ${anexo.tipo},
          ${conteudo.length},
          ${createHash("sha256").update(conteudo).digest("hex")},
          ${conteudo}
        )
        on conflict (envio_id, campo) do update set
          nome     = excluded.nome,
          tipo     = excluded.tipo,
          tamanho  = excluded.tamanho,
          sha256   = excluded.sha256,
          conteudo = excluded.conteudo
      `;
    } catch (err) {
      console.error(
        `Anexo "${anexo.campo}" do envio ${envioId} não foi gravado. ${AJUDA_SQL}`,
        err,
      );
    }
  }

  await sincronizarFichas(sql, envioId);
}

/**
 * A ficha na linha do envio passa a ser o que a tabela de arquivos realmente
 * tem — e não o que o último envio disse ter.
 *
 * Sem isto, um reenvio da etapa dos anexos com um arquivo só (o cliente que
 * trocou o comprovante e o navegador não remontou o documento) deixaria a lista
 * da tela mostrando um anexo enquanto o banco guarda dois. A tela mostraria
 * menos do que existe, que é a pior direção do erro: ninguém procura o que não
 * aparece.
 */
async function sincronizarFichas(sql: Sql, envioId: string): Promise<void> {
  try {
    await sql`
      update ${sql(schema())}.${sql(tabelaEnvios())}
         set anexos = coalesce((
               select jsonb_agg(
                        jsonb_build_object(
                          'campo', a.campo, 'nome', a.nome, 'tipo', a.tipo,
                          'tamanho', a.tamanho, 'sha256', a.sha256
                        ) order by a.campo
                      )
                 from ${sql(schema())}.${sql(tabelaAnexos())} a
                where a.envio_id = ${envioId}::bigint
             ), '[]'::jsonb)
       where id = ${envioId}::bigint
    `;
  } catch (err) {
    console.error(`Não foi possível atualizar a ficha dos anexos do envio ${envioId}.`, err);
  }
}

/* ---------------- leitura para o /admin ---------------- */

type EnvioRow = {
  id: string;
  formulario: string;
  id_sessao: string;
  data: string | null;
  atualizado_em: string | null;
  nome: string | null;
  telefone: string | null;
  etapa: number | string | null;
  etapa_id: string | null;
  total_etapas: number | string | null;
  concluido: boolean | null;
  status_envio: string | null;
  plano: string | null;
  dados: unknown;
  anexos: unknown;
};

const txt = (valor: string | null | undefined) => valor ?? "";

const STATUS_CONHECIDOS: StatusEnvio[] = ["recebido", "webhook_ok", "webhook_erro", "sem_webhook"];

const statusDoEnvio = (valor: string | null): StatusEnvio =>
  STATUS_CONHECIDOS.find((s) => s === valor) ?? "recebido";

function montarEnvio(row: EnvioRow): EnvioAdmin {
  return {
    id: row.id,
    formulario: row.formulario === "contratacao" ? "contratacao" : "lead",
    idSessao: txt(row.id_sessao),
    data: txt(row.data),
    atualizadoEm: txt(row.atualizado_em),
    nome: txt(row.nome),
    telefone: txt(row.telefone),
    etapa: Number(row.etapa ?? 1),
    etapaId: txt(row.etapa_id),
    totalEtapas: Number(row.total_etapas ?? 1),
    concluido: row.concluido === true,
    statusEnvio: statusDoEnvio(row.status_envio),
    plano: txt(row.plano),
    dados: row.dados ? JSON.stringify(row.dados, null, 2) : "",
    anexos: Array.isArray(row.anexos) ? (row.anexos as AnexoResumo[]) : [],
  };
}

/**
 * Os últimos envios.
 *
 * **A coluna `conteudo` NUNCA entra aqui** — é a regra que sustenta a tabela
 * separada. Listar 300 envios com dois documentos de 10MB cada seria arrastar
 * 6GB para dentro do processo; do jeito que está, é a linha e a ficha, medida
 * em kilobytes.
 *
 * O teto de 300 é o mesmo das outras listas do /admin: esta tela é uma caixa de
 * entrada, não um relatório. Quem quer o histórico inteiro tem o banco.
 */
export async function listarEnvios(): Promise<EnvioAdmin[]> {
  const sql = getClient();
  if (!sql) return [];

  const linhas = (await sql`
    select
      id::text            as id,
      formulario, id_sessao,
      data::text          as data,
      atualizado_em::text as atualizado_em,
      nome, telefone,
      etapa, etapa_id, total_etapas, concluido, status_envio, plano,
      dados, anexos
    from ${sql(schema())}.${sql(tabelaEnvios())}
    order by data desc
    limit 300
  `) as unknown as EnvioRow[];

  return linhas.map(montarEnvio);
}

export type ArquivoDoEnvio = { nome: string; tipo: string; base64: string };

/**
 * Um arquivo, para o /admin baixar. É a única consulta que lê `conteudo`.
 *
 * O `campo` chega da tela, então vai parametrizado como qualquer outro valor —
 * e a restrição `web_envios_anexos_campo_ck` já garantiu, na gravação, que só
 * existem dois valores possíveis lá dentro.
 */
export async function lerArquivoDoEnvio(
  envioId: string,
  campo: string,
): Promise<ArquivoDoEnvio | null> {
  const sql = getClient();
  if (!sql) return null;

  const linhas = (await sql`
    select nome, tipo, conteudo
    from ${sql(schema())}.${sql(tabelaAnexos())}
    where envio_id = ${envioId}::bigint and campo = ${campo}
    limit 1
  `) as unknown as { nome: string; tipo: string; conteudo: Buffer }[];

  const linha = linhas[0];
  if (!linha) return null;

  return {
    nome: linha.nome,
    tipo: linha.tipo,
    base64: Buffer.from(linha.conteudo).toString("base64"),
  };
}

/** Quantos envios entraram hoje — o número do topo da tela do /admin. */
export async function contarEnviosDeHoje(): Promise<number> {
  const sql = getClient();
  if (!sql) return 0;

  try {
    const linhas = (await sql`
      select count(*)::int as n
      from ${sql(schema())}.${sql(tabelaEnvios())}
      where data >= date_trunc('day', now())
    `) as unknown as { n: number | string }[];
    return Number(linhas[0]?.n ?? 0);
  } catch {
    return 0;
  }
}
