/**
 * Teto de caracteres de cada campo de formulário do site.
 *
 * Um número por campo, usado nos dois lados: o `maxLength` do input, que é o
 * que a pessoa sente ao digitar ou colar, e o corte/`.max()` do servidor, que é
 * a validação que vale — o input pode ser burlado, o schema não.
 *
 * Os campos com máscara — CEP, CPF, telefone — já se limitam sozinhos, porque
 * `maskCep`/`maskCpf`/`maskPhone` cortam os dígitos ao formatar; o `maxLength`
 * neles é cinto e suspensório. Quem não tem máscara ficava sem teto nenhum:
 * colar um texto de mil linhas no complemento do endereço passava direto pelo
 * formulário e pelo servidor, e só esbarrava no teto de 64KB do `dados` inteiro.
 *
 * Os tetos são o tamanho real do dado, e não um número redondo qualquer:
 * telefone com máscara ocupa 15 caracteres, CPF 14, CEP 9. Um campo de nome com
 * 5.000 caracteres não protege ninguém e ainda deixa passar lixo para o n8n e
 * para o banco.
 */

/** Tetos por campo, na chave com que o campo viaja dentro de `dados`. */
export const LIMITES = {
  /* identificação */
  /** "Maria Aparecida da Silva Gonçalves" — 120 cobre nomes longos com folga. */
  nome: 120,
  email: 120,
  /** "+999" */
  ddi: 4,
  /** "(49) 99999-9999" */
  telefone: 15,
  /** "000.000.000-00" */
  cpf: 14,
  /** "00.000.000/0000-00" */
  cnpj: 18,
  /** Campo único de CPF **ou** CNPJ: vale o maior dos dois. */
  documento: 18,
  /** "00.000.000-0 SSP/SC" */
  rg: 25,
  /** "AAAA-MM-DD" */
  data: 10,

  /* endereço */
  /** "89800-000" */
  cep: 9,
  logradouro: 120,
  numero: 10,
  complemento: 60,
  bairro: 60,
  cidade: 60,
  uf: 2,
  condominio: 80,

  /* texto livre */
  assunto: 120,
  observacao: 500,
  descricao: 1000,

  /* acesso */
  codigoVerificacao: 6,
  login: 160,
  senha: 200,

  /* pagamento */
  /** Chave aleatória e e-mail são as maiores que o PIX aceita: 77. */
  chavePix: 77,
  /** Código do banco do débito em conta ("banco_do_brasil"). */
  banco: 60,
  agencia: 10,
  conta: 20,

  /* filtros de tela */
  busca: 80,
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

/**
 * Tetos do /admin, espelhando campo a campo o que os schemas de `admin.ts`
 * aceitam. Os números são maiores que os do site porque o conteúdo é outro:
 * a composição de um plano e a observação interna de uma solicitação são
 * textos longos por natureza.
 */
export const LIMITE_ADMIN = {
  login: { usuario: 120, senha: 200 },
  plano: {
    idPlano: 20,
    ordemGrade: 10,
    codigoMk: 20,
    nome: 150,
    descricao: 2000,
    valor: 20,
    quantMesesDesconto: 10,
    composicaoResumo: 500,
    composicao: 4000,
    urlLogoAgregados: 4000,
    nomeDestaque: 60,
    codigoOfertaMk: 30,
    codigoOferta: 60,
  },
  solicitacao: { assunto: 180, observacaoInterna: 4000 },
  indicacao: {
    nome: 150,
    telefone: 20,
    cidade: 120,
    observacoes: 4000,
    codigo: 60,
    campanha: 120,
    descricaoBonus: 2000,
    valor: 20,
  },
  areaCliente: { mensagem: 600 },
  /**
   * A agenda de instalação. São campos curtos por natureza: um prazo é um
   * número de horas, um horário é "HH:MM" e o nome de uma cidade cabe em 120.
   */
  agendamento: { horas: 6, cidade: 120, horario: 5, horizonteDias: 4 },
  seguranca: { minScore: 10 },
  config: {
    titulo: 120,
    descricao: 500,
    bannerUrl: 600,
    bannerAlt: 200,
    bannerLink: 600,
    campanhaNome: 120,
    campanhaDescricaoBonus: 500,
    campanhaValor: 20,
  },
  /**
   * `codigo` é o teto por trecho colado (um GTM inteiro cabe folgado). Ele é
   * grande de propósito, e ainda assim finito: um `web_config` gigante atrasa
   * o arranque do site.
   */
  script: { id: 80, nome: 120, codigo: 20_000 },
} as const;
