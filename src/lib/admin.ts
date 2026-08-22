/**
 * As chamadas do painel super admin — a fronteira entre a tela e o servidor.
 *
 * Cada função aqui é um endpoint HTTP de verdade (`/_serverFn/…`), público como
 * qualquer outro. Por isso duas coisas valem para todas, sem exceção:
 *
 * 1. **Sessão conferida no servidor.** `exigirSessaoAdmin()` roda dentro do
 *    handler, e não na tela. Uma tela que só esconde o botão continua deixando
 *    o endpoint aberto para quem posta direto.
 * 2. **Entrada validada por schema.** O que chega é texto de formulário vindo
 *    do navegador; o zod é o que garante tamanho e formato antes de virar SQL.
 *
 * O trabalho de fato mora nos módulos `.server.ts` — este arquivo é só a porta.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  adminConfigurado,
  exigirSessaoAdmin,
  loginAdminServer,
  logoutAdminServer,
  sessaoAdminServer,
} from "./admin-auth.server";
import {
  atualizarSolicitacao,
  excluirIndicacao,
  excluirPlano,
  listarIndicacoes,
  listarPlanos,
  listarSolicitacoes,
  resumoAdmin,
  salvarIndicacao,
  salvarPlano,
  type ResumoAdmin,
} from "./admin-db.server";
import { gravarConfigIndicacao, lerConfigIndicacao } from "./config-db.server";
import type {
  ConfigIndicacao,
  IndicacaoAdmin,
  PlanoAdmin,
  SessaoAdmin,
  SolicitacaoAdmin,
} from "./admin-tipos";

/* ---------------- schemas ---------------- */

/**
 * Tetos de tamanho em tudo que é texto.
 *
 * Não é paranoia: são endpoints públicos, e sem teto um POST direto despeja
 * megabytes de texto arbitrário dentro de um `INSERT`.
 */
const texto = (max: number) => z.string().max(max).default("");

const planoSchema = z.object({
  idPlano: texto(20),
  ativo: z.boolean(),
  ordemGrade: texto(10),
  destaque: z.boolean(),
  codigoMk: texto(20),
  nome: z.string().min(1, "O plano precisa de um nome.").max(150),
  descricao: texto(2000),
  valor: texto(20),
  valorPrimeirasFaturas: texto(20),
  quantMesesDesconto: texto(10),
  composicaoResumo: texto(500),
  composicao: texto(4000),
  urlLogoAgregados: texto(4000),
  nomeDestaque: texto(60),
  codigoOfertaMk: texto(30),
  codigoOferta: texto(60).optional(),
});

const catalogoSchema = z.enum(["site", "upgrade"]);

const statusSolicitacaoSchema = z.enum(["em_aberto", "cancelado", "concluido"]);

const solicitacaoSchema = z.object({
  id: z.string().regex(/^\d+$/, "Solicitação inválida."),
  status: statusSolicitacaoSchema,
  assunto: texto(180),
  // vazio ou AAAA-MM-DD, que é o que o <input type="date"> produz
  agendadoPara: z
    .string()
    .max(10)
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Data inválida.")
    .default(""),
  observacaoInterna: texto(4000),
});

const indicacaoSchema = z.object({
  id: z.string().regex(/^\d+$/, "Indicação inválida."),
  nomeIndicacao: z.string().min(1, "A indicação precisa de um nome.").max(150),
  telefoneIndicacao: texto(20),
  cidade: texto(120),
  observacoes: texto(4000),
  codNovoCliente: texto(60),
  codContratoNovoCliente: texto(60),
  status: z.enum(["em_aberto", "sem_sucesso", "dados_invalidos", "concluido"]),
  campanha: texto(120),
  tipoBonus: z.enum(["", "desconto_fatura", "premio", "pix"]),
  descricaoBonus: texto(2000),
  valorIndicacao: texto(20),
});

const configSchema = z.object({
  ativo: z.boolean(),
  titulo: z.string().min(1, "A seção precisa de um título.").max(120),
  descricao: texto(500),
  bannerDesktopUrl: texto(600),
  bannerMobileUrl: texto(600),
  bannerAlt: texto(200),
  bannerLink: texto(600),
  campanhaNome: texto(120),
  campanhaTipoBonus: z.enum(["", "desconto_fatura", "premio", "pix"]),
  campanhaDescricaoBonus: texto(500),
  campanhaValor: texto(20),
});

/* ---------------- resposta ---------------- */

export type AcaoAdmin = { ok: true; mensagem: string } | { ok: false; mensagem: string };

/**
 * Roda uma ação já autenticada e devolve sempre a mesma forma.
 *
 * A mensagem de erro do Postgres sobe para a tela de propósito: quem está do
 * outro lado é o dono do site, e "chave estrangeira violada em
 * cod_contrato_novo_cliente" diz exatamente o que corrigir. Num painel de
 * cliente isso seria vazamento; aqui é a informação útil.
 */
async function acao(trabalho: () => Promise<string>): Promise<AcaoAdmin> {
  try {
    await exigirSessaoAdmin();
    const mensagem = await trabalho();
    return { ok: true, mensagem };
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Não foi possível concluir a ação.";
    console.error("Ação do /admin falhou", err);
    return { ok: false, mensagem };
  }
}

/* ---------------- sessão ---------------- */

export type EstadoAdmin = {
  /** `false` quando faltam ADMIN_USUARIO/ADMIN_SENHA — a rota nem se abre. */
  configurado: boolean;
  sessao: SessaoAdmin | null;
};

export const estadoAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<EstadoAdmin> => ({
    configurado: adminConfigurado(),
    sessao: await sessaoAdminServer(),
  }),
);

export const entrarAdmin = createServerFn({ method: "POST" })
  .validator(z.object({ usuario: z.string().max(120), senha: z.string().max(200) }))
  .handler(async ({ data }) => loginAdminServer(data));

export const sairAdmin = createServerFn({ method: "POST" }).handler(async () => {
  await logoutAdminServer();
  return { ok: true as const };
});

/* ---------------- leitura ---------------- */

export type DadosAdmin = {
  resumo: ResumoAdmin;
  planosSite: PlanoAdmin[];
  planosUpgrade: PlanoAdmin[];
  solicitacoes: SolicitacaoAdmin[];
  indicacoes: IndicacaoAdmin[];
  config: ConfigIndicacao;
};

/**
 * Tudo que a tela mostra, numa chamada só.
 *
 * São quatro listas curtas (o banco corta em 300 linhas cada) e uma
 * configuração. Buscar por aba economizaria bytes e custaria uma ida ao
 * servidor a cada clique — e a filtragem por status e por texto acontece na
 * tela, em cima do que já está aqui, sem esperar nada.
 */
export const carregarAdmin = createServerFn({ method: "GET" }).handler(
  async (): Promise<DadosAdmin> => {
    await exigirSessaoAdmin();

    const [resumo, planosSite, planosUpgrade, solicitacoes, indicacoes, config] = await Promise.all(
      [
        resumoAdmin(),
        listaSegura("planos do site", listarPlanos("site")),
        listaSegura("planos de upgrade", listarPlanos("upgrade")),
        listaSegura("solicitações", listarSolicitacoes({})),
        listaSegura("indicações", listarIndicacoes({})),
        lerConfigIndicacao(),
      ],
    );

    return { resumo, planosSite, planosUpgrade, solicitacoes, indicacoes, config };
  },
);

/**
 * Uma tabela que ainda não existe não pode apagar a tela inteira.
 *
 * No primeiro acesso de quem ainda não rodou o SQL, o normal é faltar alguma —
 * e a resposta útil é a tela abrir com aquela lista vazia e o motivo no log, em
 * vez de um erro genérico que não diz qual das quatro falhou.
 */
async function listaSegura<T>(nome: string, consulta: Promise<T[]>): Promise<T[]> {
  try {
    return await consulta;
  } catch (err) {
    console.error(`/admin: não foi possível listar ${nome}.`, err);
    return [];
  }
}

/* ---------------- planos ---------------- */

export const salvarPlanoAdmin = createServerFn({ method: "POST" })
  .validator(z.object({ catalogo: catalogoSchema, plano: planoSchema }))
  .handler(async ({ data }) =>
    acao(async () => {
      const id = await salvarPlano(data.catalogo, data.plano as PlanoAdmin);
      return `Plano ${id} salvo.`;
    }),
  );

export const excluirPlanoAdmin = createServerFn({ method: "POST" })
  .validator(
    z.object({ catalogo: catalogoSchema, idPlano: z.string().regex(/^\d+$/, "Plano inválido.") }),
  )
  .handler(async ({ data }) =>
    acao(async () => {
      await excluirPlano(data.catalogo, data.idPlano);
      return `Plano ${data.idPlano} excluído.`;
    }),
  );

/* ---------------- solicitações ---------------- */

export const salvarSolicitacaoAdmin = createServerFn({ method: "POST" })
  .validator(solicitacaoSchema)
  .handler(async ({ data }) =>
    acao(async () => {
      await atualizarSolicitacao(data);
      return "Solicitação atualizada.";
    }),
  );

/* ---------------- indicações ---------------- */

export const salvarIndicacaoAdmin = createServerFn({ method: "POST" })
  .validator(indicacaoSchema)
  .handler(async ({ data }) =>
    acao(async () => {
      await salvarIndicacao(data);
      return "Indicação atualizada.";
    }),
  );

export const excluirIndicacaoAdmin = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().regex(/^\d+$/, "Indicação inválida.") }))
  .handler(async ({ data }) =>
    acao(async () => {
      await excluirIndicacao(data.id);
      return "Indicação excluída.";
    }),
  );

/* ---------------- configuração ---------------- */

export const salvarConfigAdmin = createServerFn({ method: "POST" })
  .validator(configSchema)
  .handler(async ({ data }) =>
    acao(async () => {
      await gravarConfigIndicacao(data);
      return "Configuração salva.";
    }),
  );
