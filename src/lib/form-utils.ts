const onlyDigits = (v: string) => v.replace(/\D/g, "");

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

/* ---------------- documentos ---------------- */

export type TipoDocumento = "cpf" | "cnpj";

export function maskCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function isValidCpf(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function maskCnpj(v: string) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function isValidCnpj(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  // pesos do módulo 11: 5..2 seguido de 9..2, um dígito por vez
  const calc = (len: number) => {
    let sum = 0;
    let weight = len - 7;
    for (let i = 0; i < len; i++) {
      sum += Number(d[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function maskDocumento(v: string, tipo: TipoDocumento) {
  return tipo === "cpf" ? maskCpf(v) : maskCnpj(v);
}

export function isValidDocumento(v: string, tipo: TipoDocumento) {
  return tipo === "cpf" ? isValidCpf(v) : isValidCnpj(v);
}
