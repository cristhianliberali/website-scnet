/**
 * Modelo dos planos exibidos no site.
 *
 * Os dados vêm da tabela de planos no Postgres (ver `planos-db.ts`), já
 * normalizados para este formato antes de chegar ao componente. A lista
 * `FALLBACK_PLANOS` é usada só quando o banco não está configurado ou
 * respondeu com erro — assim a página nunca fica sem planos.
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

/* ---------------- fallback ---------------- */

const fallback = (
  id: number,
  nome: string,
  valor: string,
  descricao: string,
  composicao: string,
  destaque = false,
): Plan => ({
  id_plano: id,
  codigo_mk: null,
  nome,
  descricao,
  valor,
  valor_primeiras_faturas: null,
  quant_meses_desconto: null,
  composicao,
  composicao_resumo: null,
  itens: splitList(composicao),
  logos: [],
  destaque,
  nome_destaque: destaque ? "Mais escolhido" : null,
  ordem_grade: id,
});

/**
 * Planos exibidos enquanto o Postgres não está configurado (dev local sem
 * banco) ou quando a consulta falha.
 */
export const FALLBACK_PLANOS: Plan[] = [
  fallback(
    1,
    "Plano 450",
    "109,90",
    "Pra quem quer resolver o dia a dia sem drama: redes sociais, séries e trabalho leve, tudo rodando leve.",
    "Internet fibra óptica;450 Mega de velocidade;1x Roteador Wi-Fi 6 Incluso;App Skeelo;Instalação gratuita*",
  ),
  fallback(
    2,
    "Plano 710",
    "119,90",
    "Casa com mais gente conectada ao mesmo tempo? Esse aguenta o tranco, aula online, chamada de vídeo e streaming juntos, sem travar.",
    "Internet fibra óptica;710 Mega de velocidade;1x Roteador Wi-Fi 6 Incluso;App Skeelo;Instalação gratuita*",
  ),
  fallback(
    3,
    "Plano Infinity",
    "139,90",
    "Várias telas, jogo online, home office e streaming em 4K rodando ao mesmo tempo.",
    "Internet fibra óptica;Sem controle de velocidade;1x Roteador Wi-Fi 6 Incluso;App Skeelo;Instalação gratuita*",
    true,
  ),
  fallback(
    4,
    "Plano Infinity Duo",
    "159,90",
    "Ideal para residencias amplas e vários dispositivos conectados, possui 2 roteadores garantindo Wi-Fi em todos os comôdos.",
    "Internet fibra óptica;Sem controle de velocidade;2x Roteadores Wi-Fi 6 Inclusos;App Skeelo;Instalação R$ 100,00 (taxa única)*",
  ),
];
