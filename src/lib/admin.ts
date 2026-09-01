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
import { lerArquivoDoEnvio, listarEnvios, type ArquivoDoEnvio } from "./envios-db.server";
import { gravarConfigIndicacao, lerConfigIndicacao } from "./config-db.server";
import { gravarSeguranca, lerSegurancaFresca } from "./seguranca-db.server";
import { gravarAreaCliente, lerAreaClienteFresca } from "./area-cliente-db.server";
import { minScore, ultimosVereditos } from "./verify-recaptcha";
import { MAX_CODIGO, excluirScript, listarScripts, salvarScript } from "./scripts-db.server";
import { LIMITE_ADMIN } from "./form-limits";
import { TAGS_PROIBIDAS } from "./admin-tipos";
import type {
  ConfigAreaCliente,
  ConfigIndicacao,
  ConfigSeguranca,
  DiagnosticoSeguranca,
  IndicacaoAdmin,
  PlanoAdmin,
  ScriptAdmin,
  SessaoAdmin,
  SolicitacaoAdmin,
} from "./admin-tipos";
import type { EnvioAdmin } from "./envios-tipos";

/* ---------------- schemas ---------------- */

/**
 * Tetos de tamanho em tudo que é texto.
 *
 * Não é paranoia: são endpoints públicos, e sem teto um POST direto despeja
 * megabytes de texto arbitrário dentro de um `INSERT`.
 *
 * Os números vêm de `LIMITE_ADMIN`, o mesmo objeto que as telas usam no
 * `maxLength` dos campos — assim o que o formulário deixa digitar é exatamente
 * o que o schema aceita, e ninguém preenche um campo para vê-lo recusado no
 * salvar.
 */
const texto = (max: number) => z.string().max(max).default("");

const L = LIMITE_ADMIN;

const planoSchema = z.object({
  idPlano: texto(L.plano.idPlano),
  ativo: z.boolean(),
  ordemGrade: texto(L.plano.ordemGrade),
  destaque: z.boolean(),
  codigoMk: texto(L.plano.codigoMk),
  nome: z.string().min(1, "O plano precisa de um nome.").max(L.plano.nome),
  descricao: texto(L.plano.descricao),
  valor: texto(L.plano.valor),
  valorPrimeirasFaturas: texto(L.plano.valor),
  quantMesesDesconto: texto(L.plano.quantMesesDesconto),
  composicaoResumo: texto(L.plano.composicaoResumo),
  composicao: texto(L.plano.composicao),
  urlLogoAgregados: texto(L.plano.urlLogoAgregados),
  nomeDestaque: texto(L.plano.nomeDestaque),
  codigoOfertaMk: texto(L.plano.codigoOfertaMk),
  codigoOferta: texto(L.plano.codigoOferta).optional(),
});

const catalogoSchema = z.enum(["site", "upgrade"]);

const statusSolicitacaoSchema = z.enum(["em_aberto", "cancelado", "concluido"]);

const solicitacaoSchema = z.object({
  id: z.string().regex(/^\d+$/, "Solicitação inválida."),
  status: statusSolicitacaoSchema,
  assunto: texto(L.solicitacao.assunto),
  // vazio ou AAAA-MM-DD, que é o que o <input type="date"> produz
  agendadoPara: z
    .string()
    .max(10)
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Data inválida.")
    .default(""),
  observacaoInterna: texto(L.solicitacao.observacaoInterna),
});

const indicacaoSchema = z.object({
  id: z.string().regex(/^\d+$/, "Indicação inválida."),
  nomeIndicacao: z.string().min(1, "A indicação precisa de um nome.").max(L.indicacao.nome),
  telefoneIndicacao: texto(L.indicacao.telefone),
  cidade: texto(L.indicacao.cidade),
  observacoes: texto(L.indicacao.observacoes),
  codNovoCliente: texto(L.indicacao.codigo),
  codContratoNovoCliente: texto(L.indicacao.codigo),
  status: z.enum(["em_aberto", "sem_sucesso", "dados_invalidos", "concluido"]),
  campanha: texto(L.indicacao.campanha),
  tipoBonus: z.enum(["", "desconto_fatura", "premio", "pix"]),
  descricaoBonus: texto(L.indicacao.descricaoBonus),
  valorIndicacao: texto(L.indicacao.valor),
});

const areaClienteSchema = z.object({
  ativa: z.boolean(),
  mensagem: texto(L.areaCliente.mensagem),
});

const segurancaSchema = z.object({
  recaptchaAtivo: z.boolean(),
  // vazio = "usa a variável de ambiente". O número é conferido na leitura.
  minScore: texto(L.seguranca.minScore),
});

const configSchema = z.object({
  ativo: z.boolean(),
  titulo: z.string().min(1, "A seção precisa de um título.").max(L.config.titulo),
  descricao: texto(L.config.descricao),
  bannerDesktopUrl: texto(L.config.bannerUrl),
  bannerMobileUrl: texto(L.config.bannerUrl),
  bannerAlt: texto(L.config.bannerAlt),
  bannerLink: texto(L.config.bannerLink),
  campanhaNome: texto(L.config.campanhaNome),
  campanhaTipoBonus: z.enum(["", "desconto_fatura", "premio", "pix"]),
  campanhaDescricaoBonus: texto(L.config.campanhaDescricaoBonus),
  campanhaValor: texto(L.config.campanhaValor),
});

/**
 * Um trecho de código para colar na página.
 *
 * O `codigo` sai daqui para o HTML **sem nenhuma transformação** — é o que faz
 * um Tag Manager funcionar, e é também por isso que a única validação possível
 * é de tamanho e de estrutura. Quem chega até aqui já passou pela sessão de
 * admin; a proteção é a porta, não o filtro.
 *
 * As tags de estrutura são recusadas porque um `</body>` colado por engano
 * (acontece ao copiar a página inteira em vez do trecho) embaralharia o ponto
 * de injeção e cortaria o final da página para todos os visitantes.
 */
const scriptSchema = z.object({
  id: texto(L.script.id),
  nome: texto(L.script.nome),
  posicao: z.enum(["head", "body_inicio", "body_fim"]),
  // O teto de tamanho fica aqui, como barreira contra POST direto. As regras
  // que a pessoa pode violar sem querer são conferidas no handler — veja abaixo.
  codigo: z.string().max(MAX_CODIGO),
  ativo: z.boolean(),
});

/**
 * As duas recusas que um humano encontra, conferidas onde a mensagem chega até ele.
 *
 * Não dá para deixá-las no `.validator`: quando o zod recusa ali, o framework
 * lança antes do handler, a tela cai no `catch` genérico e mostra "Falha de
 * conexão. Tente de novo." — que é falso e não diz o que corrigir. Dentro do
 * handler, a mesma recusa vira `{ ok: false, mensagem }` e aparece na tela com
 * o motivo.
 */
function conferirScript(codigo: string): void {
  if (codigo.trim() === "") {
    throw new Error("Cole o código do script.");
  }
  const proibida = TAGS_PROIBIDAS.find((t) => codigo.toLowerCase().includes(t));
  if (proibida) {
    throw new Error(
      `O código não pode conter "${proibida}>" — cole só o trecho que a ferramenta forneceu, ` +
        "sem a estrutura da página em volta.",
    );
  }
}

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
  .validator(
    z.object({
      usuario: z.string().max(L.login.usuario),
      senha: z.string().max(L.login.senha),
    }),
  )
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
  /** Os envios dos formulários do site — a home e a /contratacao. */
  envios: EnvioAdmin[];
  indicacoes: IndicacaoAdmin[];
  config: ConfigIndicacao;
  scripts: ScriptAdmin[];
  seguranca: ConfigSeguranca;
  areaCliente: ConfigAreaCliente;
  /** Leitura, não ajuste: o estado do anti-robô como o servidor o enxerga. */
  diagnosticoSeguranca: DiagnosticoSeguranca;
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

    const [
      resumo,
      planosSite,
      planosUpgrade,
      solicitacoes,
      envios,
      indicacoes,
      config,
      scripts,
      seguranca,
      areaCliente,
    ] = await Promise.all([
      resumoAdmin(),
      listaSegura("planos do site", listarPlanos("site")),
      listaSegura("planos de upgrade", listarPlanos("upgrade")),
      listaSegura("solicitações", listarSolicitacoes({})),
      listaSegura("envios do site", listarEnvios()),
      listaSegura("indicações", listarIndicacoes({})),
      lerConfigIndicacao(),
      listaSegura("scripts", listarScripts()),
      lerSegurancaFresca(),
      lerAreaClienteFresca(),
    ]);

    return {
      resumo,
      planosSite,
      planosUpgrade,
      solicitacoes,
      envios,
      indicacoes,
      config,
      scripts,
      seguranca,
      areaCliente,
      diagnosticoSeguranca: diagnosticoDaSeguranca(seguranca),
    };
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

/* ---------------- envios do site ---------------- */

/**
 * O anexo de um envio, para o /admin baixar.
 *
 * **Este é o endpoint mais sensível do painel**: é o único que devolve um
 * documento de identidade. Por isso ele não é diferente dos outros em nada que
 * importe — `acao()` confere a sessão de admin ANTES de tocar no banco, e o
 * `id` chega como número validado pelo zod, não como texto solto que vira
 * consulta.
 *
 * O arquivo volta em base64 porque uma server function devolve JSON; quem pediu
 * monta um `data:` e baixa. Um envio sem aquele anexo devolve `null`, e não um
 * erro: anexo faltando é o normal para quem parou antes da última etapa.
 */
export const baixarAnexoAdmin = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: z.string().regex(/^\d+$/, "Envio inválido."),
      campo: z.enum(["comprovante_residencia", "documento_com_foto"]),
    }),
  )
  .handler(async ({ data }): Promise<ArquivoDoEnvio | null> => {
    await exigirSessaoAdmin();
    try {
      return await lerArquivoDoEnvio(data.id, data.campo);
    } catch (err) {
      console.error(`/admin: não foi possível ler o anexo do envio ${data.id}.`, err);
      return null;
    }
  });

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

/* ---------------- scripts / tags ---------------- */

export const salvarScriptAdmin = createServerFn({ method: "POST" })
  .validator(scriptSchema)
  .handler(async ({ data }) =>
    acao(async () => {
      conferirScript(data.codigo);
      await salvarScript(data as ScriptAdmin);
      // A gravação já esvazia o cache do servidor, então a próxima página
      // servida sai com o trecho novo — não há deploy nem espera no meio.
      return data.id ? "Script atualizado." : "Script incluído.";
    }),
  );

export const excluirScriptAdmin = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().min(1).max(80) }))
  .handler(async ({ data }) =>
    acao(async () => {
      await excluirScript(data.id);
      return "Script excluído.";
    }),
  );

/* ---------------- segurança (anti-robô) ---------------- */

/**
 * O estado do reCAPTCHA como só o servidor consegue ver.
 *
 * `siteKeyNoBundle` é o campo que resolve o caso mais comum e mais invisível:
 * `VITE_RECAPTCHA_SITE_KEY` entra no JavaScript em tempo de BUILD, então, se ela
 * foi preenchida só como variável de ambiente no EasyPanel e não também nos
 * *Build Args*, o navegador não tem chave, não gera token, e o servidor recusa
 * TODOS os envios. Nada disso aparece na tela do visitante, e a leitura literal
 * aqui é exatamente o valor que foi para o navegador.
 */
function diagnosticoDaSeguranca(seguranca: ConfigSeguranca): DiagnosticoSeguranca {
  const siteKey = (import.meta.env["VITE_RECAPTCHA_SITE_KEY"] as string | undefined)?.trim();
  const siteUrl = (import.meta.env["VITE_SITE_URL"] as string | undefined)?.trim();

  let hostname = "";
  try {
    if (siteUrl) hostname = new URL(siteUrl).hostname;
  } catch {
    hostname = "";
  }

  return {
    siteKeyNoBundle: Boolean(siteKey),
    secretNoServidor: Boolean(process.env["RECAPTCHA_SECRET_KEY"]),
    minScoreEmVigor: minScore(seguranca.minScore),
    hostnameEsperado: hostname,
    ultimosBloqueios: ultimosVereditos()
      .slice(0, 10)
      .map((v) => ({
        em: v.em,
        formulario: v.action,
        motivo: v.motivo,
        score: v.score,
      })),
  };
}

export const salvarSegurancaAdmin = createServerFn({ method: "POST" })
  .validator(segurancaSchema)
  .handler(async ({ data }) =>
    acao(async () => {
      await gravarSeguranca(data);
      return data.recaptchaAtivo
        ? "Anti-robô ligado."
        : "Anti-robô DESLIGADO. Os formulários voltaram a aceitar envios.";
    }),
  );

/* ---------------- área do cliente ---------------- */

export const salvarAreaClienteAdmin = createServerFn({ method: "POST" })
  .validator(areaClienteSchema)
  .handler(async ({ data }) =>
    acao(async () => {
      await gravarAreaCliente(data);
      return data.ativa
        ? "Área do cliente LIGADA."
        : "Área do cliente DESLIGADA. Quem tentar entrar vai para o WhatsApp da central.";
    }),
  );
