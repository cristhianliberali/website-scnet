/**
 * Formatação e leituras derivadas do painel.
 *
 * Vive fora dos componentes porque não é apresentação: é a regra de como um
 * número vira dinheiro na tela, como uma data do cadastro vira data legível e
 * como um monte de faturas vira uma única palavra sobre a situação do cliente.
 */

import type { EnderecoContrato, Fatura, StatusFinanceiro } from "./painel-tipos";

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

/**
 * A fatura está esperando pagamento?
 *
 * É `aberto` ou `vencido` — e não "tudo que não está pago". A diferença
 * aparece na fatura **cancelada**: ela não foi paga, mas também não é devida.
 * Contá-la como pendente cobraria do cliente algo que o provedor já anulou.
 */
export const faturaEmAberto = (f: Fatura) => f.status === "aberto" || f.status === "vencido";

/** Uma fatura em aberto pesa; uma vencida pesa mais. É o que decide a cor do banner. */
export function situacaoFinanceira(faturas: Fatura[]): StatusFinanceiro {
  if (faturas.some((f) => f.status === "vencido")) return "vencido";
  if (faturas.some((f) => f.status === "aberto")) return "em_aberto";
  return "em_dia";
}

/**
 * `11144477735` -> `111.444.777-35`, e o CNPJ equivalente.
 *
 * A view do cadastro devolve o documento só com dígitos — é assim que o login
 * o compara. Quem já mandar pontuado passa direto: só formatamos o que tem
 * exatamente 11 ou 14 dígitos, e o resto sai como veio.
 */
export function documento(valor: string): string {
  const d = valor.replace(/\D/g, "");
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return valor;
}

/** `49999123456` -> `(49) 99912-3456`. Idem: só os dígitos vêm da view. */
export function telefone(valor: string): string {
  const bruto = valor.replace(/\D/g, "");
  const d = bruto.startsWith("55") && bruto.length > 11 ? bruto.slice(2) : bruto;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return valor;
}

/** `89801100` -> `89801-100`. O cadastro guarda só os dígitos. */
export function cep(valor: string): string {
  const d = valor.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : valor;
}

/** O endereço numa linha só, pulando o que o cadastro não tiver. */
export function enderecoEmLinha(e: EnderecoContrato): string {
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const cidadeUf = [e.cidade, e.uf].filter(Boolean).join("/");
  return [rua, e.complemento, e.bairro, cidadeUf, e.cep ? `CEP ${cep(e.cep)}` : ""]
    .filter(Boolean)
    .join(" • ");
}
