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

/* ---------------- área do cliente ---------------- */

/**
 * O liga/desliga da área de membros inteira.
 *
 * Desligada, `/cliente` e `/cliente/painel` deixam de funcionar: quem chega vê
 * a mensagem abaixo e é levado ao WhatsApp da central. Existe para quando o n8n
 * cai, o Mikrotik está em manutenção ou o cadastro está sendo migrado — momentos
 * em que a área do cliente responderia erro para todo mundo, e um erro genérico
 * manda o cliente embora enquanto a central resolveria o caso em um minuto.
 *
 * Vale também para o "Já sou cliente" do formulário de contratação: com a área
 * ligada ele leva ao login; desligada, ao mesmo WhatsApp.
 */
export type ConfigAreaCliente = {
  ativa: boolean;
  /** O que o cliente lê antes de ser levado ao WhatsApp. */
  mensagem: string;
};

export const CONFIG_AREA_CLIENTE_PADRAO: ConfigAreaCliente = {
  ativa: true,
  mensagem:
    "A área do cliente está em manutenção no momento. Nossa central resolve com você agora mesmo pelo WhatsApp.",
};

/* ---------------- segurança (reCAPTCHA) ---------------- */

/**
 * O controle do anti-robô, editável no /admin.
 *
 * **Por que isto existe.** O reCAPTCHA só podia ser desligado apagando a
 * `RECAPTCHA_SECRET_KEY` no painel do servidor e reiniciando o container. Quando
 * ele passa a recusar clientes de verdade — chave pública que não entrou no
 * build, domínio fora da lista no painel do Google, pontuação baixa num site
 * novo —, o formulário para de funcionar para TODO MUNDO, e a única saída fica
 * fora do alcance de quem está atendendo. Um provedor não pode ficar sem
 * receber pedido esperando um deploy.
 *
 * O que estiver definido aqui manda; o que estiver vazio cai na variável de
 * ambiente. Assim quem já configurou por variável não perde nada, e quem
 * precisa mexer às pressas mexe pela tela.
 */
export type ConfigSeguranca = {
  /** Desligado, nenhum envio é recusado por reCAPTCHA (o limite por IP continua). */
  recaptchaAtivo: boolean;
  /**
   * Corte de pontuação, como texto ("0.1"). Vazio usa RECAPTCHA_MIN_SCORE, e
   * na falta dela o padrão do código.
   */
  minScore: string;
};

export const CONFIG_SEGURANCA_PADRAO: ConfigSeguranca = {
  recaptchaAtivo: true,
  minScore: "",
};

/**
 * O que o /admin mostra sobre o estado do anti-robô.
 *
 * Isto é leitura, não configuração: são os fatos que só o servidor conhece e
 * que respondem "por que não deixa enviar?" — a mesma coisa que a /diagnostico
 * mostra, trazida para onde a pessoa já está logada.
 */
export type DiagnosticoSeguranca = {
  /** A chave PÚBLICA entrou no build? Falso aqui explica 100% das recusas. */
  siteKeyNoBundle: boolean;
  /** A chave SECRETA existe no servidor? Sem ela nada é verificado. */
  secretNoServidor: boolean;
  /** O corte em vigor agora, já considerando o que foi definido no /admin. */
  minScoreEmVigor: number;
  /** Domínio derivado de VITE_SITE_URL. */
  hostnameEsperado: string;
  /** As últimas recusas, da mais recente para a mais antiga. */
  ultimosBloqueios: {
    em: string;
    formulario: string;
    motivo: string;
    score: number | null;
  }[];
};

/* ---------------- scripts / tags ---------------- */

/**
 * Onde o código colado entra no HTML.
 *
 * São os três lugares que qualquer ferramenta de tag pede, e cada um existe por
 * um motivo diferente — não é gosto:
 *
 * - `head`: o script principal do Tag Manager, verificações de propriedade de
 *   domínio (Google, Facebook), e qualquer coisa que precise rodar ANTES da
 *   página aparecer.
 * - `body_inicio`: o `<noscript>` do Tag Manager. O Google exige que ele seja a
 *   primeira coisa dentro do `<body>`, e é só para quem está sem JavaScript.
 * - `body_fim`: widget de chat, pixel secundário, qualquer coisa que possa
 *   esperar a página inteira carregar. É o lugar mais seguro: nada aqui atrasa
 *   o que a pessoa vê.
 */
export type PosicaoScript = "head" | "body_inicio" | "body_fim";

/** O rótulo e a explicação de cada posição, na ordem em que a tela mostra. */
export const POSICOES_SCRIPT: Record<PosicaoScript, { rotulo: string; ajuda: string }> = {
  head: {
    rotulo: "Header — dentro do <head>",
    ajuda: "Roda antes da página aparecer. É aqui que vai o script do Google Tag Manager.",
  },
  body_inicio: {
    rotulo: "Body — logo depois do <body>",
    ajuda: "O <noscript> do Tag Manager pede exatamente este lugar.",
  },
  body_fim: {
    rotulo: "Footer — no fim do <body>",
    ajuda: "Chat, pixel secundário. O lugar mais seguro: não atrasa nada do que a pessoa vê.",
  },
};

/**
 * Um trecho de código colado no /admin.
 *
 * O `codigo` é HTML cru e vai para a página **exatamente** como foi colado —
 * é o que faz um Tag Manager funcionar. Isso também quer dizer que aqui não
 * existe rede de proteção: o que for colado roda no navegador de todo visitante.
 * Por isso a tela do admin é a única porta, e por isso o /admin e a /diagnostico
 * nunca recebem estes trechos (ver `injetar-scripts.server.ts`).
 */
export type ScriptAdmin = {
  /** Gerado no servidor ao criar. É a chave para editar e excluir. */
  id: string;
  /** Só para você se achar na lista: "Google Tag Manager", "Pixel Meta". */
  nome: string;
  posicao: PosicaoScript;
  codigo: string;
  /**
   * Desligado, o trecho continua guardado mas some da página.
   *
   * É o que permite desligar um rastreamento em dez segundos sem perder o
   * código — apagar para depois recolar é como se perde um GTM configurado.
   */
  ativo: boolean;
  atualizadoEm: string;
};

/** Um trecho novo, antes de ser salvo. */
export const SCRIPT_VAZIO: ScriptAdmin = {
  id: "",
  nome: "",
  posicao: "head",
  codigo: "",
  ativo: true,
  atualizadoEm: "",
};

/**
 * Tags de estrutura da página, que um trecho de rastreamento nunca precisa.
 *
 * Recusadas na hora de salvar. Um `</body>` colado por engano no meio de um
 * snippet — acontece quando se copia a página inteira em vez do trecho —
 * embaralharia o ponto de injeção e cortaria o final da página para todo mundo.
 */
export const TAGS_PROIBIDAS = ["<html", "</html", "<head", "</head", "<body", "</body"];

/* ---------------- sessão ---------------- */

export type SessaoAdmin = { usuario: string };

export type AdminErro = { ok: false; mensagem: string };
export type AdminOk<T> = { ok: true; dados: T };
export type AdminResultado<T> = AdminOk<T> | AdminErro;
