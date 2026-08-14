/**
 * Verificação server-side do reCAPTCHA v3, compartilhada pelos dois
 * formulários (lead da home e contratação).
 *
 * Sem RECAPTCHA_SECRET_KEY a verificação é pulada e nada é bloqueado — é o
 * modo de desenvolvimento local. Com a chave configurada, porém, a
 * verificação é obrigatória: uma requisição sem token, ou com token inválido,
 * é REPROVADA. Antes o token era opcional e a ausência dele pulava a
 * verificação inteira, então bastava omitir o campo do JSON para passar —
 * exatamente o que um bot faz.
 *
 * A exceção é o Google estar fora do ar: aí a verificação volta como
 * "unavailable" e o envio segue, porque derrubar todos os formulários por uma
 * oscilação de terceiro é pior que o ataque. O rate limit por IP cobre esse
 * intervalo.
 */

export type RecaptchaVerdict =
  /** Sem RECAPTCHA_SECRET_KEY: verificação desligada. */
  | { kind: "skipped" }
  /** Google inacessível — não dá para afirmar nada sobre o cliente. */
  | { kind: "unavailable" }
  | { kind: "checked"; success: boolean; score: number | undefined; reason?: string };

/** Abaixo disso o Google considera tráfego provavelmente automatizado. */
export const RECAPTCHA_MIN_SCORE = 0.3;

type SiteVerifyResponse = {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

/** Host do site, usado para recusar token emitido em outra origem. */
function expectedHostname(): string | undefined {
  const siteUrl = import.meta.env["VITE_SITE_URL"] as string | undefined;
  if (!siteUrl) return undefined;
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return undefined;
  }
}

/**
 * @param token       token gerado pelo cliente (pode vir ausente)
 * @param expectedAction  action com que o token deveria ter sido gerado
 * @param remoteIp    IP do cliente, melhora a pontuação do Google
 */
export async function verifyRecaptcha(
  token: string | undefined,
  expectedAction: string,
  remoteIp?: string | undefined,
): Promise<RecaptchaVerdict> {
  const secret = process.env["RECAPTCHA_SECRET_KEY"];
  if (!secret) return { kind: "skipped" };

  // Chave configurada e nenhum token: é o bypass que precisamos fechar.
  if (!token) {
    return { kind: "checked", success: false, score: undefined, reason: "missing_token" };
  }

  let data: SiteVerifyResponse;
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteIp && remoteIp !== "unknown" ? { remoteip: remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`reCAPTCHA siteverify respondeu ${res.status}`);
      return { kind: "unavailable" };
    }
    data = (await res.json()) as SiteVerifyResponse;
  } catch (err) {
    console.error("reCAPTCHA verification failed", err);
    return { kind: "unavailable" };
  }

  if (data.success !== true) {
    return {
      kind: "checked",
      success: false,
      score: data.score,
      reason: data["error-codes"]?.join(",") ?? "rejected",
    };
  }

  // Um token válido de outra action (ou de outro site com a mesma chave) não
  // vale para este envio.
  if (data.action !== undefined && data.action !== expectedAction) {
    return { kind: "checked", success: false, score: data.score, reason: "action_mismatch" };
  }

  const host = expectedHostname();
  if (host && data.hostname !== undefined && data.hostname !== host) {
    return { kind: "checked", success: false, score: data.score, reason: "hostname_mismatch" };
  }

  return { kind: "checked", success: true, score: data.score };
}

/** `true` quando a verificação rodou e reprovou. */
export function isLikelyBot(verdict: RecaptchaVerdict): boolean {
  if (verdict.kind !== "checked") return false;
  if (!verdict.success) return true;
  return (verdict.score ?? 1) < RECAPTCHA_MIN_SCORE;
}

/** Score para registrar no webhook, quando houver. */
export function recaptchaScore(verdict: RecaptchaVerdict): number | null {
  return verdict.kind === "checked" ? (verdict.score ?? null) : null;
}
