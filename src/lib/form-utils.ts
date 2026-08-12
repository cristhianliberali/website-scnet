export function capitalizeName(v: string) {
  return v
    .replace(/[^A-Za-zÀ-ÿ\s']/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/(^|\s)([a-zà-ÿ])/g, (_m, s, c: string) => s + c.toUpperCase());
}

export function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidPhone(phone: string) {
  return /^\d{2}9?\d{8}$/.test(phone.replace(/\D/g, ""));
}

/**
 * Extrai o número nacional (DDD + 8 ou 9 dígitos) de um WhatsApp com DDI,
 * como o "+554936645652" que vem do formulário de lead.
 *
 * Cortar simplesmente os últimos 11 dígitos quebrava os fixos: "+55 49
 * 3664-5652" tem 12 dígitos e virava "(54) 93664-5652" — um dígito do DDI
 * entrava no DDD e o número ganhava um nono dígito que não existe. Por
 * estrutura, 12 dígitos são ambíguos (fixo com DDI ou celular sem), então o
 * desempate é o DDI 55, que é o que nossos formulários emitem.
 */
export function nationalPhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  if (digits.length === 10 || digits.length === 11) return digits;
  return digits.slice(-11);
}
