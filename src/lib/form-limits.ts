/**
 * Teto de caracteres de cada campo de texto dos formulários do site.
 *
 * Vive num arquivo só porque os dois lados precisam do MESMO número: o
 * `maxLength` do input (que é o que a pessoa sente ao digitar ou colar) e o
 * corte no servidor, antes de o campo seguir para o webhook do n8n.
 *
 * Os campos com máscara — CEP, CPF, telefone — já se limitam sozinhos, porque
 * `maskCep`/`maskCpf`/`maskPhone` cortam os dígitos ao formatar. Quem não tem
 * máscara ficava sem teto nenhum: colar um texto de mil linhas no complemento
 * do endereço passava direto pelo formulário e pelo servidor, e só esbarrava no
 * teto de 64KB do `dados` inteiro.
 */

/** Tetos por campo, na chave com que o campo viaja dentro de `dados`. */
export const LIMITES = {
  nome: 120,
  email: 120,
  cidade: 60,
  bairro: 60,
  logradouro: 120,
  numero: 10,
  complemento: 60,
  condominio: 80,
  observacao: 500,
} as const;

/**
 * Teto de qualquer outra string que apareça em `dados`.
 *
 * Larga o bastante para o que o site mesmo põe lá (a composição do plano é a
 * maior delas), apertada o bastante para que um POST direto na server function
 * não vire depósito de texto no n8n.
 */
export const LIMITE_GENERICO = 2_000;

/** Corta o texto no teto. Nunca recusa: o formulário já limitou na digitação. */
export function limitar(valor: string, max: number): string {
  return valor.length > max ? valor.slice(0, max) : valor;
}

const limiteDaChave = (chave: string): number =>
  LIMITES[chave as keyof typeof LIMITES] ?? LIMITE_GENERICO;

/**
 * Aplica os tetos em todas as strings de `dados`, cada uma pelo teto da chave
 * que a carrega (`complemento` pelo de complemento, e assim por diante).
 *
 * Corta em vez de recusar de propósito. O `maxLength` do formulário é quem
 * impede o texto gigante de existir; aqui só sobra o caso de alguém falar com a
 * server function por fora — e nesse caso um campo cortado é melhor do que uma
 * contratação legítima barrada por um teto que a pessoa nem viu.
 */
export function limitarCampos(valor: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (Array.isArray(valor)) return valor.map((item) => limitarCampos(item, depth + 1));
  if (valor !== null && typeof valor === "object") {
    const out: Record<string, unknown> = {};
    for (const [chave, entrada] of Object.entries(valor)) {
      out[chave] =
        typeof entrada === "string"
          ? limitar(entrada, limiteDaChave(chave))
          : limitarCampos(entrada, depth + 1);
    }
    return out;
  }
  if (typeof valor === "string") return limitar(valor, LIMITE_GENERICO);
  return valor;
}
