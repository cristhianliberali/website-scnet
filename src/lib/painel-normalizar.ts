/**
 * Traduz o JSON do n8n para os tipos do painel.
 *
 * O cadastro de cada provedor chama as coisas do seu jeito, e o fluxo do n8n é
 * escrito depois desta tela. Então nada aqui exige um nome exato: cada campo
 * aceita alguns apelidos (`valor`/`valor_mensal`/`monthlyValue`), número vem
 * como número ou como texto ("129,90"), e o que faltar vira vazio em vez de
 * derrubar a página. Uma tela que quebra por causa de um campo a menos é uma
 * tela que só funciona no dia da demonstração.
 */

import type {
  AdicionalPlano,
  AvisoPainel,
  Chamado,
  ClientePainel,
  Contrato,
  EnderecoContrato,
  Fatura,
  Indicacao,
  NotaFiscal,
  PainelSnapshot,
  PlanoDisponivel,
  StatusChamado,
  StatusConexao,
  StatusFatura,
  StatusFinanceiro,
  StatusIndicacao,
} from "./painel-tipos";
import type { DadosPainel, ValorJson } from "./cliente-tipos";

type Bruto = Record<string, ValorJson | undefined>;

/* ---------------- leitores tolerantes ---------------- */

function campo(fonte: Bruto, ...nomes: string[]): ValorJson | undefined {
  for (const nome of nomes) {
    const valor = fonte[nome];
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return undefined;
}

function texto(fonte: Bruto, ...nomes: string[]): string {
  const valor = campo(fonte, ...nomes);
  if (typeof valor === "string") return valor.trim();
  if (typeof valor === "number") return String(valor);
  if (typeof valor === "boolean") return valor ? "sim" : "não";
  return "";
}

/**
 * Número em qualquer das formas que um cadastro devolve: 129.9, "129.90",
 * "129,90" ou "R$ 129,90".
 */
function numero(fonte: Bruto, ...nomes: string[]): number {
  const valor = campo(fonte, ...nomes);
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  if (typeof valor !== "string") return 0;

  const limpo = valor.replace(/[^\d,.-]/g, "");
  // "1.234,56" é pt-BR; "1234.56" é o formato de máquina. O que decide é a
  // última pontuação: se for vírgula, ela é o separador decimal.
  const normalizado =
    limpo.lastIndexOf(",") > limpo.lastIndexOf(".")
      ? limpo.replace(/\./g, "").replace(",", ".")
      : limpo.replace(/,/g, "");

  const convertido = Number(normalizado);
  return Number.isFinite(convertido) ? convertido : 0;
}

function inteiro(fonte: Bruto, ...nomes: string[]): number {
  return Math.trunc(numero(fonte, ...nomes));
}

function booleano(fonte: Bruto, ...nomes: string[]): boolean {
  const valor = campo(fonte, ...nomes);
  if (typeof valor === "boolean") return valor;
  if (typeof valor === "number") return valor !== 0;
  if (typeof valor === "string")
    return ["true", "1", "sim", "s", "yes"].includes(valor.trim().toLowerCase());
  return false;
}

function objeto(valor: ValorJson | undefined): Bruto {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Bruto) : {};
}

function lista(fonte: Bruto, ...nomes: string[]): Bruto[] {
  const valor = campo(fonte, ...nomes);
  if (!Array.isArray(valor)) return [];
  return valor.filter((item): item is Record<string, ValorJson> => {
    return !!item && typeof item === "object" && !Array.isArray(item);
  });
}

/** Lista de textos, aceita array ou uma string com itens separados por ";" ou "|". */
function listaDeTextos(fonte: Bruto, ...nomes: string[]): string[] {
  const valor = campo(fonte, ...nomes);
  if (Array.isArray(valor)) {
    return valor.map((v) => (typeof v === "string" ? v.trim() : String(v ?? ""))).filter(Boolean);
  }
  if (typeof valor === "string") {
    return valor
      .split(/[;|]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Encaixa um valor livre numa das opções conhecidas.
 *
 * Aceita as variações usuais (`em dia`, `EM_DIA`, `overdue`) e cai no padrão
 * quando não reconhece — um status desconhecido pinta a tela de neutro, não a
 * derruba.
 */
function opcao<T extends string>(valor: string, mapa: Record<string, T>, padrao: T): T {
  const chave = valor
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  return mapa[chave] ?? padrao;
}

const STATUS_FINANCEIRO: Record<string, StatusFinanceiro> = {
  em_dia: "em_dia",
  emdia: "em_dia",
  ok: "em_dia",
  adimplente: "em_dia",
  pago: "em_dia",
  in_good_standing: "em_dia",
  paga: "em_dia",
  em_aberto: "em_aberto",
  aberto: "em_aberto",
  aberta: "em_aberto",
  pendente: "em_aberto",
  pending_invoice: "em_aberto",
  vencido: "vencido",
  vencida: "vencido",
  atrasado: "vencido",
  inadimplente: "vencido",
  overdue_invoices: "vencido",
};

const STATUS_CONEXAO: Record<string, StatusConexao> = {
  online: "online",
  ativo: "online",
  ativa: "online",
  conectado: "online",
  alerta: "alerta",
  instavel: "alerta",
  degradado: "alerta",
  offline: "offline",
  inativo: "offline",
  suspenso: "offline",
  bloqueado: "offline",
  cancelado: "offline",
  cancelada: "offline",
  encerrado: "offline",
};

const STATUS_FATURA: Record<string, StatusFatura> = {
  pago: "pago",
  paga: "pago",
  liquidado: "pago",
  quitado: "pago",
  aberto: "aberto",
  aberta: "aberto",
  em_aberto: "aberto",
  pendente: "aberto",
  vencido: "vencido",
  vencida: "vencido",
  atrasado: "vencido",
  cancelado: "cancelado",
  cancelada: "cancelado",
};

/*
 * Os quatro primeiros à direita são os valores de `indicacoes_web.status`.
 * "Sem sucesso" e "dados inválidos" caem os dois em `cancelado`: para o
 * cliente, o que interessa é que aquela indicação não vai render bônus — o
 * motivo é assunto de quem opera.
 */
const STATUS_INDICACAO: Record<string, StatusIndicacao> = {
  em_aberto: "pendente",
  pendente: "pendente",
  aguardando: "pendente",
  em_instalacao: "em_instalacao",
  agendado: "em_instalacao",
  instalado: "instalado",
  concluido: "instalado",
  ativo: "instalado",
  sem_sucesso: "cancelado",
  dados_invalidos: "cancelado",
  cancelado: "cancelado",
  recusado: "cancelado",
};

const STATUS_CHAMADO: Record<string, StatusChamado> = {
  aberto: "aberto",
  novo: "aberto",
  em_analise: "em_analise",
  em_andamento: "em_analise",
  agendado: "agendado",
  resolvido: "resolvido",
  fechado: "resolvido",
  concluido: "resolvido",
  cancelado: "cancelado",
};

/* ---------------- normalizadores ---------------- */

function normalizarCliente(fonte: Bruto): ClientePainel {
  const endereco = objeto(campo(fonte, "endereco", "address"));
  const tipo = texto(fonte, "tipo_cadastro", "tipoCadastro", "tipo_pessoa").toLowerCase();

  return {
    id: texto(fonte, "id", "id_cliente", "idCliente", "codigo_cliente"),
    nome: texto(fonte, "nome", "name", "razao_social"),
    documento: texto(fonte, "documento", "cpf_cnpj", "cpfCnpj", "cpf", "cnpj"),
    email: texto(fonte, "email", "e_mail"),
    telefone: texto(fonte, "telefone", "celular", "phone", "fone"),
    codigo: texto(fonte, "codigo", "codigo_cliente", "customerCode", "matricula"),
    clienteDesde: texto(fonte, "cliente_desde", "clienteDesde", "memberSince", "desde"),
    codigoIndicacao: texto(fonte, "codigo_indicacao", "codigoIndicacao", "referralCode"),
    linkIndicacao: texto(fonte, "link_indicacao", "linkIndicacao", "referralLink"),
    descontoAcumulado: numero(
      fonte,
      "desconto_acumulado",
      "descontoAcumulado",
      "discountsAccumulated",
    ),
    nascimento: texto(fonte, "data_nascimento", "nascimento", "dataNascimento", "birthDate"),
    // o cadastro pode mandar "cpf"/"cnpj" ou "fisica"/"juridica"
    tipoCadastro:
      tipo.startsWith("cnpj") || tipo.startsWith("jur")
        ? "cnpj"
        : tipo.startsWith("cpf") || tipo.startsWith("fis")
          ? "cpf"
          : "",
    // o endereço pode vir aninhado ou solto entre os campos do cliente
    endereco: normalizarEndereco(Object.keys(endereco).length > 0 ? endereco : fonte),
    status: texto(fonte, "status_cliente", "statusCliente", "situacao")
      .toLowerCase()
      .startsWith("inativ")
      ? "inativo"
      : "ativo",
  };
}

function normalizarEndereco(fonte: Bruto): EnderecoContrato {
  return {
    cep: texto(fonte, "cep", "zipCode", "zip_code"),
    logradouro: texto(fonte, "logradouro", "rua", "street", "endereco"),
    numero: texto(fonte, "numero", "number"),
    complemento: texto(fonte, "complemento", "complement"),
    bairro: texto(fonte, "bairro", "neighborhood"),
    cidade: texto(fonte, "cidade", "city", "municipio"),
    uf: texto(fonte, "uf", "estado", "state"),
  };
}

function normalizarContrato(fonte: Bruto, indice: number): Contrato {
  const bruto = campo(fonte, "endereco", "address");
  const endereco = objeto(bruto);
  return {
    id: texto(fonte, "id", "id_contrato", "idContrato") || `contrato_${indice + 1}`,
    numero: texto(fonte, "numero", "numero_contrato", "contractNumber", "contrato"),
    apelido: texto(fonte, "apelido", "label", "nome", "descricao") || "Contrato",
    endereco: normalizarEndereco(Object.keys(endereco).length > 0 ? endereco : fonte),
    enderecoTexto: typeof bruto === "string" ? bruto.trim() : "",
    plano: texto(fonte, "plano", "nome_plano", "planName"),
    download: texto(fonte, "download", "velocidade_download", "downloadSpeed", "velocidade"),
    upload: texto(fonte, "upload", "velocidade_upload", "uploadSpeed"),
    valorMensal: numero(
      fonte,
      "valor_mensal",
      "valorMensal",
      "valor",
      "monthlyValue",
      "mensalidade",
    ),
    statusFinanceiro: opcao(
      // `status_fatura` é o nome da coluna em `contratos_web`
      texto(
        fonte,
        "status_financeiro",
        "statusFinanceiro",
        "status_fatura",
        "situacao_financeira",
        "paymentStatus",
      ),
      STATUS_FINANCEIRO,
      "em_dia",
    ),
    statusConexao: opcao(
      // `status_contrato` é o nome da coluna em `contratos_web`
      texto(
        fonte,
        "status_conexao",
        "statusConexao",
        "status_contrato",
        "situacao",
        "connectionStatus",
        "status",
      ),
      STATUS_CONEXAO,
      "online",
    ),
    diaVencimento: inteiro(fonte, "dia_vencimento", "diaVencimento", "dueDay", "vencimento_dia"),
    ssidWifi: texto(fonte, "ssid_wifi", "ssid", "wifiSsid", "rede_wifi"),
    roteador: texto(fonte, "roteador", "modelo_roteador", "routerModel", "equipamento"),
    ip: texto(fonte, "ip", "ip_address", "ipAddress", "endereco_ip"),
    instaladoEm: texto(fonte, "instalado_em", "instaladoEm", "data_instalacao", "installationDate"),
    tecnologia: texto(fonte, "tecnologia", "technology"),
    composicao: listaDeTextos(fonte, "composicao", "itens", "beneficios", "features"),
    adesao: texto(fonte, "data_adesao", "adesao", "dataAdesao", "contratado_em"),
    vigenciaAte: texto(
      fonte,
      "data_vencimento_contrato",
      "vigencia_ate",
      "vigenciaAte",
      "fidelidade_ate",
    ),
  };
}

function normalizarFatura(fonte: Bruto, indice: number): Fatura {
  return {
    id: texto(fonte, "id", "id_fatura", "idFatura") || `fatura_${indice + 1}`,
    idContrato: texto(fonte, "id_contrato", "idContrato", "contractId", "contrato"),
    referencia: texto(fonte, "referencia", "mes_referencia", "referenceMonth", "competencia"),
    vencimento: texto(fonte, "vencimento", "data_vencimento", "dueDate"),
    // o atualizado manda: é ele que o cliente precisa pagar hoje
    valor: numero(fonte, "valor_atual", "valorAtual", "valor", "value", "valor_total"),
    status: opcao(texto(fonte, "status", "situacao", "status_fatura"), STATUS_FATURA, "aberto"),
    linhaDigitavel: texto(fonte, "linha_digitavel", "linhaDigitavel", "codigo_barras", "barcode"),
    pixCopiaECola: texto(fonte, "pix_copia_e_cola", "pixCopiaECola", "pix", "qrcode_pix", "brcode"),
    urlBoleto: texto(fonte, "url_boleto", "urlBoleto", "link_boleto", "boleto_url", "pdf"),
    pagoEm: texto(fonte, "pago_em", "pagoEm", "data_pagamento", "paidAt"),
    /*
     * `valor` é o que se paga hoje; `valor_original` é o de face. Quando só um
     * dos dois vem, os dois valem o mesmo — é o caso da fatura no prazo, em que
     * não há acréscimo nenhum a mostrar.
     */
    valorOriginal:
      campo(fonte, "valor_original", "valorOriginal") !== undefined
        ? numero(fonte, "valor_original", "valorOriginal")
        : numero(fonte, "valor", "valor_atual", "value"),
    descricao: texto(fonte, "descricao", "description", "historico"),
  };
}

function normalizarNotaFiscal(fonte: Bruto, indice: number): NotaFiscal {
  return {
    id: texto(fonte, "id", "id_nota", "idNota") || `nota_${indice + 1}`,
    numero: texto(fonte, "numero", "numero_nota", "invoiceNumber"),
    serie: texto(fonte, "serie", "series"),
    referencia: texto(fonte, "referencia", "mes_referencia", "referenceMonth", "competencia"),
    emitidaEm: texto(fonte, "emitida_em", "emitidaEm", "data_emissao", "issueDate"),
    valor: numero(fonte, "valor", "value"),
    numeroContrato: texto(fonte, "numero_contrato", "numeroContrato", "contractNumber", "contrato"),
    cfop: texto(fonte, "cfop"),
    chaveVerificacao: texto(
      fonte,
      "chave_verificacao",
      "chaveVerificacao",
      "chave",
      "verificationKey",
    ),
    urlDanfe: texto(fonte, "url_danfe", "urlDanfe", "link_nota", "pdf", "url"),
  };
}

function normalizarIndicacao(fonte: Bruto, indice: number): Indicacao {
  const protocolo = texto(fonte, "protocolo", "protocol", "numero_protocolo");
  return {
    id: texto(fonte, "id", "id_indicacao") || protocolo || `indicacao_${indice + 1}`,
    protocolo,
    nome: texto(fonte, "nome", "nome_indicacao", "name", "indicado"),
    telefone: texto(fonte, "telefone", "telefone_indicacao", "celular", "phone"),
    cidade: texto(fonte, "cidade", "city", "municipio"),
    data: texto(fonte, "data", "criado_em", "date", "createdAt"),
    status: opcao(texto(fonte, "status", "situacao"), STATUS_INDICACAO, "pendente"),
    bonus: texto(fonte, "bonus", "descricao_bonus", "descricaoBonus", "tipo_bonus"),
    desconto: numero(
      fonte,
      "desconto",
      "valor_indicacao",
      "valor_desconto",
      "valorIndicacao",
      "discountAmount",
    ),
  };
}

function normalizarChamado(fonte: Bruto, indice: number): Chamado {
  return {
    id: texto(fonte, "id", "id_chamado") || `chamado_${indice + 1}`,
    protocolo: texto(fonte, "protocolo", "protocol", "numero"),
    idContrato: texto(fonte, "id_contrato", "idContrato", "contractId", "contrato"),
    categoria: texto(fonte, "categoria", "category", "tipo"),
    assunto: texto(fonte, "assunto", "subject", "titulo"),
    descricao: texto(fonte, "descricao", "description", "detalhe"),
    status: opcao(texto(fonte, "status", "situacao"), STATUS_CHAMADO, "aberto"),
    abertoEm: texto(fonte, "aberto_em", "abertoEm", "criado_em", "createdAt", "data"),
    agendadoPara: texto(fonte, "agendado_para", "agendadoPara", "scheduledDate", "data_agendada"),
  };
}

function normalizarPlano(fonte: Bruto, indice: number): PlanoDisponivel {
  return {
    id: texto(fonte, "id", "id_plano", "codigo") || `plano_${indice + 1}`,
    nome: texto(fonte, "nome", "name", "plano"),
    download: texto(fonte, "download", "velocidade_download", "velocidade", "speed"),
    upload: texto(fonte, "upload", "velocidade_upload"),
    valor: numero(fonte, "valor", "preco", "price", "valor_mensal"),
    vantagens: listaDeTextos(fonte, "vantagens", "beneficios", "composicao", "features"),
    destaque: booleano(fonte, "destaque", "recomendado", "recommended"),
    selo: texto(fonte, "selo", "badge", "nome_destaque"),
    codigoOfertaMk: texto(fonte, "codigo_oferta_mk", "codigoOfertaMk"),
  };
}

function normalizarAdicional(fonte: Bruto, indice: number): AdicionalPlano {
  return {
    id: texto(fonte, "id", "codigo") || `adicional_${indice + 1}`,
    nome: texto(fonte, "nome", "name", "titulo"),
    descricao: texto(fonte, "descricao", "description"),
    valor: numero(fonte, "valor", "preco", "price"),
  };
}

function normalizarAviso(fonte: Bruto, indice: number): AvisoPainel {
  const tipo = texto(fonte, "tipo", "type").toLowerCase();
  return {
    id: texto(fonte, "id") || `aviso_${indice + 1}`,
    titulo: texto(fonte, "titulo", "title"),
    texto: texto(fonte, "texto", "mensagem", "message", "descricao"),
    tipo:
      tipo === "sucesso" || tipo === "success"
        ? "sucesso"
        : tipo === "alerta" || tipo === "warning"
          ? "alerta"
          : tipo === "erro" || tipo === "error"
            ? "erro"
            : "info",
    data: texto(fonte, "data", "criado_em", "createdAt"),
  };
}

/**
 * Um texto solto da resposta de um formulário — protocolo, PIX copia e cola,
 * data agendada. A tela mostra o que voltou do n8n, e não um valor inventado
 * aqui; quando o campo não vem, ela simplesmente não mostra aquela linha.
 */
export function textoDaResposta(dados: DadosPainel, ...nomes: string[]): string {
  return texto(dados as Bruto, ...nomes);
}

/** Idem, para valores numéricos (velocidade medida, ping, valor calculado). */
export function numeroDaResposta(dados: DadosPainel, ...nomes: string[]): number {
  return numero(dados as Bruto, ...nomes);
}

/* ---------------- entrada pública ---------------- */

const ENDERECO_VAZIO: EnderecoContrato = {
  cep: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairro: "",
  cidade: "",
  uf: "",
};

const VAZIO: ClientePainel = {
  id: "",
  nome: "",
  documento: "",
  email: "",
  telefone: "",
  codigo: "",
  clienteDesde: "",
  codigoIndicacao: "",
  linkIndicacao: "",
  descontoAcumulado: 0,
  nascimento: "",
  tipoCadastro: "",
  endereco: ENDERECO_VAZIO,
  status: "ativo",
};

/**
 * Monta o retrato do painel a partir do que o n8n devolveu.
 *
 * As listas são aceitas tanto no topo (`{ contratos: [...] }`) quanto dentro de
 * um envelope por seção (`{ contratos: { itens: [...] } }`), porque as duas
 * formas saem naturalmente de um fluxo do n8n dependendo de como o nó final é
 * montado.
 */
export function normalizarPainel(dados: DadosPainel): PainelSnapshot {
  const fonte = dados as Bruto;
  const cliente = objeto(campo(fonte, "cliente", "customer", "assinante"));

  return {
    cliente: Object.keys(cliente).length > 0 ? normalizarCliente(cliente) : VAZIO,
    contratos: colecao(fonte, "contratos", "contracts").map(normalizarContrato),
    faturas: colecao(fonte, "faturas", "invoices", "titulos").map(normalizarFatura),
    notasFiscais: colecao(fonte, "notas_fiscais", "notasFiscais", "notas", "taxInvoices").map(
      normalizarNotaFiscal,
    ),
    indicacoes: colecao(fonte, "indicacoes", "referrals").map(normalizarIndicacao),
    chamados: colecao(fonte, "chamados", "tickets", "atendimentos").map(normalizarChamado),
    planos: colecao(fonte, "planos", "planos_disponiveis", "plans").map(normalizarPlano),
    adicionais: colecao(fonte, "adicionais", "servicos_adicionais", "addons").map(
      normalizarAdicional,
    ),
    avisos: colecao(fonte, "avisos", "notificacoes", "notifications").map(normalizarAviso),
    desbloqueioDisponivel: booleano(
      fonte,
      "desbloqueio_disponivel",
      "desbloqueioDisponivel",
      "permite_desbloqueio",
    ),
    atualizadoEm: Date.now(),
  };
}

/** Uma lista, esteja ela solta ou dentro de `{ itens: [...] }`. */
function colecao(fonte: Bruto, ...nomes: string[]): Bruto[] {
  const direta = lista(fonte, ...nomes);
  if (direta.length > 0) return direta;

  const envelope = objeto(campo(fonte, ...nomes));
  return lista(envelope, "itens", "items", "lista", "dados", "data", "registros");
}

/**
 * Aplica ao retrato atual o que veio na resposta de um formulário.
 *
 * A ideia é economizar uma volta: se o n8n já devolve a lista atualizada junto
 * do "ok" — as faturas depois de gerar a segunda via, os chamados depois de
 * abrir um —, a tela usa aquilo na hora, sem uma nova consulta. O que a
 * resposta não trouxer permanece como estava.
 *
 * Aceita as listas no topo da resposta ou dentro de `painel`, porque as duas
 * formas saem naturalmente de um nó do n8n.
 */
export function mesclarPainel(atual: PainelSnapshot, dados: DadosPainel): PainelSnapshot {
  const fonte = dados as Bruto;
  const envelope = objeto(campo(fonte, "painel", "snapshot"));
  const raiz: Bruto = Object.keys(envelope).length > 0 ? envelope : fonte;

  const parcial = normalizarPainel(raiz as DadosPainel);
  const clienteVeio =
    Object.keys(objeto(campo(raiz, "cliente", "customer", "assinante"))).length > 0;

  const trocar = <T>(nova: T[], anterior: T[], ...nomes: string[]): T[] =>
    campo(raiz, ...nomes) !== undefined ? nova : anterior;

  return {
    cliente: clienteVeio ? parcial.cliente : atual.cliente,
    contratos: trocar(parcial.contratos, atual.contratos, "contratos", "contracts"),
    faturas: trocar(parcial.faturas, atual.faturas, "faturas", "invoices", "titulos"),
    notasFiscais: trocar(
      parcial.notasFiscais,
      atual.notasFiscais,
      "notas_fiscais",
      "notasFiscais",
      "notas",
      "taxInvoices",
    ),
    indicacoes: trocar(parcial.indicacoes, atual.indicacoes, "indicacoes", "referrals"),
    chamados: trocar(parcial.chamados, atual.chamados, "chamados", "tickets", "atendimentos"),
    planos: trocar(parcial.planos, atual.planos, "planos", "planos_disponiveis", "plans"),
    adicionais: trocar(
      parcial.adicionais,
      atual.adicionais,
      "adicionais",
      "servicos_adicionais",
      "addons",
    ),
    avisos: trocar(parcial.avisos, atual.avisos, "avisos", "notificacoes", "notifications"),
    desbloqueioDisponivel:
      campo(raiz, "desbloqueio_disponivel", "desbloqueioDisponivel", "permite_desbloqueio") !==
      undefined
        ? parcial.desbloqueioDisponivel
        : atual.desbloqueioDisponivel,
    atualizadoEm: Date.now(),
  };
}

/** A resposta traz alguma parte do painel atualizada? */
export function respostaTrazPainel(dados: DadosPainel): boolean {
  const fonte = dados as Bruto;
  const envelope = objeto(campo(fonte, "painel", "snapshot"));
  const raiz: Bruto = Object.keys(envelope).length > 0 ? envelope : fonte;
  const chaves = [
    "cliente",
    "contratos",
    "faturas",
    "invoices",
    "notas_fiscais",
    "notas",
    "indicacoes",
    "chamados",
    "planos",
    "adicionais",
    "avisos",
  ];
  return chaves.some((chave) => campo(raiz, chave) !== undefined);
}

/** Só a seção pedida, para as recargas parciais. */
export const normalizarSecao = {
  contratos: (dados: DadosPainel) => normalizarPainel(dados).contratos,
  faturas: (dados: DadosPainel) => normalizarPainel(dados).faturas,
  notas_fiscais: (dados: DadosPainel) => normalizarPainel(dados).notasFiscais,
  indicacoes: (dados: DadosPainel) => normalizarPainel(dados).indicacoes,
  chamados: (dados: DadosPainel) => normalizarPainel(dados).chamados,
  planos: (dados: DadosPainel) => normalizarPainel(dados).planos,
};
