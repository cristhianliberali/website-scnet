/**
 * A configuração da agenda de instalação, guardada em `web_config` (chave
 * `agendamento`).
 *
 * ## Onde isto é lido
 *
 * Na última etapa da `/contratacao`, uma vez por cliente que chega lá — e o
 * cliente ESPERA por essa leitura, com o calendário em branco na tela. Por isso
 * o mesmo desenho de cache dos scripts e da área do cliente: o Postgres é
 * consultado no máximo uma vez por `AGENDA_CACHE_SECONDS` (padrão 30), e salvar
 * no /admin esvazia a memória na hora — quem acabou de mudar o prazo porque a
 * equipe atrasou precisa que o próximo cliente já veja o prazo novo.
 *
 * ## Se o banco não responder
 *
 * Vale a configuração padrão do código: 48 horas de prazo e o expediente que o
 * formulário anunciava antes desta tela existir. É a escolha certa — uma falha
 * ao ler a configuração não pode fechar a agenda e matar uma contratação
 * pronta na última etapa.
 *
 * Nenhuma migração é necessária: `web_config` já existe desde
 * `docs/n8n/schema-admin.sql`.
 */

import { env, getClient, identifier } from "./postgres.server";
import {
  CONFIG_AGENDAMENTO_PADRAO,
  MAX_CIDADES_PRAZO,
  type ConfigAgendamento,
  type ExpedienteDia,
  type PrazoCidade,
} from "./admin-tipos";

const DEFAULT_SCHEMA = "public";
const DEFAULT_CONFIG = "web_config";

export const CHAVE_AGENDAMENTO = "agendamento";

const schema = () => identifier(env("POSTGRES_SCHEMA"), DEFAULT_SCHEMA, "POSTGRES_SCHEMA");
const tabela = () =>
  identifier(env("POSTGRES_CONFIG_TABLE"), DEFAULT_CONFIG, "POSTGRES_CONFIG_TABLE");

function segundosDeCache(): number {
  const n = Number(env("AGENDA_CACHE_SECONDS"));
  if (!Number.isFinite(n) || n < 0) return 30;
  return Math.min(n, 600);
}

/** O fuso em que a agenda é calculada. Só muda se o provedor mudar de estado. */
export function fusoDaAgenda(): string {
  return env("AGENDA_TIMEZONE")?.trim() || "America/Sao_Paulo";
}

type LinhaConfig = { valor: Record<string, unknown> | null };

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const booleano = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);

/**
 * O `jsonb` virando configuração tipada.
 *
 * Defensivo por obrigação: esta linha pode ter sido editada à mão no pgAdmin, e
 * um campo com o tipo errado não pode derrubar a última etapa do formulário —
 * ele volta para o padrão daquele campo e o resto continua valendo.
 */
export function normalizarAgendamento(bruto: Record<string, unknown> | null): ConfigAgendamento {
  if (!bruto) return CONFIG_AGENDAMENTO_PADRAO;

  const brutoExpediente = Array.isArray(bruto["expediente"]) ? bruto["expediente"] : [];
  const expediente: ExpedienteDia[] = CONFIG_AGENDAMENTO_PADRAO.expediente.map((padrao, i) => {
    const item = brutoExpediente[i];
    if (!item || typeof item !== "object") return padrao;
    const o = item as Record<string, unknown>;
    return {
      atendeManha: booleano(o["atende_manha"], padrao.atendeManha),
      manhaInicio: texto(o["manha_inicio"]) || padrao.manhaInicio,
      manhaFim: texto(o["manha_fim"]) || padrao.manhaFim,
      atendeTarde: booleano(o["atende_tarde"], padrao.atendeTarde),
      tardeInicio: texto(o["tarde_inicio"]) || padrao.tardeInicio,
      tardeFim: texto(o["tarde_fim"]) || padrao.tardeFim,
    };
  });

  const brutoCidades = Array.isArray(bruto["cidades"]) ? bruto["cidades"] : [];
  const cidades: PrazoCidade[] = [];
  for (const item of brutoCidades) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const cidade = texto(o["cidade"]);
    if (!cidade) continue;
    cidades.push({ cidade, horas: texto(o["horas"]) });
    if (cidades.length >= MAX_CIDADES_PRAZO) break;
  }

  return {
    prazoPadraoHoras:
      texto(bruto["prazo_padrao_horas"]) || CONFIG_AGENDAMENTO_PADRAO.prazoPadraoHoras,
    cidades,
    expediente,
    horizonteDias: texto(bruto["horizonte_dias"]) || CONFIG_AGENDAMENTO_PADRAO.horizonteDias,
  };
}

/* ---------------- cache ---------------- */

type Guardado = { em: number; config: ConfigAgendamento };

let guardado: Guardado | null = null;
let emVoo: Promise<ConfigAgendamento> | null = null;

export function invalidarAgendamento(): void {
  guardado = null;
  emVoo = null;
}

async function consultar(): Promise<ConfigAgendamento> {
  const sql = getClient();
  if (!sql) return CONFIG_AGENDAMENTO_PADRAO;

  const linhas = (await sql<LinhaConfig[]>`
    select valor
    from ${sql(schema())}.${sql(tabela())}
    where chave = ${CHAVE_AGENDAMENTO}
    limit 1
  `) as unknown as LinhaConfig[];

  return normalizarAgendamento(linhas[0]?.valor ?? null);
}

async function recarregar(): Promise<ConfigAgendamento> {
  try {
    const config = await consultar();
    guardado = { em: Date.now(), config };
    return config;
  } catch (err) {
    console.error("Falha ao ler a agenda de instalação — vale o prazo padrão do código.", err);
    return guardado?.config ?? CONFIG_AGENDAMENTO_PADRAO;
  } finally {
    emVoo = null;
  }
}

/** A configuração em vigor, com cache. É o que o formulário consulta. */
export async function lerAgendamento(): Promise<ConfigAgendamento> {
  if (guardado && Date.now() - guardado.em < segundosDeCache() * 1000) return guardado.config;
  if (!emVoo) emVoo = recarregar();
  return emVoo;
}

/** Sem cache — o /admin precisa ver o que está gravado, não o que está guardado. */
export async function lerAgendamentoFresco(): Promise<ConfigAgendamento> {
  const sql = getClient();
  if (!sql) return CONFIG_AGENDAMENTO_PADRAO;
  try {
    return await consultar();
  } catch (err) {
    console.error("Falha ao ler a agenda de instalação para o /admin.", err);
    return CONFIG_AGENDAMENTO_PADRAO;
  }
}

export async function gravarAgendamento(config: ConfigAgendamento): Promise<void> {
  const sql = getClient();
  if (!sql) throw new Error("Postgres não configurado (POSTGRES_URL/POSTGRES_HOST).");

  // Chaves em snake_case, como o resto do schema: quem abrir a linha no pgAdmin
  // lê os mesmos nomes que vê nas outras tabelas.
  const valor = {
    prazo_padrao_horas: config.prazoPadraoHoras,
    horizonte_dias: config.horizonteDias,
    cidades: config.cidades
      .filter((c) => c.cidade.trim() !== "")
      .slice(0, MAX_CIDADES_PRAZO)
      .map((c) => ({ cidade: c.cidade.trim(), horas: c.horas.trim() })),
    expediente: config.expediente.map((d) => ({
      atende_manha: d.atendeManha,
      manha_inicio: d.manhaInicio,
      manha_fim: d.manhaFim,
      atende_tarde: d.atendeTarde,
      tarde_inicio: d.tardeInicio,
      tarde_fim: d.tardeFim,
    })),
  };

  // `sql.json` e não `JSON.stringify`: o postgres.js serializa para `jsonb`
  // sozinho, e mandar o texto pronto grava uma *string* JSON em vez do objeto.
  await sql`
    insert into ${sql(schema())}.${sql(tabela())} (chave, valor)
    values (${CHAVE_AGENDAMENTO}, ${sql.json(valor)})
    on conflict (chave) do update set valor = excluded.valor
  `;

  invalidarAgendamento();
}
