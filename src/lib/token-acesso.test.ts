import { expect, test } from "bun:test";
import { lerToken, TOKEN_MAX_SEGUNDOS, TOKEN_PADRAO_SEGUNDOS } from "./token-acesso";

const agora = () => Math.floor(Date.now() / 1000);
/** O relógio anda entre a chamada e a asserção; um segundo de folga basta. */
const perto = (valor: number | undefined, esperado: number) =>
  valor !== undefined && Math.abs(valor - esperado) <= 2;

test("token simples com duração em segundos", () => {
  const t = lerToken({ token: "abc123", expira_em_segundos: 1800 });
  expect(t?.valor).toBe("abc123");
  expect(perto(t?.expiraEm, agora() + 1800)).toBe(true);
});

test("aceita o formato OAuth (access_token + expires_in)", () => {
  const t = lerToken({ access_token: "abc123", expires_in: 900 });
  expect(t?.valor).toBe("abc123");
  expect(perto(t?.expiraEm, agora() + 900)).toBe(true);
});

test("aceita o token aninhado em um objeto", () => {
  const prazo = agora() + 600;
  const t = lerToken({ token: { valor: "abc123", expira_em: prazo } });
  expect(t).toEqual({ valor: "abc123", expiraEm: prazo });
});

test("aceita instante em ISO 8601", () => {
  const prazo = new Date((agora() + 1200) * 1000).toISOString();
  const t = lerToken({ token: "abc123", expira_em: prazo });
  expect(perto(t?.expiraEm, Math.floor(Date.parse(prazo) / 1000))).toBe(true);
});

test("aceita números vindos como string", () => {
  const t = lerToken({ token: "abc123", expira_em_segundos: "1800" });
  expect(perto(t?.expiraEm, agora() + 1800)).toBe(true);
});

test("sem validade declarada, assume o prazo padrão", () => {
  const t = lerToken({ token: "abc123" });
  expect(perto(t?.expiraEm, agora() + TOKEN_PADRAO_SEGUNDOS)).toBe(true);
});

test("corta prazo absurdo no teto", () => {
  // um zero a mais no expires_in não pode virar sessão eterna
  const t = lerToken({ token: "abc123", expires_in: 999_999_999 });
  expect(perto(t?.expiraEm, agora() + TOKEN_MAX_SEGUNDOS)).toBe(true);
});

test("recusa token já vencido", () => {
  expect(lerToken({ token: "abc123", expira_em: agora() - 1 })).toBeUndefined();
  expect(lerToken({ token: "abc123", expira_em_segundos: 0 })).toBeUndefined();
});

test("recusa resposta sem token", () => {
  expect(lerToken({})).toBeUndefined();
  expect(lerToken({ token: "" })).toBeUndefined();
  expect(lerToken({ token: "   " })).toBeUndefined();
  expect(lerToken({ status: "ok", cliente: { nome: "Maria" } })).toBeUndefined();
});

test("a duração ganha do instante quando os dois vêm", () => {
  const t = lerToken({ token: "abc123", expira_em_segundos: 60, expira_em: agora() + 9999 });
  expect(perto(t?.expiraEm, agora() + 60)).toBe(true);
});
