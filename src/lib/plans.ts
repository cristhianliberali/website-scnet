/**
 * Modelo dos planos exibidos no site.
 *
 * O banco é a única fonte: os dados vêm da tabela de planos no Postgres (ver
 * `planos-db.ts`), já normalizados para este formato antes de chegar ao
 * componente. Sem banco não há plano — a página mostra o estado vazio em vez
 * de uma lista embutida, que só esconderia o problema.
 */

export type Plan = {
  id_plano: number;
  codigo_mk: number | null;
  nome: string;
  descricao: string | null;
  /** Valor mensal padrão, já formatado em pt-BR ("109,90"). */
  valor: string;
  /** Promoção das primeiras faturas, formatada ("99,90") — null quando não há. */
  valor_primeiras_faturas: string | null;
  /** Quantidade de meses em que `valor_primeiras_faturas` vale. */
  quant_meses_desconto: number | null;
  /** Composição crua, itens separados por ";" — é o que vai no webhook. */
  composicao: string | null;
  composicao_resumo: string | null;
  /** `composicao` já dividida — cada item vira uma linha com ícone de check. */
  itens: string[];
  /** URLs dos logos dos agregados, exibidos abaixo do valor. */
  logos: string[];
  destaque: boolean;
  nome_destaque: string | null;
  ordem_grade: number;
};

/** Recorte do plano enviado ao webhook pelos dois formulários. */
export type PlanoWebhook = {
  nome: string;
  preco: string;
  codigo_mk: number | null;
  composicao: string | null;
  valor_primeiras_faturas: string | null;
  quant_meses_desconto: number | null;
};

export function planoWebhook(plan: Plan): PlanoWebhook {
  return {
    nome: plan.nome,
    preco: plan.valor,
    codigo_mk: plan.codigo_mk,
    composicao: plan.composicao,
    valor_primeiras_faturas: plan.valor_primeiras_faturas,
    quant_meses_desconto: plan.quant_meses_desconto,
  };
}

/* ---------------- helpers ---------------- */

/**
 * Formata um numeric do Postgres (que chega como string, "109.90") no padrão
 * brasileiro. Feito na mão em vez de `toLocaleString` para o servidor e o
 * navegador renderizarem exatamente o mesmo texto.
 */
export function formatBRL(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const [int = "0", dec = "00"] = n.toFixed(2).split(".");
  return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

/** Divide as colunas separadas por ";" (composição e logos dos agregados). */
export function splitList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Texto que acompanha o preço promocional: "nos 3 primeiros meses, após
 * R$ 139,90". Devolve null quando o plano não tem desconto nas primeiras
 * faturas. Recebe os campos soltos porque serve tanto ao `Plan` quanto ao
 * plano já reduzido para os formulários (`PlanoWebhook`).
 */
export function textoPosDesconto(
  valor: string,
  valorPrimeirasFaturas: string | null,
  meses: number | null,
): string | null {
  if (!valorPrimeirasFaturas) return null;
  const periodo =
    meses && meses > 1
      ? `nos ${meses} primeiros meses`
      : meses === 1
        ? "no primeiro mês"
        : "nas primeiras faturas";
  return `${periodo}, após R$ ${valor}`;
}

/** Preço em destaque: o das primeiras faturas quando existe, senão o padrão. */
export const precoVigente = (valor: string, valorPrimeirasFaturas: string | null) =>
  valorPrimeirasFaturas ?? valor;
