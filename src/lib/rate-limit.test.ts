import { beforeEach, expect, test } from "bun:test";
import {
  RATE_LIMIT_BLOCK_MS,
  RATE_LIMIT_MAX_HITS,
  checkRateLimit,
  clientIpFromHeaders,
  resetRateLimit,
} from "./rate-limit";

beforeEach(() => resetRateLimit());

test("permite exatamente 15 envios por minuto", () => {
  for (let i = 0; i < RATE_LIMIT_MAX_HITS; i++) {
    expect(checkRateLimit("1.2.3.4").allowed).toBe(true);
  }
  expect(checkRateLimit("1.2.3.4").allowed).toBe(false);
});

test("o 16o envio dispara bloqueio de 5 minutos", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < RATE_LIMIT_MAX_HITS; i++) checkRateLimit("5.5.5.5", t0 + i);

  const blocked = checkRateLimit("5.5.5.5", t0 + RATE_LIMIT_MAX_HITS);
  expect(blocked.allowed).toBe(false);
  expect(blocked.retryAfterSeconds).toBe(300);

  expect(checkRateLimit("5.5.5.5", t0 + RATE_LIMIT_BLOCK_MS - 10).allowed).toBe(false);
  expect(checkRateLimit("5.5.5.5", t0 + RATE_LIMIT_BLOCK_MS + 100).allowed).toBe(true);
});

test("tentativas durante a punicao nao renovam o bloqueio", () => {
  const t0 = 2_000_000;
  for (let i = 0; i < 16; i++) checkRateLimit("6.6.6.6", t0 + i);
  for (let i = 0; i < 50; i++) checkRateLimit("6.6.6.6", t0 + 1_000 + i);
  expect(checkRateLimit("6.6.6.6", t0 + RATE_LIMIT_BLOCK_MS + 100).allowed).toBe(true);
});

test("a janela desliza conforme os envios envelhecem", () => {
  const t0 = 3_000_000;
  for (let i = 0; i < RATE_LIMIT_MAX_HITS; i++) checkRateLimit("7.7.7.7", t0 + i);
  expect(checkRateLimit("7.7.7.7", t0 + 61_000).allowed).toBe(true);
});

test("cada IP tem seu proprio contador", () => {
  for (let i = 0; i < 16; i++) checkRateLimit("8.8.8.8");
  expect(checkRateLimit("8.8.8.8").allowed).toBe(false);
  expect(checkRateLimit("9.9.9.9").allowed).toBe(true);
});

test("extrai e normaliza o IP dos headers do proxy", () => {
  expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
    "203.0.113.7",
  );
  expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "::ffff:203.0.113.7" }))).toBe(
    "203.0.113.7",
  );
  expect(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
  expect(clientIpFromHeaders(new Headers())).toBe("unknown");
});
