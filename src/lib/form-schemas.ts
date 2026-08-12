/**
 * Limites e saneamento compartilhados pelos schemas dos dois formulários.
 *
 * Todo campo que vai ao webhook precisa de um teto de tamanho: sem isso, um
 * POST direto na server function pode despejar megabytes de texto arbitrário
 * dentro do fluxo do n8n.
 */

import { z } from "zod";
import { TRACKED_PARAMS } from "./utm";

export const MAX_DADOS_JSON_BYTES = 64_000;

/** Campos extras que `AttributionData` carrega além dos parâmetros de UTM. */
const ATTRIBUTION_EXTRA_KEYS = [
  "referrer",
  "landing_page",
  "first_visit_at",
  "last_visit_at",
  "last_page",
] as const;

const ATTRIBUTION_KEYS = [...TRACKED_PARAMS, ...ATTRIBUTION_EXTRA_KEYS];

/**
 * Atribuição só com as chaves conhecidas, cada valor limitado. O objeto vem do
 * localStorage do visitante, ou seja, é totalmente controlado pelo cliente —
 * antes qualquer chave de qualquer tamanho era repassada ao n8n.
 */
export const attributionSchema = z.record(z.string().max(300).optional()).transform((value) => {
  const clean: Record<string, string> = {};
  for (const key of ATTRIBUTION_KEYS) {
    const entry = value[key];
    if (entry) clean[key] = entry;
  }
  return clean;
});

/**
 * Nomes: letras (com acento), espaço, apóstrofo e hífen — o mesmo conjunto que
 * `capitalizeName` já aplica no cliente. Também elimina, de graça, texto
 * iniciado por `=`/`+`/`@`, que viraria fórmula se o n8n gravar em planilha.
 */
export const NAME_RE = /^[\p{L}][\p{L}\s'’-]*$/u;

/**
 * Texto livre (observação, campos de endereço) que segue para o n8n.
 * Um valor começando com `=`, `+`, `-`, `@`, tab ou CR é interpretado como
 * fórmula por Excel/Google Sheets ao abrir um CSV exportado; o apóstrofo à
 * frente neutraliza sem perder o conteúdo original.
 */
export function neutralizeFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Aplica `neutralizeFormula` recursivamente nas strings de `dados`. */
export function neutralizeDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return null;
  if (typeof value === "string") return neutralizeFormula(value);
  if (Array.isArray(value)) return value.map((item) => neutralizeDeep(item, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      // Chaves de prototype nunca são dado legítimo do formulário.
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      out[key] = neutralizeDeep(entry, depth + 1);
    }
    return out;
  }
  return value;
}

/** `dados` mantém o formato livre que o n8n espera, mas com teto de tamanho. */
export const dadosSchema = z.record(z.unknown()).refine(
  (value) => {
    try {
      return JSON.stringify(value).length <= MAX_DADOS_JSON_BYTES;
    } catch {
      return false;
    }
  },
  { message: "dados excede o tamanho permitido" },
);
