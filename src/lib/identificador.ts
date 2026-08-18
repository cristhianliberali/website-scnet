/**
 * E-mail ou telefone: quem o cliente diz ser no login por senha.
 *
 * Arquivo puro, sem import de runtime, porque o valor normalizado serve a duas
 * coisas que vivem em lugares diferentes: o que é enviado ao n8n e a chave da
 * contagem de tentativas.
 */

/** DDI usado ao normalizar telefones — o site atende só o Brasil. */
const DDI_BRASIL = "55";

export type Identificador =
  { tipo: "email"; email: string } | { tipo: "telefone"; telefone: string };

/** Suficiente para separar e-mail de telefone; quem valida de verdade é o n8n. */
const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Decide se o que foi digitado é e-mail ou telefone e normaliza o telefone para
 * E.164 (`+5549999991234`).
 *
 * O desempate dos 12 dígitos é o mesmo de `nationalPhoneDigits`: um fixo com DDI
 * ("55 49 3664-5652") tem o mesmo tamanho de um celular sem DDI, e é o prefixo
 * 55 que resolve.
 */
export function classificarIdentificador(valor: string): Identificador | null {
  const texto = valor.trim();
  if (!texto) return null;

  if (texto.includes("@")) {
    return PARECE_EMAIL.test(texto) ? { tipo: "email", email: texto.toLowerCase() } : null;
  }

  const digitos = texto.replace(/\D/g, "");
  if (digitos.startsWith(DDI_BRASIL) && (digitos.length === 12 || digitos.length === 13)) {
    return { tipo: "telefone", telefone: `+${digitos}` };
  }
  if (digitos.length === 10 || digitos.length === 11) {
    return { tipo: "telefone", telefone: `+${DDI_BRASIL}${digitos}` };
  }
  return null;
}

/**
 * O valor normalizado, usado como chave de tentativas e enviado ao n8n.
 *
 * Normalizar antes de contar é o que impede reiniciar o contador de três falhas
 * só variando a pontuação: `(49) 99999-1234` e `+5549999991234` dão a mesma chave.
 */
export const valorDoIdentificador = (id: Identificador) =>
  id.tipo === "email" ? id.email : id.telefone;
