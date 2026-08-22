/**
 * O vocabulário do painel do cliente: o que o n8n devolve, o que cada
 * formulário manda e qual evento carrega cada um.
 *
 * Como `cliente-tipos.ts`, este arquivo não importa nada de runtime — ele é
 * lido pelo componente (código de navegador) e pelos módulos `.server.ts` ao
 * mesmo tempo, e o bundle do cliente recusa qualquer coisa vinda de
 * `@tanstack/react-start/server`.
 */

/* ---------------- eventos ---------------- */

/**
 * As consultas do painel. Cada uma vira um `evento` próprio no webhook, para
 * que o Switch do n8n roteie direto, sem precisar abrir `dados` para saber do
 * que a chamada trata.
 *
 * `bootstrap` é a primeira: sai uma única vez logo depois do login e traz o
 * painel inteiro. As outras existem para recarregar uma parte só, quando um
 * formulário mexeu naquilo — não para montar a tela.
 */
export const CONSULTAS_PAINEL = {
  bootstrap: "painel_bootstrap",
  contratos: "painel_contratos",
  faturas: "painel_faturas",
  notas_fiscais: "painel_notas_fiscais",
  indicacoes: "painel_indicacoes",
  chamados: "painel_chamados",
  planos: "painel_planos",
} as const;

export type SecaoPainel = keyof typeof CONSULTAS_PAINEL;

/**
 * Um evento por formulário, como pedido: o n8n roteia por `evento` e cada
 * ramo trata só do seu. `dados.formulario` e `dados.campos` continuam no
 * corpo, então um ramo genérico de `formulario_painel` também dá conta.
 */
export const FORMULARIOS_PAINEL = {
  trocar_plano: "painel_trocar_plano",
  indicar_amigo: "painel_indicar_amigo",
  pix_automatico: "painel_pix_automatico",
  debito_automatico: "painel_debito_automatico",
  viabilidade_endereco: "painel_viabilidade_endereco",
  mudanca_endereco: "painel_mudanca_endereco",
  trocar_titular: "painel_trocar_titular",
  segunda_via: "painel_segunda_via",
  nota_fiscal: "painel_nota_fiscal",
  abrir_chamado: "painel_abrir_chamado",
  diagnostico_conexao: "painel_diagnostico_conexao",
  desbloqueio_confianca: "painel_desbloqueio_confianca",
} as const;

/*
 * `painel_reiniciar_conexao` e `painel_teste_velocidade` saíram daqui junto com
 * os botões que os disparavam: os dois precisavam de um comando e de uma
 * medição no equipamento do cliente, que nenhuma tabela nossa alcança hoje. Os
 * ramos podem continuar no workflow — o site simplesmente não os chama mais.
 */

export type FormularioPainel = keyof typeof FORMULARIOS_PAINEL;

/** Quais seções cada formulário desatualiza — invalidadas assim que ele volta `ok`. */
export const SECOES_AFETADAS: Record<FormularioPainel, readonly SecaoPainel[]> = {
  trocar_plano: ["contratos", "faturas"],
  indicar_amigo: ["indicacoes"],
  pix_automatico: ["faturas"],
  debito_automatico: ["faturas"],
  viabilidade_endereco: [],
  mudanca_endereco: ["contratos", "chamados"],
  trocar_titular: ["contratos"],
  segunda_via: ["faturas"],
  nota_fiscal: ["notas_fiscais"],
  abrir_chamado: ["chamados"],
  diagnostico_conexao: [],
  desbloqueio_confianca: ["contratos", "faturas"],
};

/* ---------------- domínio ---------------- */

export type StatusFinanceiro = "em_dia" | "em_aberto" | "vencido";
export type StatusConexao = "online" | "alerta" | "offline";
export type StatusFatura = "pago" | "aberto" | "vencido" | "cancelado";
export type StatusIndicacao = "pendente" | "em_instalacao" | "instalado" | "cancelado";
export type StatusChamado = "aberto" | "em_analise" | "agendado" | "resolvido" | "cancelado";

export type TipoCadastro = "cpf" | "cnpj" | "";
export type StatusCliente = "ativo" | "inativo";

export type ClientePainel = {
  id: string;
  nome: string;
  documento: string;
  email: string;
  telefone: string;
  codigo: string;
  clienteDesde: string;
  codigoIndicacao: string;
  linkIndicacao: string;
  descontoAcumulado: number;
  nascimento: string;
  tipoCadastro: TipoCadastro;
  /** Endereço do cadastro — o do titular, que nem sempre é o da instalação. */
  endereco: EnderecoContrato;
  status: StatusCliente;
};

export type EnderecoContrato = {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
};

export type Contrato = {
  id: string;
  numero: string;
  apelido: string;
  endereco: EnderecoContrato;
  /**
   * O endereço já escrito numa linha só.
   *
   * Existe porque os dois formatos são legítimos: o cadastro que guarda o
   * endereço em campos separados preenche `endereco`, e o que guarda tudo numa
   * coluna preenche este. A tela usa este quando ele existe — reescrever um
   * texto que já veio pronto só arrisca estragá-lo.
   */
  enderecoTexto: string;
  plano: string;
  download: string;
  upload: string;
  valorMensal: number;
  statusFinanceiro: StatusFinanceiro;
  statusConexao: StatusConexao;
  diaVencimento: number;
  ssidWifi: string;
  roteador: string;
  ip: string;
  instaladoEm: string;
  tecnologia: string;
  /** Os itens que acompanham o plano, já separados. */
  composicao: string[];
  /** Quando o contrato foi assinado. */
  adesao: string;
  /** Fim da fidelidade/vigência, quando existe. */
  vigenciaAte: string;
};

export type Fatura = {
  id: string;
  idContrato: string;
  referencia: string;
  vencimento: string;
  valor: number;
  status: StatusFatura;
  linhaDigitavel: string;
  pixCopiaECola: string;
  /** Link do boleto em PDF, quando o provedor tiver um. */
  urlBoleto: string;
  pagoEm: string;
  /**
   * O valor de face da fatura. `valor` é o que se paga hoje — com juros e multa
   * quando vencida —, e é por isso que os dois existem: exibir só o atualizado
   * esconderia o acréscimo, e exibir só o original cobraria a menos.
   */
  valorOriginal: number;
  /** Texto da fatura ("Mensalidade Agosto/2026"), quando o cadastro manda um. */
  descricao: string;
};

export type NotaFiscal = {
  id: string;
  numero: string;
  serie: string;
  referencia: string;
  emitidaEm: string;
  valor: number;
  numeroContrato: string;
  cfop: string;
  chaveVerificacao: string;
  urlDanfe: string;
};

export type Indicacao = {
  id: string;
  /** O número que o cliente cita ao perguntar pela indicação. */
  protocolo: string;
  nome: string;
  telefone: string;
  cidade: string;
  data: string;
  status: StatusIndicacao;
  /**
   * O bônus já escrito para ler ("Desconto na fatura", "PIX de R$ 50,00").
   * O que a tabela guarda é o par tipo + descrição; a frase sai da leitura.
   */
  bonus: string;
  /** Quanto a indicação vale, quando o bônus é em dinheiro. */
  desconto: number;
};

export type Chamado = {
  id: string;
  protocolo: string;
  idContrato: string;
  categoria: string;
  assunto: string;
  descricao: string;
  status: StatusChamado;
  abertoEm: string;
  agendadoPara: string;
};

export type PlanoDisponivel = {
  id: string;
  nome: string;
  download: string;
  upload: string;
  valor: number;
  vantagens: string[];
  destaque: boolean;
  selo: string;
  /**
   * O número da oferta no MK (`planos_upgrade.codigo_oferta_mk`). Vazio quando
   * a linha não tem um. Vai junto no pedido de troca: é por ele que o fluxo
   * acha a oferta do outro lado, sem depender do nome do plano.
   */
  codigoOfertaMk: string;
};

/** Um adicional contratável junto com a troca de plano (mesh, streaming...). */
export type AdicionalPlano = {
  id: string;
  nome: string;
  descricao: string;
  valor: number;
};

/**
 * O painel inteiro, do jeito que a tela usa.
 *
 * Toda lista pode voltar vazia: um cliente sem nota fiscal emitida é normal, e
 * a tela mostra o vazio em vez de quebrar.
 */
export type PainelSnapshot = {
  cliente: ClientePainel;
  contratos: Contrato[];
  faturas: Fatura[];
  notasFiscais: NotaFiscal[];
  indicacoes: Indicacao[];
  chamados: Chamado[];
  planos: PlanoDisponivel[];
  adicionais: AdicionalPlano[];
  avisos: AvisoPainel[];
  /** Ligado pelo n8n quando o cliente pode pedir desbloqueio em confiança. */
  desbloqueioDisponivel: boolean;
  /** Quando o site montou este retrato, em epoch de milissegundos. */
  atualizadoEm: number;
};

export type AvisoPainel = {
  id: string;
  titulo: string;
  texto: string;
  tipo: "info" | "sucesso" | "alerta" | "erro";
  data: string;
};
