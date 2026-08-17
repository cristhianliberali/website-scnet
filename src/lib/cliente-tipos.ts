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
 * `senha` é o e-mail/telefone + senha conferidos no Supabase.
 */
export type MetodoAcesso = "documento" | "senha";

export type SessaoCliente = {
  idCliente: string;
  nome: string;
  metodo: MetodoAcesso;
  /** Mascarado, só para exibição — ausente quando o cadastro não traz o documento. */
  documento?: string | undefined;
  /** E-mail ou telefone mascarado de quem entrou por senha. */
  contato?: string | undefined;
  /** `id` do usuário no Supabase, quando o acesso veio por senha. */
  idSupabase?: string | undefined;
};

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
