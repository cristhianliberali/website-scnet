/**
 * Teto de caracteres de cada campo de formulário do site.
 *
 * Um número por campo, usado nos dois lados: o `maxLength` do input, que impede
 * a digitação de sair do tamanho, e o `.max()` do zod, que é a validação que
 * vale — o input pode ser burlado, o schema não.
 *
 * Os tetos são o tamanho real do dado, e não um número redondo qualquer:
 * telefone com máscara ocupa 15 caracteres, CPF 14, CEP 9. Um campo de nome com
 * 5.000 caracteres não protege ninguém e ainda deixa passar lixo para o n8n e
 * para o banco.
 */
export const LIMITE = {
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
  agencia: 10,
  conta: 20,

  /* filtros de tela */
  busca: 80,
} as const;

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
