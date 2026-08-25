/**
 * O que estes testes protegem: as recusas que NÃO são robô.
 *
 * Cada caso aqui é uma forma de o formulário parar de enviar para um cliente de
 * verdade — e todas já aconteceram ou estavam a um erro de digitação de
 * acontecer. Um teste que passa a reprovar de novo é uma loja fechada.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { normalizarSeguranca } from "./seguranca-db.server";
import {
  isLikelyBot,
  mensagemRecaptcha,
  minScore,
  ultimosVereditos,
  verifyRecaptcha,
  RECAPTCHA_MIN_SCORE_PADRAO,
} from "./verify-recaptcha";

const fetchOriginal = globalThis.fetch;

/** Responde no lugar do siteverify do Google. */
function responderGoogle(body: unknown, ok = true) {
  globalThis.fetch = (async () =>
    ({
      ok,
      status: ok ? 200 : 500,
      json: async () => body,
    }) as unknown as Response) as unknown as typeof fetch;
}

beforeEach(() => {
  process.env["RECAPTCHA_SECRET_KEY"] = "segredo-de-teste";
  delete process.env["RECAPTCHA_MIN_SCORE"];
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env["RECAPTCHA_SECRET_KEY"];
  delete process.env["RECAPTCHA_MIN_SCORE"];
});

describe("verificação desligada", () => {
  test("sem RECAPTCHA_SECRET_KEY nada é bloqueado", async () => {
    delete process.env["RECAPTCHA_SECRET_KEY"];
    const v = await verifyRecaptcha(undefined, "lead_submit");
    expect(v.kind).toBe("skipped");
    expect(isLikelyBot(v)).toBe(false);
  });
});

describe("erro de configuração do servidor", () => {
  test("secret inválida NÃO reprova o cliente — a verificação é que está quebrada", async () => {
    // Se a chave secreta não funciona, não existe verificação nenhuma. Reprovar
    // aqui fecharia o site inteiro por um erro que é nosso, não do visitante.
    responderGoogle({ success: false, "error-codes": ["invalid-input-secret"] });
    const v = await verifyRecaptcha("token-qualquer", "lead_submit");
    expect(v.kind).toBe("unavailable");
    expect(isLikelyBot(v)).toBe(false);
  });

  test("token forjado continua sendo reprovado", async () => {
    // O contraponto do teste acima: `invalid-input-response` depende do que o
    // VISITANTE mandou, então um robô poderia provocá-lo de propósito para
    // desligar a verificação. Continua barrado.
    responderGoogle({ success: false, "error-codes": ["invalid-input-response"] });
    const v = await verifyRecaptcha("token-forjado", "lead_submit");
    expect(isLikelyBot(v)).toBe(true);
  });
});

describe("corte por score", () => {
  test("score baixo reprova com o corte padrão", async () => {
    responderGoogle({ success: true, score: 0.1, action: "lead_submit" });
    expect(isLikelyBot(await verifyRecaptcha("t", "lead_submit"))).toBe(true);
  });

  test("RECAPTCHA_MIN_SCORE baixa o corte sem novo build", async () => {
    process.env["RECAPTCHA_MIN_SCORE"] = "0.1";
    responderGoogle({ success: true, score: 0.1, action: "lead_submit" });
    expect(isLikelyBot(await verifyRecaptcha("t", "lead_submit"))).toBe(false);
  });

  test("RECAPTCHA_MIN_SCORE=0 desliga só o corte por score", async () => {
    process.env["RECAPTCHA_MIN_SCORE"] = "0";
    responderGoogle({ success: true, score: 0, action: "lead_submit" });
    expect(isLikelyBot(await verifyRecaptcha("t", "lead_submit"))).toBe(false);

    // ...e o resto da verificação continua valendo.
    responderGoogle({ success: false, "error-codes": ["invalid-input-response"] });
    expect(isLikelyBot(await verifyRecaptcha("t", "lead_submit"))).toBe(true);
  });

  test("valor inválido cai no padrão em vez de deixar tudo passar", () => {
    process.env["RECAPTCHA_MIN_SCORE"] = "muito";
    expect(minScore()).toBe(RECAPTCHA_MIN_SCORE_PADRAO);
    process.env["RECAPTCHA_MIN_SCORE"] = "7";
    expect(minScore()).toBe(RECAPTCHA_MIN_SCORE_PADRAO);
  });

  test("o corte do /admin vence a variável de ambiente", () => {
    // O painel é o único alcançável por quem está atendendo; a variável exige
    // acesso ao servidor e reinício. Quem pode agir precisa mandar.
    process.env["RECAPTCHA_MIN_SCORE"] = "0.9";
    expect(minScore("0.1")).toBe(0.1);
    expect(minScore("0")).toBe(0);
  });

  test("corte vazio ou inválido no /admin cai na variável, não no padrão", () => {
    process.env["RECAPTCHA_MIN_SCORE"] = "0.7";
    expect(minScore("")).toBe(0.7);
    expect(minScore("abc")).toBe(0.7);
  });
});

describe("interruptor do /admin", () => {
  test("só um `false` explícito desliga — lixo na coluna mantém a proteção", () => {
    expect(normalizarSeguranca(null).recaptchaAtivo).toBe(true);
    expect(normalizarSeguranca({}).recaptchaAtivo).toBe(true);
    expect(normalizarSeguranca({ recaptcha_ativo: "nao" }).recaptchaAtivo).toBe(true);
    expect(normalizarSeguranca({ recaptcha_ativo: null }).recaptchaAtivo).toBe(true);
    expect(normalizarSeguranca({ recaptcha_ativo: false }).recaptchaAtivo).toBe(false);
  });

  test("o corte guardado volta como texto limpo", () => {
    expect(normalizarSeguranca({ min_score: " 0.1 " }).minScore).toBe("0.1");
    expect(normalizarSeguranca({ min_score: 0.1 }).minScore).toBe("");
  });
});

describe("action e hostname", () => {
  test("token de outra action não vale para este envio", async () => {
    responderGoogle({ success: true, score: 0.9, action: "outra_coisa" });
    expect(isLikelyBot(await verifyRecaptcha("t", "lead_submit"))).toBe(true);
  });

  test("token sem token é reprovado com motivo próprio", async () => {
    const v = await verifyRecaptcha(undefined, "lead_submit");
    expect(isLikelyBot(v)).toBe(true);
    expect(mensagemRecaptcha(v)).toContain("bloqueador de anúncios");
  });
});

describe("mensagem para quem foi barrado", () => {
  test("token vencido diz o que fazer, em vez de acusar de robô", async () => {
    responderGoogle({ success: false, "error-codes": ["timeout-or-duplicate"] });
    const v = await verifyRecaptcha("t", "contratacao_anexos_agendamento");
    expect(isLikelyBot(v)).toBe(true);
    expect(mensagemRecaptcha(v)).toContain("expirou");
    expect(mensagemRecaptcha(v)).not.toContain("robô");
  });

  test("score baixo oferece o WhatsApp como saída", async () => {
    responderGoogle({ success: true, score: 0.1, action: "lead_submit" });
    expect(mensagemRecaptcha(await verifyRecaptcha("t", "lead_submit"))).toContain("WhatsApp");
  });
});

describe("histórico da /diagnostico", () => {
  test("a recusa fica registrada com motivo e score, e sem dado pessoal", async () => {
    responderGoogle({ success: true, score: 0.2, action: "lead_submit", hostname: "scnet.com.br" });
    await verifyRecaptcha("t", "lead_submit", "203.0.113.7");

    const ultimo = ultimosVereditos()[0];
    expect(ultimo?.motivo).toContain("score_baixo");
    expect(ultimo?.score).toBe(0.2);
    expect(ultimo?.hostname).toBe("scnet.com.br");
    // O IP entrou na consulta ao Google, mas não pode ficar guardado aqui.
    expect(JSON.stringify(ultimo)).not.toContain("203.0.113.7");
  });
});
