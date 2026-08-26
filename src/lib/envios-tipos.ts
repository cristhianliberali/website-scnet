/**
 * O que é um envio de formulário do site, e o que dele fica fora do JSON.
 *
 * **O problema.** O que a pessoa preenchia na home e na `/contratacao` ia para
 * o webhook do n8n e acabava ali: se o fluxo do outro lado não guardasse, o
 * envio não existia em lugar nenhum que alguém do provedor pudesse abrir. Quem
 * começava a contratação e parava na etapa 2 não deixava rastro — e é
 * exatamente essa pessoa que valeria uma ligação.
 *
 * **A forma da linha.** Quatro colunas de verdade — data, nome, telefone e o
 * plano — porque são por elas que se lista, se ordena e se procura; todo o
 * resto do formulário vive num `jsonb` só. É o meio-termo entre uma tabela com
 * quarenta colunas (que precisa de migração a cada campo novo do formulário) e
 * um JSON puro (em que achar "os envios do telefone 49 9999-9999" vira uma
 * varredura da tabela inteira).
 *
 * Este arquivo é o vocabulário compartilhado: o servidor grava por ele e a tela
 * do /admin lê por ele. Nada aqui toca o banco nem o `process.env`, então pode
 * ser importado pelos dois lados.
 */

/** De onde veio o envio. Os mesmos dois valores da restrição `web_envios_formulario_ck`. */
export type FormularioEnvio = "lead" | "contratacao";

export const ROTULO_FORMULARIO_ENVIO: Record<FormularioEnvio, string> = {
  lead: "Contrate agora (home)",
  contratacao: "Contratação",
};

/**
 * O que o n8n respondeu no último envio desta linha.
 *
 * Importa porque separa dois problemas que se parecem na tela: "ninguém
 * atendeu esse lead" (trabalho a fazer) e "o lead nem chegou ao CRM" (fluxo
 * quebrado). `sem_webhook` é o ambiente de desenvolvimento, onde não há n8n.
 */
export type StatusEnvio = "recebido" | "webhook_ok" | "webhook_erro" | "sem_webhook";

export const STATUS_ENVIO: Record<StatusEnvio, string> = {
  recebido: "Recebido",
  webhook_ok: "Enviado ao CRM",
  webhook_erro: "Falhou no CRM",
  sem_webhook: "Sem CRM configurado",
};

/** A ficha de um anexo. Os bytes ficam em `web_envios_anexos`, nunca aqui. */
export type AnexoResumo = {
  campo: string;
  nome: string;
  tipo: string;
  tamanho: number;
  sha256: string;
};

export const ROTULO_CAMPO_ANEXO: Record<string, string> = {
  comprovante_residencia: "Comprovante de residência",
  documento_com_foto: "Documento com foto",
};

/** Um envio como a tela do /admin o recebe. `dados` já vem como texto formatado. */
export type EnvioAdmin = {
  id: string;
  formulario: FormularioEnvio;
  idSessao: string;
  data: string;
  atualizadoEm: string;
  nome: string;
  telefone: string;
  etapa: number;
  etapaId: string;
  totalEtapas: number;
  concluido: boolean;
  statusEnvio: StatusEnvio;
  plano: string;
  /** O formulário inteiro, já em JSON indentado para leitura. */
  dados: string;
  anexos: AnexoResumo[];
};

/* ---------------- limites ---------------- */

/**
 * Os tetos que o código aplica ANTES de falar com o banco.
 *
 * Eles são mais apertados que as restrições da tabela de propósito: a tabela é
 * a parede (o que impede um `INSERT` à mão de virar depósito de arquivo), e
 * estes são o batente — cortam no tamanho do dado real, sem nunca deixar o
 * envio de uma pessoa ser recusado por causa de um campo comprido demais.
 */
export const MAX_NOME = 150;
export const MAX_TELEFONE = 20;
export const MAX_PLANO = 120;
export const MAX_ETAPA_ID = 40;
/** O mesmo teto que `dadosSchema` já aplica na entrada (`form-schemas.ts`). */
export const MAX_DADOS_BYTES = 64_000;

/** Corta um texto no limite da coluna. Vazio vira `null`, que é o que a coluna aceita. */
export function corte(valor: string | null | undefined, max: number): string | null {
  const limpo = valor?.trim();
  if (!limpo) return null;
  return limpo.length > max ? limpo.slice(0, max) : limpo;
}

/**
 * `dados` dentro do teto.
 *
 * O schema de entrada já recusa acima de 64KB, então isto quase nunca faz
 * nada. Quase: um envio que passe por outro caminho não pode virar uma linha de
 * megabytes, e gravar um aviso é melhor do que gravar nada — o nome e o
 * telefone da pessoa continuam valendo mesmo sem o resto do formulário.
 */
export function dadosDentroDoTeto(dados: Record<string, unknown>): Record<string, unknown> {
  try {
    const texto = JSON.stringify(dados);
    if (texto.length <= MAX_DADOS_BYTES) return dados;
  } catch {
    // ciclo no objeto: cai no aviso abaixo
  }
  return { _erro: "Dados acima do tamanho permitido; não foram gravados." };
}

/* ---------------- leitura do formulário ---------------- */

type Registro = Record<string, unknown>;

const objeto = (valor: unknown): Registro =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Registro) : {};

/**
 * Desfaz a neutralização de fórmula ANTES de o valor virar coluna.
 *
 * `neutralizeFormula` (form-schemas.ts) põe um apóstrofo na frente de todo texto
 * que comece com `=`, `+`, `-` ou `@`, para que uma planilha aberta a partir de
 * um CSV do n8n não interprete o campo como fórmula. Isso é certo para o texto
 * que sai daqui — e errado para a coluna `telefone`, porque todo WhatsApp
 * começa com `+55`: sem isto, a coluna guardaria `'+5549999998888`, o formatador
 * da tela mostraria o número cru e uma busca por telefone não acharia ninguém.
 *
 * O apóstrofo só cai quando o caractere seguinte é justamente um dos que
 * disparam a neutralização — um nome que comece com apóstrofo de verdade
 * ("'Tonho") continua inteiro.
 */
const semNeutralizacao = (valor: string): string =>
  valor.startsWith("'") && /^[=+\-@\t\r]/.test(valor.slice(1)) ? valor.slice(1) : valor;

const texto = (valor: unknown): string =>
  typeof valor === "string"
    ? semNeutralizacao(valor.trim())
    : typeof valor === "number"
      ? String(valor)
      : "";

/**
 * Nome, telefone e plano tirados do formulário para virarem coluna.
 *
 * A ordem de preferência tem motivo: o nome do CADASTRO é o do documento, e é
 * ele que vale numa contratação; o da origem é o que a pessoa digitou correndo
 * na home. Já o telefone é o contrário — o da origem é o WhatsApp com DDI, por
 * onde o comercial vai ligar, e o do cadastro é um contato adicional.
 *
 * Nada aqui é obrigatório: um envio que parou antes de dizer o nome ainda vira
 * linha, com a coluna vazia. É a linha vazia que revela onde o formulário perde
 * gente.
 */
export function resumoDoEnvio(dados: Record<string, unknown>): {
  nome: string | null;
  telefone: string | null;
  plano: string | null;
} {
  const origem = objeto(dados["origem"]);
  const cadastro = objeto(dados["cadastro"]);
  const planos = objeto(dados["planos"]);

  return {
    nome: corte(texto(cadastro["nome"]) || texto(origem["nome"]), MAX_NOME),
    telefone: corte(
      texto(origem["whatsapp"]) || texto(cadastro["telefone"]) || texto(origem["telefone"]),
      MAX_TELEFONE,
    ),
    plano: corte(texto(planos["nome"]), MAX_PLANO),
  };
}
