declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadScript(siteKey: string): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load reCAPTCHA"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Runs invisible reCAPTCHA v3 and returns a verification token, or undefined
 * if no site key is configured (VITE_RECAPTCHA_SITE_KEY) or it fails to
 * load — form submission never blocks on this.
 */
export async function getRecaptchaToken(action: string): Promise<string | undefined> {
  const siteKey = import.meta.env["VITE_RECAPTCHA_SITE_KEY"] as string | undefined;
  if (!siteKey || typeof window === "undefined") return undefined;
  try {
    await loadScript(siteKey);
    return await new Promise<string>((resolve, reject) => {
      window.grecaptcha!.ready(() => {
        window.grecaptcha!.execute(siteKey, { action }).then(resolve).catch(reject);
      });
    });
  } catch (err) {
    console.error("reCAPTCHA unavailable", err);
    return undefined;
  }
}
