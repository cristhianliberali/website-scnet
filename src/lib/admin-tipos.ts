/**
 * O vocabulário do painel super admin.
 *
 * Como `painel-tipos.ts`, este arquivo não importa nada de runtime — ele é lido
 * pelo componente (código de navegador) e pelos módulos `.server.ts` ao mesmo
 * tempo, e o bundle do cliente recusa qualquer coisa vinda de
 * `@tanstack/react-start/server`.
 */

/* ---------------- planos ---------------- */

/**
 * Um plano, do jeito que o formulário do admin edita.
 *
 * Vale para as duas tabelas: `planos_web` (a vitrine da home e da contratação)
 * e `planos_upgrade` (a troca de plano do painel). A diferença é uma coluna só
 * — `codigo_oferta`, que restringe o plano a uma campanha e não existe no
 * upgrade —, então `codigoOferta` fica opcional em vez de duplicar o tipo.
 *
 * Tudo é texto aqui, inclusive valor e ordem. O formulário mexe em campo de
 * texto; converter na borda (aqui) e não no meio da tela é o que evita o
 * "NaN" aparecer num input enquanto alguém apaga um dígito.
 */
export type PlanoAdmin = {
  idPlano: string;
  ativo: boolean;
  ordemGrade: string;
  destaque: boolean;
  codigoMk: string;
  nome: string;
  descricao: string;
  valor: string;
  valorPrimeirasFaturas: string;
  quantMesesDesconto: string;
  composicaoResumo: string;
  /** Itens separados por ";" — "Wi-Fi 6 incluso;Skeelo;Suporte 24h". */
  composicao: string;
  /** URLs separadas por ";". Não há upload: o admin cola o endereço da imagem. */
  urlLogoAgregados: string;
  nomeDestaque: string;
  codigoOfertaMk: string;
  /** Só em `planos_web`. Vazio (ou ausente) no catálogo de upgrade. */
  codigoOferta?: string | undefined;
};

/** Qual catálogo está sendo editado. */
export type CatalogoPlanos = "site" | "upgrade";

export const PLANO_VAZIO: PlanoAdmin = {
  idPlano: "",
  ativo: true,
  ordemGrade: "0",
  destaque: false,
  codigoMk: "",
  nome: "",
  descricao: "",
  valor: "0",
  valorPrimeirasFaturas: "",
  quantMesesDesconto: "",
  composicaoResumo: "",
  composicao: "",
  urlLogoAgregados: "",
  nomeDestaque: "",
  codigoOfertaMk: "",
  codigoOferta: "",
};

/* ---------------- solicitações ---------------- */

export type StatusSolicitacao = "em_aberto" | "cancelado" | "concluido";

export const STATUS_SOLICITACAO: Record<StatusSolicitacao, string> = {
  em_aberto: "Em aberto",
  cancelado: "Cancelado",
  concluido: "Concluído",
};

/** Um formulário enviado pelo painel do cliente, já como item de fila. */
export type SolicitacaoAdmin = {
  id: string;
  protocolo: string;
  idCliente: string;
  /** Nome do cadastro, quando o cliente ainda está em `clientes_web`. */
  nomeCliente: string;
  formulario: string;
  categoria: string;
  assunto: string;
  descricao: string;
  codContrato: string;
  status: StatusSolicitacao;
  agendadoPara: string;
  observacaoInterna: string;
  criadoEm: string;
  atualizadoEm: string;
  /** O corpo cru do formulário, para quem precisa conferir um campo específico. */
  campos: string;
};

/* ---------------- indicações ---------------- */

export type StatusIndicacaoAdmin = "em_aberto" | "sem_sucesso" | "dados_invalidos" | "concluido";

export const STATUS_INDICACAO_ADMIN: Record<StatusIndicacaoAdmin, string> = {
  em_aberto: "Em aberto",
  sem_sucesso: "Sem sucesso",
  dados_invalidos: "Dados inválidos",
  concluido: "Concluído",
};

export type TipoBonus = "" | "desconto_fatura" | "premio" | "pix";

export const TIPOS_BONUS: Record<Exclude<TipoBonus, "">, string> = {
  desconto_fatura: "Desconto na fatura",
  premio: "Prêmio",
  pix: "PIX",
};

export type IndicacaoAdmin = {
  id: string;
  protocolo: string;
  idCliente: string;
  nomeCliente: string;
  nomeIndicacao: string;
  telefoneIndicacao: string;
  cidade: string;
  observacoes: string;
  /** Preenchidos quando a indicação vira cliente. */
  codNovoCliente: string;
  codContratoNovoCliente: string;
  status: StatusIndicacaoAdmin;
  /**
   * O bônus desta indicação, carimbado no envio pela campanha que estava
   * valendo naquele dia. Editável linha a linha: uma campanha nova não reescreve
   * o que foi prometido em outra.
   */
  campanha: string;
  tipoBonus: TipoBonus;
  descricaoBonus: string;
  valorIndicacao: string;
  data: string;
};

/* ---------------- configuração da indicação ---------------- */

/**
 * O que o admin edita da seção de indicação.
 *
 * `ativo` vale para a área do cliente inteira: com ele desligado somem o banner
 * da visão geral, o serviço da grade e da navegação, e a URL do serviço cai na
 * visão geral. É um interruptor, não um "esconde o botão" — um serviço que
 * ainda responde por link direto é um serviço ligado.
 */
export type ConfigIndicacao = {
  ativo: boolean;
  titulo: string;
  descricao: string;
  bannerDesktopUrl: string;
  bannerMobileUrl: string;
  bannerAlt: string;
  bannerLink: string;
  /**
   * A campanha **vigente**, e só ela.
   *
   * Isto não é histórico: é o carimbo que cada indicação recebe no momento em
   * que é enviada. As condições viajam para a linha da indicação e ficam lá —
   * trocar a campanha aqui muda o que as próximas vão valer e não toca em
   * nenhuma que já existe. É o que permite o cliente ver, no extrato, o prêmio
   * de cada indicação segundo a campanha do dia em que ele indicou.
   */
  campanhaNome: string;
  campanhaTipoBonus: TipoBonus;
  campanhaDescricaoBonus: string;
  campanhaValor: string;
};

export const CONFIG_INDICACAO_PADRAO: ConfigIndicacao = {
  ativo: true,
  titulo: "Indique e ganhe desconto",
  descricao: "A cada amigo que instalar a SCNET, o desconto entra na sua próxima fatura.",
  bannerDesktopUrl: "",
  bannerMobileUrl: "",
  bannerAlt: "",
  bannerLink: "",
  campanhaNome: "",
  campanhaTipoBonus: "desconto_fatura",
  campanhaDescricaoBonus: "Desconto na próxima fatura quando a indicação instalar.",
  campanhaValor: "",
};

/**
 * Os tamanhos que a tela do admin recomenda ao lado de cada campo de banner.
 *
 * Ficam aqui, e não escritos no JSX, porque a mesma medida aparece na dica do
 * campo e no aviso de proporção — e duas medidas diferentes para a mesma imagem
 * é o tipo de coisa que ninguém nota até o banner sair esticado.
 */
export const TAMANHO_BANNER = {
  desktop: { largura: 1200, altura: 240, proporcao: "5:1" },
  mobile: { largura: 720, altura: 360, proporcao: "2:1" },
} as const;

/* ---------------- sessão ---------------- */

export type SessaoAdmin = { usuario: string };

export type AdminErro = { ok: false; mensagem: string };
export type AdminOk<T> = { ok: true; dados: T };
export type AdminResultado<T> = AdminOk<T> | AdminErro;
