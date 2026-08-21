import { expect, test } from "bun:test";

/*
 * O regex que decide se o n8n recusou o evento por não saber roteá-lo. Ele
 * mora em `cliente-auth.server.ts`, que só carrega dentro de um request do
 * TanStack Start — então a regra é repetida aqui, e este teste existe
 * justamente para travar o formato das mensagens que precisam casar.
 */
const EVENTO_RECUSADO = /n[ãa]o\s+reconhecid|evento\s+desconhecid|unknown\s+event/i;

test("reconhece a recusa do workflow do n8n", () => {
  // a frase exata do nó "Evento desconhecido" do workflow que está no ar
  expect(EVENTO_RECUSADO.test("Evento não reconhecido.")).toBe(true);
  expect(EVENTO_RECUSADO.test("evento nao reconhecido")).toBe(true);
  expect(EVENTO_RECUSADO.test("Evento desconhecido")).toBe(true);
  expect(EVENTO_RECUSADO.test("Unknown event")).toBe(true);
});

test("não confunde com erro de negócio nem de credencial", () => {
  expect(EVENTO_RECUSADO.test("Fatura não encontrada.")).toBe(false);
  expect(EVENTO_RECUSADO.test("Login ou senha incorretos.")).toBe(false);
  expect(EVENTO_RECUSADO.test("Token inválido")).toBe(false);
  expect(EVENTO_RECUSADO.test("")).toBe(false);
});
