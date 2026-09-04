/**
 * O Pixel do Meta no navegador.
 *
 * Cada evento sai daqui com um `eventID`, e o MESMO id segue no envio do
 * formulário para a Conversions API (`meta-capi.server.ts`) mandar o evento de
 * novo, do servidor, com os dados da pessoa em hash. O Meta junta os dois pelo
 * id: o do navegador pode ser bloqueado, o do servidor sempre chega, e nenhum
 * lead é contado duas vezes.
 */

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: unknown;
  }
}

let initialized = false;

const pixelId = () => (import.meta.env["VITE_FACEBOOK_PIXEL_ID"] as string | undefined)?.trim();

/** Loads Meta's base Pixel snippet and fires PageView. No-op without VITE_FACEBOOK_PIXEL_ID. */
export function initFacebookPixel() {
  const id = pixelId();
  if (!id || typeof window === "undefined" || initialized) return;
  initialized = true;

  if (!window.fbq) {
    const fbq: Fbq = (...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    };
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    document.head.appendChild(script);
  }

  window.fbq("init", id);
  window.fbq("track", "PageView");
}

/**
 * PageView nas navegações dentro do site.
 *
 * O site é uma SPA: ir da home para a /contratacao não recarrega a página, e o
 * Pixel só dispara PageView sozinho no carregamento. Sem isto, a /contratacao
 * (e a /leads, quando se chega nela por link interno) não existiria para o
 * Meta, e o funil do Gerenciador de Eventos pararia na home.
 */
export function trackPageView() {
  if (!initialized) return;
  window.fbq?.("track", "PageView");
}

/** Um id de evento novo, para o Pixel e a CAPI deduplicarem. */
export function gerarEventId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

export type PixelEventName = "Lead" | "Contact" | "InitiateCheckout" | "Purchase";

/** Os parâmetros padrão do Meta que os nossos eventos usam. */
export type PixelParams = {
  content_name?: string | undefined;
  content_ids?: string[] | undefined;
  content_type?: string | undefined;
  content_category?: string | undefined;
  value?: number | undefined;
  currency?: string | undefined;
  num_items?: number | undefined;
} & Record<string, unknown>;

/**
 * Dispara um evento padrão com `eventID`. Nunca lança — medição quebrada não
 * pode derrubar um formulário.
 */
export function trackPixelEvent(nome: PixelEventName, params: PixelParams = {}, eventId?: string) {
  if (typeof window === "undefined") return;
  try {
    const limpos: Record<string, unknown> = {};
    for (const [chave, valor] of Object.entries(params)) {
      if (valor !== undefined && valor !== null && valor !== "") limpos[chave] = valor;
    }
    if (eventId) window.fbq?.("track", nome, limpos, { eventID: eventId });
    else window.fbq?.("track", nome, limpos);
  } catch (err) {
    console.error(`Pixel: falha ao disparar ${nome}`, err);
  }
}

function readCookie(name: string): string | undefined {
  return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];
}

/** _fbc/_fbp are set by the Pixel itself; forwarded to the server for Conversions API matching. */
export function getFacebookCookies(): { fbc: string | undefined; fbp: string | undefined } {
  if (typeof document === "undefined") return { fbc: undefined, fbp: undefined };
  return { fbc: readCookie("_fbc"), fbp: readCookie("_fbp") };
}
