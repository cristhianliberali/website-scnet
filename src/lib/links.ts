/**
 * Para onde os links do cabeçalho e do rodapé levam.
 *
 * **O problema que este arquivo resolve.** Quase todo link do menu era uma
 * âncora seca — `#planos`, `#duvidas`, `#top`. Âncora só funciona na página que
 * tem aquela seção: clicar em "Planos" a partir de `/cliente/painel` ou de
 * `/contratacao` não levava a lugar nenhum, só carimbava `#planos` no fim da
 * URL. E `#top` era o destino de tudo que ainda não tinha destino ("Trabalhe
 * conosco", "App SCNET", as redes sociais), o que dá no mesmo que um link
 * morto, com a diferença de parecer vivo.
 *
 * **Três tipos de destino, e cada um sabe se comportar:**
 *
 * - **Seção da home** (`hash`): vira `/#planos`. Com a barra na frente ele é um
 *   endereço de verdade — funciona de qualquer página do site, e de dentro do
 *   painel do cliente também.
 * - **Rota interna** (`to`): navega pelo roteador, sem recarregar a página.
 * - **Fora do site** (`href`): abre em aba nova. Vem de variável de ambiente e,
 *   **quando a variável está vazia, o link não é exibido** — um item de menu que
 *   não leva a lugar nenhum é pior do que a ausência dele.
 *
 * **O domínio.** `VITE_SITE_URL` é a mesma variável que já assina o canonical e
 * o `og:url`. `urlDoSite()` monta um endereço absoluto a partir dela, para os
 * lugares onde um caminho relativo não serve — um e-mail, um QR code, um link
 * que sai do site e precisa voltar. Sem a variável, o caminho relativo continua
 * valendo, e é por isso que o site funciona igual em produção e em preview.
 *
 * As variáveis são `VITE_*`: elas entram no bundle em tempo de BUILD, então no
 * EasyPanel precisam estar também nos Build Args. Cada uma é lida pelo nome
 * literal — o Vite substitui `import.meta.env.VITE_X` no texto, e uma leitura
 * dinâmica (`env[nome]`) chegaria vazia no navegador.
 */

const limpar = (valor: string | undefined) => valor?.trim().replace(/\/$/, "") ?? "";

/** O domínio do site, sem barra no fim. Vazio quando a variável não foi definida. */
export const SITE_URL = limpar(import.meta.env["VITE_SITE_URL"] as string | undefined);

/**
 * Um caminho do site como endereço absoluto.
 *
 * `urlDoSite("/cliente")` → `https://contrate.scnet.com.br/cliente`. Sem
 * `VITE_SITE_URL`, devolve o próprio caminho: em desenvolvimento e em preview
 * o relativo é o que funciona.
 */
export function urlDoSite(caminho = "/"): string {
  const path = caminho.startsWith("/") ? caminho : `/${caminho}`;
  return SITE_URL ? `${SITE_URL}${path}` : path;
}

/** Endereço absoluto de uma seção da home: `urlDaSecao("planos")`. */
export const urlDaSecao = (secao: string) => urlDoSite(`/#${secao}`);

/*
 * Os endereços que ficam fora deste site. Cada um é opcional: sem a variável,
 * o item some do menu em vez de virar um link morto.
 */
const externos = {
  trabalheConosco: limpar(import.meta.env["VITE_URL_TRABALHE_CONOSCO"] as string | undefined),
  contratos: limpar(import.meta.env["VITE_URL_CONTRATOS"] as string | undefined),
  app: limpar(import.meta.env["VITE_URL_APP"] as string | undefined),
  instagram: limpar(import.meta.env["VITE_URL_INSTAGRAM"] as string | undefined),
  facebook: limpar(import.meta.env["VITE_URL_FACEBOOK"] as string | undefined),
  youtube: limpar(import.meta.env["VITE_URL_YOUTUBE"] as string | undefined),
};

export type ItemDeMenu = {
  rotulo: string;
  /** Seção da home. Vira `/#hash`, que funciona de qualquer página. */
  hash?: string;
  /** Rota interna, navegada pelo roteador. */
  to?: string;
  /** Busca da rota — `{ servico: "segunda_via" }` abre o serviço direto. */
  search?: Record<string, string>;
  /** Endereço fora do site. Vazio faz o item sumir. */
  href?: string;
  /** Descrição para leitor de tela, quando o rótulo é só uma letra ou ícone. */
  titulo?: string;
};

/** Tira do menu o que não leva a lugar nenhum. */
const comDestino = (itens: ItemDeMenu[]) => itens.filter((i) => i.hash ?? i.to ?? i.href);

/* ---------------- cabeçalho ---------------- */

export const MENU_SOLUCOES: ItemDeMenu[] = [
  { rotulo: "Para mim", hash: "planos" },
  { rotulo: "Para minha empresa", hash: "empresas" },
  { rotulo: "Condomínios", hash: "empresas" },
  { rotulo: "Internet rural", hash: "planos" },
];

export const MENU_PRINCIPAL: ItemDeMenu[] = [
  { rotulo: "Planos", hash: "planos" },
  { rotulo: "Depoimentos", hash: "depoimentos" },
  { rotulo: "Dúvidas", hash: "duvidas" },
];

/** O menu do celular é o de cima, aberto: sem submenu que precise de hover. */
export const MENU_CELULAR: ItemDeMenu[] = [
  { rotulo: "Planos", hash: "planos" },
  ...MENU_SOLUCOES.slice(1),
  { rotulo: "Depoimentos", hash: "depoimentos" },
  { rotulo: "Dúvidas", hash: "duvidas" },
  { rotulo: "Área do cliente", to: "/cliente" },
];

/* ---------------- rodapé ---------------- */

/**
 * "Segunda via fatura" aponta para o serviço direto, e não para a home do
 * painel: quem tem sessão cai na segunda via; quem não tem é levado ao login
 * pela própria rota. Os dois caminhos terminam onde a pessoa queria chegar.
 */
export const MENU_RODAPE: ItemDeMenu[] = comDestino([
  { rotulo: "Planos", hash: "planos" },
  { rotulo: "Empresas", hash: "empresas" },
  { rotulo: "Trabalhe conosco", href: externos.trabalheConosco },
  { rotulo: "FAQ", hash: "duvidas" },
  { rotulo: "Contratos e Regulamentos", href: externos.contratos },
  { rotulo: "Área do cliente", to: "/cliente" },
  { rotulo: "App SCNET", href: externos.app },
  { rotulo: "Segunda via fatura", to: "/cliente/painel", search: { servico: "segunda_via" } },
]);

export const REDES_SOCIAIS: ItemDeMenu[] = comDestino([
  { rotulo: "I", titulo: "Instagram", href: externos.instagram },
  { rotulo: "F", titulo: "Facebook", href: externos.facebook },
  { rotulo: "Y", titulo: "YouTube", href: externos.youtube },
]);
