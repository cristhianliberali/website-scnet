import { expect, test } from "bun:test";
import { chaveDoIdentificador, classificarIdentificador } from "./supabase.server";

test("reconhece e-mail e normaliza para minúsculas", () => {
  expect(classificarIdentificador("  Voce@Email.COM ")).toEqual({
    tipo: "email",
    email: "voce@email.com",
  });
});

test("recusa texto com @ que não é e-mail", () => {
  expect(classificarIdentificador("voce@email")).toBeNull();
  expect(classificarIdentificador("@")).toBeNull();
});

test("normaliza telefone digitado de qualquer jeito para E.164", () => {
  const esperado = { tipo: "telefone", telefone: "+5549999991234" } as const;
  expect(classificarIdentificador("(49) 99999-1234")).toEqual(esperado);
  expect(classificarIdentificador("49999991234")).toEqual(esperado);
  expect(classificarIdentificador("+55 49 99999-1234")).toEqual(esperado);
  expect(classificarIdentificador("5549999991234")).toEqual(esperado);
});

test("fixo com DDI não vira celular com DDD errado", () => {
  // 12 dígitos são ambíguos; o prefixo 55 desempata, como em nationalPhoneDigits
  expect(classificarIdentificador("554936645652")).toEqual({
    tipo: "telefone",
    telefone: "+554936645652",
  });
  expect(classificarIdentificador("4936645652")).toEqual({
    tipo: "telefone",
    telefone: "+554936645652",
  });
});

test("recusa o que não é e-mail nem telefone", () => {
  expect(classificarIdentificador("")).toBeNull();
  expect(classificarIdentificador("   ")).toBeNull();
  expect(classificarIdentificador("meu-login")).toBeNull();
  expect(classificarIdentificador("123")).toBeNull();
});

test("a chave de tentativas não muda com a pontuação digitada", () => {
  const chave = (v: string) => chaveDoIdentificador(classificarIdentificador(v)!);
  expect(chave("(49) 99999-1234")).toBe(chave("+5549999991234"));
  expect(chave("VOCE@email.com")).toBe(chave("voce@email.com "));
});
