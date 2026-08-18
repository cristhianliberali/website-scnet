/**
 * Tipos compartilhados da área do cliente.
 *
 * Vivem num arquivo sem nenhum import de runtime porque o formulário (código de
 * navegador) e os módulos `.server.ts` precisam dos mesmos tipos, e o bundle do
 * cliente recusa qualquer coisa que venha de `@tanstack/react-start/server`.
 */

export type CanalCodigo = "sms" | "whatsapp" | "email";

export type CanaisDisponiveis = { sms: boolean; whatsapp: boolean; email: boolean };

/** Contatos já mascarados — o valor completo nunca chega ao navegador. */
export type ContatosMascarados = { celular?: string | undefined; email?: string | undefined };

/**
 * Por onde o cliente entrou: `documento` é o código enviado pelo n8n,
 * `senha` é o e-mail/telefone + senha. Os dois são conferidos pelo n8n.
 */
export type MetodoAcesso = "documento" | "senha";

/**
 * Token de acesso emitido pelo n8n no login.
 *
 * É o que autoriza as consultas e os formulários do painel: sem ele o n8n não
 * responde nada sobre o cliente. Fica guardado no cookie selado deste servidor
 * e **nunca chega ao navegador** — se chegasse, um XSS na página bastaria para
 * roubá-lo e falar com o n8n direto, sem passar por nada daqui.
 */
export type TokenAcesso = {
  valor: string;
  /** Epoch em segundos. Passou disso, a sessão acabou. */
  expiraEm: number;
};

export type SessaoCliente = {
  idCliente: string;
  nome: string;
  metodo: MetodoAcesso;
  token: TokenAcesso;
  /** Mascarado, só para exibição — ausente quando o cadastro não traz o documento. */
  documento?: string | undefined;
  /** E-mail ou telefone mascarado de quem entrou por senha. */
  contato?: string | undefined;
};

/** O que a tela pode saber da sessão: tudo menos o token. */
export type SessaoPublica = Omit<SessaoCliente, "token">;

export type DesafioCliente = {
  idCliente: string;
  /** Só dígitos — reenviado ao webhook nas etapas seguintes. */
  documento: string;
  canais: CanaisDisponiveis;
  contatos: ContatosMascarados;
  canalEscolhido?: CanalCodigo | undefined;
  /** Códigos errados já digitados neste desafio. */
  tentativas: number;
};

/* ---------------- respostas devolvidas ao formulário ---------------- */

export type LoginErro = { ok: false; mensagem: string };

export type EtapaDocumentoOk = {
  ok: true;
  mensagem?: string | undefined;
  canais: CanaisDisponiveis;
  contatos: ContatosMascarados;
};

export type LoginConcluido = { ok: true; mensagem?: string | undefined; nome: string };

export type MensagemOk = { ok: true; mensagem?: string | undefined };

/**
 * Um valor que sobrevive à ida para o navegador.
 *
 * `unknown` não serve aqui: as server functions do TanStack Start recusam, em
 * tempo de compilação, devolver o que não sabem serializar. Como a resposta do
 * n8n é JSON, descrever o formato é mais honesto do que forçar a barra.
 */
export type ValorJson = string | number | boolean | null | ValorJson[] | { [k: string]: ValorJson };

export type DadosPainel = { [k: string]: ValorJson };

/** Resposta de uma consulta ou formulário do painel, já autenticada pelo token. */
export type PainelOk = {
  ok: true;
  mensagem?: string | undefined;
  dados: DadosPainel;
};

/**
 * `expirado` distingue "o token morreu, mande o cliente ao login" de um erro
 * qualquer — sem isso a tela não teria como saber que precisa reautenticar.
 */
export type PainelErro = { ok: false; mensagem: string; expirado?: boolean | undefined };
