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

/** Loads Meta's base Pixel snippet and fires PageView. No-op without VITE_FACEBOOK_PIXEL_ID. */
export function initFacebookPixel() {
  const pixelId = import.meta.env["VITE_FACEBOOK_PIXEL_ID"] as string | undefined;
  if (!pixelId || typeof window === "undefined" || initialized) return;
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

  window.fbq("init", pixelId);
  window.fbq("track", "PageView");
}

export function trackLeadEvent() {
  window.fbq?.("track", "Lead");
}

function readCookie(name: string): string | undefined {
  return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];
}

/** _fbc/_fbp are set by the Pixel itself; forwarded to the server for Conversions API dedup. */
export function getFacebookCookies(): { fbc: string | undefined; fbp: string | undefined } {
  if (typeof document === "undefined") return { fbc: undefined, fbp: undefined };
  return { fbc: readCookie("_fbc"), fbp: readCookie("_fbp") };
}
