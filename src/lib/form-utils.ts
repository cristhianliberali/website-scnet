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
