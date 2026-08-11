/**
 * Verificação server-side do reCAPTCHA v3, compartilhada pelos dois
 * formulários (lead da home e contratação).
 *
 * Sem RECAPTCHA_SECRET_KEY configurada — ou sem token vindo do cliente — a
 * verificação é pulada e devolve `null`, então nada é bloqueado por falta de
 * configuração.
 */

export type RecaptchaResult = { success: boolean; score?: number; action?: string } | null;

/** Abaixo disso o Google considera tráfego provavelmente automatizado. */
export const RECAPTCHA_MIN_SCORE = 0.3;

export async function verifyRecaptcha(token: string | undefined): Promise<RecaptchaResult> {
  const secret = process.env["RECAPTCHA_SECRET_KEY"];
  if (!secret || !token) return null;
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    return (await res.json()) as RecaptchaResult;
  } catch (err) {
    console.error("reCAPTCHA verification failed", err);
    return null;
  }
}

/** `true` só quando a verificação rodou e reprovou — nunca por falta de config. */
export function isLikelyBot(result: RecaptchaResult): boolean {
  return result != null && (result.success === false || (result.score ?? 1) < RECAPTCHA_MIN_SCORE);
}
