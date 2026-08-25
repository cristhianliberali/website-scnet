/**
 * Os eventos que o site anuncia para o Google Tag Manager.
 *
 * ## Como funciona, em uma frase
 *
 * `window.dataLayer` é um array comum. O site empurra objetos nele; o GTM
 * escuta e traduz cada um para o que você configurar lá dentro (uma conversão
 * do Google Ads, um evento do GA4, um pixel). **O site não sabe nada sobre GTM,
 * Ads ou Analytics** — ele só anuncia o que aconteceu, e a tradução é sua, na
 * interface do GTM, sem deploy.
 *
 * ## Por que os nomes moram aqui, e não escritos à mão
 *
 * Um nome de evento é um contrato com o GTM: se o site dispara `contratacao_2`
 * e o gatilho lá espera `contratacao2`, nada acontece — e nada avisa. É o mesmo
 * tipo de falha silenciosa que parou os formulários com a `action` do
 * reCAPTCHA. Aqui os nomes são constantes exportadas: quem dispara importa, e
 * quem lê esta lista sabe exatamente o que configurar no GTM.
 *
 * ## Ordem de carregamento não importa
 *
 * O array é criado na primeira chamada, exista GTM na página ou não. Quando o
 * GTM carrega, ele processa tudo o que já está no array — então um evento
 * disparado antes dele não se perde. E sem GTM nenhum configurado, empurrar num
 * array que ninguém lê não custa nada nem quebra nada.
 */

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

/**
 * Os nomes dos eventos. **Esta lista é o que você configura no GTM.**
 *
 * Os de contratação são numerados (`contratacao_1`...) porque é assim que se lê
 * um funil: quantos passaram de cada etapa. Um evento por etapa CONCLUÍDA, e
 * não por etapa aberta — etapa recusada não dispara, que é justamente o que faz
 * a queda aparecer no relatório.
 */
export const EVENTO = {
  /** Formulário de lead da home enviado com sucesso. */
  leadHome: "lead_form",
  /** Contratação: quem se declarou NOVO cliente. */
  leadNovoCliente: "lead_form_novo_cliente",
  /** Contratação: quem se declarou JÁ CLIENTE — é o que segue para a área do cliente. */
  leadClienteBase: "lead_form_cliente_base",
  /** Última etapa da contratação aceita: a contratação inteira terminou. */
  contratacaoConcluida: "contratacao_concluida",
  /** Clique num botão do site. O parâmetro `botao` diz qual. */
  clique: "clique_botao",
  /** Clique que leva ao WhatsApp. Separado porque costuma ser conversão. */
  cliqueWhatsapp: "clique_whatsapp",
  /** Área do cliente desligada no /admin: quem tentou entrar foi mandado ao WhatsApp. */
  areaClienteDesligada: "area_cliente_desligada",
} as const;

/** `contratacao_1`, `contratacao_2`... a partir do índice da etapa (base 0). */
export const eventoDaEtapa = (indice: number) => `contratacao_${indice + 1}`;

/**
 * Anuncia um evento.
 *
 * Nunca lança: uma falha de medição não pode derrubar um formulário. Se algo
 * der errado aqui, o envio do cliente segue e o erro fica no console.
 */
export function dispararEvento(nome: string, dados: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") return;
  try {
    window.dataLayer = window.dataLayer ?? [];
    window.dataLayer.push({ event: nome, ...dados });
  } catch (err) {
    console.error(`Falha ao anunciar o evento "${nome}"`, err);
  }
}

/**
 * Clique num botão.
 *
 * `botao` é o identificador estável (não muda quando o texto do botão muda) e
 * `texto` é o que estava escrito. Os dois juntos permitem criar o gatilho no
 * GTM pelo identificador e ainda ler o rótulo no relatório.
 */
export function eventoDeClique(
  botao: string,
  extras: { texto?: string; local?: string; destino?: string } & Record<string, unknown> = {},
): void {
  dispararEvento(EVENTO.clique, { botao, ...extras });
}

/** Clique que leva ao WhatsApp — sempre acompanha um `clique_botao`. */
export function eventoWhatsapp(origem: string, extras: Record<string, unknown> = {}): void {
  dispararEvento(EVENTO.cliqueWhatsapp, { origem, ...extras });
}
