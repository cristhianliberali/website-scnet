/**
 * WhatsApp de atendimento — número e links.
 *
 * O número vem de VITE_WHATSAPP_NUMBER, no formato só-dígitos com DDI:
 * `554936645652`. Por ser VITE_*, é inlinado no bundle em tempo de build
 * (no EasyPanel precisa estar também nos Build Args).
 */

const FALLBACK_NUMBER = "5549999999999";

export const WHATSAPP_NUMBER =
  (import.meta.env["VITE_WHATSAPP_NUMBER"] as string | undefined)?.replace(/\D/g, "") ||
  FALLBACK_NUMBER;

/**
 * O WhatsApp da CENTRAL de atendimento, de VITE_WHATSAPP_NUMBER_CENTRAL.
 *
 * É outro número porque é outro assunto: o `WHATSAPP_NUMBER` é comercial (quem
 * quer contratar) e este é suporte a quem JÁ é cliente. Quando a área do
 * cliente está desligada no /admin, é para cá que quem tentou entrar é levado —
 * mandar um cliente com problema de fatura para o time de vendas seria pior do
 * que não mandar.
 *
 * Vazia, cai no número comercial: um link para a central que não existe seria
 * pior do que o número errado.
 */
export const WHATSAPP_CENTRAL =
  (import.meta.env["VITE_WHATSAPP_NUMBER_CENTRAL"] as string | undefined)?.replace(/\D/g, "") ||
  WHATSAPP_NUMBER;

export function waLink(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

/** Link para a central de atendimento (clientes). */
export function waLinkCentral(message: string) {
  return `https://wa.me/${WHATSAPP_CENTRAL}?text=${encodeURIComponent(message)}`;
}

/** Mensagem usada quando um formulário falha e o cliente é levado ao atendimento. */
export const WHATSAPP_SUPPORT_MESSAGE = "Vim do Website e preciso de atendimento";

export const whatsappSupportLink = () => waLink(WHATSAPP_SUPPORT_MESSAGE);

/** Tempo para o cliente ler o erro antes de ser levado ao WhatsApp. */
export const WHATSAPP_REDIRECT_DELAY_MS = 2500;

/**
 * Leva o cliente ao atendimento depois de um erro de formulário. Usa
 * `location.href` (e não `window.open`) porque a chamada acontece depois de
 * um await — um popup nesse ponto seria bloqueado pelo navegador.
 */
export function redirectToWhatsAppSupport() {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.location.href = whatsappSupportLink();
  }, WHATSAPP_REDIRECT_DELAY_MS);
}
