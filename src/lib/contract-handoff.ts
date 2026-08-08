/**
 * Carries the contract-form fields (nome/whatsapp/plano/preco/intenção) over
 * to /contratacao. The URL query string is the primary channel (visible,
 * shareable, survives a full page load); this cookie is a short-lived
 * backup read only if a param is missing from the URL.
 */

export type ContractHandoff = {
  nome?: string | undefined;
  whatsapp?: string | undefined;
  plano?: string | undefined;
  preco?: string | undefined;
  intencao?: string | undefined;
};

const COOKIE_NAME = "scnet_contratacao";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24; // 1 day — just a handoff, not long-term attribution

export function writeContractHandoffCookie(data: ContractHandoff) {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(data))}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  } catch {
    // Cookies disabled — the URL query string still carries the data.
  }
}

export function readContractHandoffCookie(): ContractHandoff {
  if (typeof document === "undefined") return {};
  const value = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))?.[1];
  if (!value) return {};
  try {
    return JSON.parse(decodeURIComponent(value)) as ContractHandoff;
  } catch {
    return {};
  }
}
