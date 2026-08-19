/**
 * Formatação e leituras derivadas do painel.
 *
 * Vive fora dos componentes porque não é apresentação: é a regra de como um
 * número vira dinheiro na tela, como uma data do cadastro vira data legível e
 * como um monte de faturas vira uma única palavra sobre a situação do cliente.
 */

import type { Fatura, StatusFinanceiro } from "./painel-tipos";

const formatadorMoeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export const moeda = (valor: number) => formatadorMoeda.format(Number.isFinite(valor) ? valor : 0);

/**
 * Datas chegam do cadastro como o cadastro quiser: ISO, `dd/mm/aaaa` ou já
 * escritas por extenso. Só o ISO é convertido; o resto passa como veio, porque
 * reformatar um texto que já está pronto costuma estragá-lo.
 */
export function data(valor: string): string {
  if (!valor) return "—";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!iso) return valor;
  return `${iso[3]}/${iso[2]}/${iso[1]}`;
}

/** Uma fatura em aberto pesa; uma vencida pesa mais. É o que decide a cor do banner. */
export function situacaoFinanceira(faturas: Fatura[]): StatusFinanceiro {
  if (faturas.some((f) => f.status === "vencido")) return "vencido";
  if (faturas.some((f) => f.status === "aberto")) return "em_aberto";
  return "em_dia";
}
