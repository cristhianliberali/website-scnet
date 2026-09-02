/**
 * A forma de pagamento escolhida na contratação.
 *
 * **Por que isto é um campo do formulário, e não uma pergunta do atendente.**
 * A cobrança é o único dado do contrato que o cliente não informava em lugar
 * nenhum: ele preenchia tudo, assinava, e alguém precisava ligar depois só para
 * perguntar "boleto ou débito?". Quem escolhe débito em conta ainda tinha de
 * ditar banco, agência e conta por telefone — e é aí que nasce o débito
 * devolvido por causa de um dígito trocado.
 *
 * São duas opções, e a diferença entre elas não é o preço, é o caminho:
 *
 * - **Pix ou Boleto** — a cobrança chega até a pessoa (WhatsApp e e-mail).
 * - **Débito em conta** — a pessoa não faz nada todo mês, mas precisa dizer
 *   agora de qual conta sai; e só os três bancos com convênio de débito valem,
 *   por isso o banco é uma escolha fechada e não um campo livre.
 *
 * Módulo puro: é lido pelo formulário, pela mensagem do WhatsApp e pelo que vai
 * ao webhook, então não pode importar nada de servidor.
 */

import { LIMITES } from "./form-limits";

export type MetodoPagamento = "" | "pix_boleto" | "debito_conta";

/** As opções como a etapa 4 as desenha: título selecionável e descrição sutil. */
export const METODOS_PAGAMENTO = [
  {
    id: "pix_boleto",
    titulo: "Pix ou Boleto",
    descricao: "enviado no WhatsApp e Email",
  },
  {
    id: "debito_conta",
    titulo: "Débito em conta",
    descricao:
      "Debitado automaticamente na sua conta, disponível para Banco do Brasil, Sicoob e Sicredi",
  },
] as const satisfies readonly {
  id: Exclude<MetodoPagamento, "">;
  titulo: string;
  descricao: string;
}[];

export type BancoDebito = "" | "banco_do_brasil" | "sicoob" | "sicredi";

/** Só os bancos com convênio de débito automático — o resto não tem como debitar. */
export const BANCOS_DEBITO = [
  ["banco_do_brasil", "Banco do Brasil"],
  ["sicoob", "Sicoob"],
  ["sicredi", "Sicredi"],
] as const satisfies readonly (readonly [Exclude<BancoDebito, "">, string])[];

export type DadosPagamento = {
  metodo: MetodoPagamento;
  banco: BancoDebito;
  agencia: string;
  conta: string;
};

export const PAGAMENTO_VAZIO: DadosPagamento = {
  metodo: "",
  banco: "",
  agencia: "",
  conta: "",
};

export const rotuloMetodo = (metodo: MetodoPagamento): string =>
  METODOS_PAGAMENTO.find((m) => m.id === metodo)?.titulo ?? "";

export const rotuloBanco = (banco: BancoDebito): string =>
  BANCOS_DEBITO.find(([id]) => id === banco)?.[1] ?? "";

/** Só o débito precisa de conta bancária; o boleto chega pronto. */
export const exigeConta = (metodo: MetodoPagamento): boolean => metodo === "debito_conta";

/* ---------------- máscaras ---------------- */

/**
 * Agência e conta aceitam dígitos e um hífen — o dígito verificador.
 *
 * A conta ainda aceita "X" no fim, que é o dígito de algumas contas do Banco do
 * Brasil. Sem isso, o cliente digitaria o X, não veria nada aparecer e mandaria
 * a conta sem o dígito — uma conta que o banco recusa no primeiro débito.
 */
function mascaraBancaria(valor: string, max: number, comX: boolean): string {
  let saida = "";
  for (const caractere of valor.toUpperCase()) {
    if (/\d/.test(caractere)) {
      saida += caractere;
      continue;
    }
    // Um hífen só, e nunca na frente: "-1234" não é conta de ninguém.
    if (caractere === "-" && saida !== "" && !saida.includes("-")) saida += caractere;
    // O X é dígito verificador, então vale uma vez e só depois de algum número.
    else if (comX && caractere === "X" && saida !== "" && !saida.includes("X")) saida += caractere;
  }
  return saida.slice(0, max);
}

export const maskAgencia = (valor: string): string =>
  mascaraBancaria(valor, LIMITES.agencia, false);

export const maskConta = (valor: string): string => mascaraBancaria(valor, LIMITES.conta, true);

const digitos = (valor: string) => valor.replace(/\D/g, "").length;

/* ---------------- validação ---------------- */

/**
 * Os erros do bloco de pagamento, na mesma forma que o assistente já usa.
 *
 * Fora do componente porque esta é a regra que decide se a cobrança vai
 * funcionar — ela precisa ser conferível sem montar a tela.
 */
export function errosPagamento(pagamento: DadosPagamento): Record<string, string> {
  if (!pagamento.metodo) return { pagamento_metodo: "Escolha a forma de pagamento" };
  if (!exigeConta(pagamento.metodo)) return {};

  const erros: Record<string, string> = {};
  if (!pagamento.banco) erros["pagamento_banco"] = "Escolha o banco";
  if (digitos(pagamento.agencia) < 3) erros["pagamento_agencia"] = "Informe a agência (ex: 1234)";
  if (digitos(pagamento.conta) < 4)
    erros["pagamento_conta"] = "Informe a conta com o dígito (ex: 12345-6)";
  return erros;
}

/* ---------------- saída ---------------- */

/**
 * Os campos que vão ao webhook e para a linha de `web_envios`.
 *
 * Eles são espalhados DENTRO de `anexos_agendamento`, e não num grupo
 * `pagamento` à parte: cada grupo de `dados` é o retrato de uma etapa do
 * formulário, e a cobrança é preenchida na mesma etapa do agendamento. Daí os
 * nomes já virem prefixados pelo assunto (`metodo`, `banco`...) — eles convivem
 * com `data` e `periodo` sem ambiguidade.
 *
 * O código e o nome do banco viajam juntos: o fluxo do n8n casa pelo código, e
 * quem abre o envio no /admin lê o nome sem precisar de uma tabela de-para.
 * Quem escolheu boleto manda os campos de conta explicitamente nulos, e não
 * ausentes — um campo que some é um campo que ninguém sabe se foi perguntado.
 */
export function pagamentoWebhook(pagamento: DadosPagamento) {
  const debito = exigeConta(pagamento.metodo);
  return {
    metodo: pagamento.metodo || null,
    metodo_nome: rotuloMetodo(pagamento.metodo) || null,
    banco: debito ? pagamento.banco || null : null,
    banco_nome: debito ? rotuloBanco(pagamento.banco) || null : null,
    agencia: debito ? pagamento.agencia.trim() || null : null,
    conta: debito ? pagamento.conta.trim() || null : null,
  };
}
