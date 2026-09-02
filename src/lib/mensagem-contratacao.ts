/**
 * A mensagem que o cliente leva para o WhatsApp ao sair do formulário.
 *
 * O botão "Continuar no WhatsApp" existe para o caso em que a pessoa prefere
 * terminar conversando — e o que faz esse caminho valer alguma coisa é a
 * conversa começar com tudo o que ela já digitou. Sem isso, o atendente recebe
 * um "oi" e pede de novo, campo a campo, o que a pessoa acabou de preencher.
 *
 * Os anexos ficam de fora: um link `wa.me` só carrega texto. Quando há arquivo
 * escolhido, a mensagem diz o que a pessoa tem em mãos, para o atendente saber
 * o que pedir.
 *
 * É uma função pura de propósito — a mensagem é o produto do formulário, e
 * conferir o texto que sai daqui não pode depender de abrir um navegador.
 */

type Campo = readonly [rotulo: string, valor: string | null | undefined];

export type ResumoContratacao = {
  /** Nome e telefone informados na home (ou na etapa 1 de /contratacao). */
  lead: { nome: string; telefone: string };
  plano: { nome: string; preco: string; posDesconto?: string | null } | null;
  endereco: {
    tipo: string;
    cep: string;
    cidade: string;
    bairro: string;
    logradouro: string;
    numero: string;
    complemento: string;
    condominio: string;
  };
  cadastro: {
    nome: string;
    cpf: string;
    nascimento: string;
    email: string;
    telefone2: string;
  };
  agendamento: { data: string; periodo: string; observacao: string };
  /**
   * Já com os rótulos que o cliente leu na tela ("Débito em conta", "Sicredi"),
   * e não os códigos: quem recebe a mensagem é um atendente, não o n8n.
   */
  pagamento: { metodo: string; banco: string; agencia: string; conta: string };
  /** Rótulos dos documentos já escolhidos — os arquivos não vão, só a menção. */
  anexos: string[];
};

/** `2026-09-10` vira `10/09/2026`; qualquer outra coisa volta como veio. */
function dataBr(valor: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor.split("-").reverse().join("/") : valor;
}

const TIPOS: Record<string, string> = { casa: "Casa", apartamento: "Apartamento" };
const PERIODOS: Record<string, string> = {
  manha: "Manhã (08h às 12h)",
  tarde: "Tarde (13h às 18h)",
};

/**
 * Um bloco da mensagem. Campo em branco não vira linha, e seção sem nenhuma
 * linha não vira bloco — quem parou no meio do formulário manda o que tem, sem
 * uma lista de "Cidade:" vazios.
 */
function secao(titulo: string, campos: readonly Campo[]): string | null {
  const linhas = campos
    .map(([rotulo, valor]) => [rotulo, valor?.trim() ?? ""] as const)
    .filter(([, valor]) => valor !== "")
    .map(([rotulo, valor]) => `${rotulo}: ${valor}`);
  return linhas.length ? [`*${titulo}*`, ...linhas].join("\n") : null;
}

/** "o comprovante de residência e o documento com foto" */
function lista(itens: string[]): string {
  return itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}` : (itens[0] ?? "");
}

export function mensagemContratacao(resumo: ResumoContratacao): string {
  const { lead, plano, endereco, cadastro, agendamento, pagamento, anexos } = resumo;
  const nome = cadastro.nome.trim() || lead.nome.trim();

  const blocos = [
    nome
      ? `Olá! Sou ${nome} e preenchi o formulário de contratação no site.`
      : "Olá! Preenchi o formulário de contratação no site.",

    plano &&
      secao("Plano escolhido", [
        ["Plano", plano.nome],
        ["Valor", plano.preco ? `R$ ${plano.preco}/mês` : null],
        ["Promoção", plano.posDesconto],
      ]),

    secao("Endereço da instalação", [
      ["Tipo", TIPOS[endereco.tipo] ?? endereco.tipo],
      ["CEP", endereco.cep],
      ["Logradouro", endereco.logradouro],
      ["Número", endereco.numero],
      ["Complemento", endereco.complemento],
      ["Condomínio", endereco.condominio],
      ["Bairro", endereco.bairro],
      ["Cidade", endereco.cidade],
    ]),

    secao("Meus dados", [
      ["Nome", cadastro.nome],
      ["CPF", cadastro.cpf],
      ["Nascimento", dataBr(cadastro.nascimento)],
      ["E-mail", cadastro.email],
      ["Telefone", lead.telefone],
      ["2° telefone", cadastro.telefone2],
    ]),

    /*
     * "Pré-agendamento", e não "agendamento": a ordem de serviço só é garantida
     * depois da assinatura digital do contrato. É o mesmo aviso que a última
     * etapa do formulário mostra — a conversa no WhatsApp não pode prometer
     * mais do que a tela prometeu.
     */
    secao("PRÉ-AGENDAMENTO (Essa data será confirmada após assinatura do contrato)", [
      ["Data", dataBr(agendamento.data)],
      ["Período", PERIODOS[agendamento.periodo] ?? agendamento.periodo],
      ["Observação", agendamento.observacao],
    ]),

    secao("Forma de pagamento", [
      ["Método", pagamento.metodo],
      ["Banco", pagamento.banco],
      ["Agência", pagamento.agencia],
      ["Conta", pagamento.conta],
    ]),

    // Os arquivos não cabem num link do WhatsApp — o atendente pede na conversa.
    anexos.length ? `Já tenho ${lista(anexos)} em mãos para enviar por aqui.` : null,
  ];

  return blocos.filter((bloco): bloco is string => Boolean(bloco)).join("\n\n");
}
