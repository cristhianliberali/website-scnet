/**
 * Verificação server-side do reCAPTCHA v3, compartilhada por todos os
 * formulários (lead da home, contratação, login do cliente e painel).
 *
 * Sem RECAPTCHA_SECRET_KEY a verificação é pulada e nada é bloqueado — é o
 * modo de desenvolvimento local. Com a chave configurada, porém, a
 * verificação é obrigatória: uma requisição sem token, ou com token inválido,
 * é REPROVADA. Antes o token era opcional e a ausência dele pulava a
 * verificação inteira, então bastava omitir o campo do JSON para passar —
 * exatamente o que um bot faz.
 *
 * A exceção é o Google estar fora do ar: aí a verificação volta como
 * "unavailable" e o envio segue, porque derrubar todos os formulários por uma
 * oscilação de terceiro é pior que o ataque. O rate limit por IP cobre esse
 * intervalo.
 *
 * ## O que foi corrigido aqui, e por quê
 *
 * Este arquivo recusava clientes de verdade e não dizia por quê. O log era uma
 * linha só ("blocked by reCAPTCHA"), sem motivo e sem score, então as cinco
 * causas possíveis eram indistinguíveis de fora — e quatro delas não têm nada a
 * ver com robô:
 *
 * 1. **Erro de configuração do servidor** (secret errada, vazia, ou de outro
 *    registro). Recusava 100% dos envios, para sempre. Agora é tratado como
 *    verificação INDISPONÍVEL — se a chave não funciona, não existe verificação
 *    nenhuma, e derrubar a loja inteira por um erro de digitação é o pior dos
 *    dois mundos. Um robô não consegue provocar esse erro: ele depende só do
 *    que NÓS mandamos. O log grita e a /diagnostico mostra.
 * 2. **Score baixo.** Um site novo, com pouco tráfego, recebe 0.1–0.3 do Google
 *    para gente real — o modelo ainda não aprendeu o padrão do site. O corte
 *    fixo em 0.3 virava "você é um robô" para clientes legítimos. Agora o corte
 *    é RECAPTCHA_MIN_SCORE, ajustável sem deploy, e 0 desliga o corte por score
 *    mantendo o resto da verificação.
 * 3. **Token vencido** (o v3 vale 2 minutos). Na última etapa da contratação, o
 *    upload dos documentos pode passar disso numa conexão ruim: o cliente
 *    anexava tudo e era chamado de robô no fim. Continua barrado — o token
 *    vencido não prova nada —, mas com a mensagem certa: "expirou, envie de
 *    novo", que é o que resolve.
 * 4. **Hostname.** A comparação era exata, então `www.` do próprio site já
 *    reprovava. Agora subdomínio do mesmo domínio passa.
 * 5. **Sem token.** O navegador não conseguiu rodar o reCAPTCHA (bloqueador de
 *    anúncios, extensão, rede corporativa, Google inalcançável). A mensagem
 *    agora diz isso, em vez de acusar a pessoa.
 *
 * E todo veredito reprovado entra num histórico curto em memória, que a
 * /diagnostico exibe: a pergunta "por que não deixa enviar?" passa a ter
 * resposta em dez segundos, sem terminal e sem log.
 */

import { lerSeguranca } from "./seguranca-db.server";

export type RecaptchaVerdict =
  /** Sem RECAPTCHA_SECRET_KEY: verificação desligada. */
  | { kind: "skipped" }
  /** Google inacessível, ou chave do servidor inválida — não dá para afirmar nada. */
  | { kind: "unavailable"; motivo: string }
  | { kind: "checked"; success: boolean; score: number | undefined; reason?: string };

/** Corte padrão: abaixo disso o Google considera tráfego provavelmente automatizado. */
export const RECAPTCHA_MIN_SCORE_PADRAO = 0.3;

/** Lê um corte de score de um texto, ou `null` quando o texto não serve. */
function corteValido(bruto: string | undefined, origem: string): number | null {
  if (bruto === undefined || bruto.trim() === "") return null;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    console.error(`${origem} inválido (${bruto}); ignorado. Use um número de 0 a 1.`);
    return null;
  }
  return n;
}

/**
 * O corte de score em vigor.
 *
 * Duas fontes, nesta ordem: o que foi definido no `/admin` e, na falta dele,
 * a variável `RECAPTCHA_MIN_SCORE`. O painel vem primeiro porque é o único
 * alcançável por quem está atendendo — a variável exige painel do servidor e
 * reinício do container.
 *
 * O número certo depende do site: o Google calibra por volume, e um provedor
 * regional com poucas visitas recebe score baixo de gente real por meses. 0
 * desliga só o corte por score, mantendo o resto da verificação.
 */
export function minScore(doAdmin?: string): number {
  return (
    corteValido(doAdmin, "Corte de pontuação do /admin") ??
    corteValido(process.env["RECAPTCHA_MIN_SCORE"], "RECAPTCHA_MIN_SCORE") ??
    RECAPTCHA_MIN_SCORE_PADRAO
  );
}

type SiteVerifyResponse = {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

/*
 * Erros que só o NOSSO lado pode causar: a secret não foi enviada, não é uma
 * secret válida, ou o corpo saiu malformado. Nenhum deles depende do visitante,
 * então nenhum deles pode ser provocado por um robô — e por isso é seguro
 * tratá-los como "sem verificação" em vez de "reprovado". O contrário
 * (reprovar) transforma um erro de digitação numa loja fechada.
 */
const ERROS_DE_CONFIGURACAO = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "bad-request",
]);

/** Host do site, usado para recusar token emitido em outra origem. */
function expectedHostname(): string | undefined {
  const siteUrl = import.meta.env["VITE_SITE_URL"] as string | undefined;
  if (!siteUrl) return undefined;
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return undefined;
  }
}

/**
 * Mesmo site?
 *
 * Igualdade exata reprovava `www.contrate.scnet.com.br` contra
 * `contrate.scnet.com.br` — o mesmo site, pela porta da frente. Aceitar um ser
 * subdomínio do outro resolve isso sem abrir a porta: quem decide de verdade
 * quais domínios podem gerar token é a lista de domínios da chave, lá no
 * Google. Esta conferência é a segunda tranca, não a primeira.
 */
function mesmoSite(recebido: string, esperado: string): boolean {
  const a = recebido.toLowerCase();
  const b = esperado.toLowerCase();
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/* ---------------- histórico para a /diagnostico ---------------- */

export type RegistroVeredito = {
  em: string;
  action: string;
  resultado: "reprovado" | "indisponivel";
  motivo: string;
  score: number | null;
  /** O hostname que o Google diz ter emitido o token, quando houve resposta. */
  hostname: string | null;
};

const HISTORICO_MAX = 25;
const historico: RegistroVeredito[] = [];

/**
 * Guarda só o que reprovou ou falhou, e só o que é diagnóstico — nada de IP,
 * documento ou nome. Vive na memória do processo: reiniciar esquece, e nada
 * depende disto para estar correto, só para ser explicável.
 */
function registrar(r: RegistroVeredito): void {
  historico.unshift(r);
  if (historico.length > HISTORICO_MAX) historico.length = HISTORICO_MAX;
}

/** Os últimos vereditos ruins, do mais recente para o mais antigo. */
export const ultimosVereditos = (): RegistroVeredito[] => [...historico];

/**
 * @param token       token gerado pelo cliente (pode vir ausente)
 * @param expectedAction  action com que o token deveria ter sido gerado
 * @param remoteIp    IP do cliente, melhora a pontuação do Google
 */
export async function verifyRecaptcha(
  token: string | undefined,
  expectedAction: string,
  remoteIp?: string | undefined,
): Promise<RecaptchaVerdict> {
  const secret = process.env["RECAPTCHA_SECRET_KEY"];
  if (!secret) return { kind: "skipped" };

  /*
   * O interruptor do /admin, conferido antes de qualquer coisa.
   *
   * É a saída de emergência: quando o reCAPTCHA passa a recusar clientes de
   * verdade por um problema de configuração que só se resolve no painel do
   * Google ou num novo build, desligar por aqui devolve os formulários em dez
   * segundos, sem deploy. O limite por IP continua valendo enquanto isso.
   *
   * A leitura é em cache e só acontece no ENVIO de um formulário, nunca numa
   * visita comum.
   */
  const seguranca = await lerSeguranca();
  if (!seguranca.recaptchaAtivo) return { kind: "skipped" };

  const reprovar = (
    reason: string,
    score: number | undefined,
    hostname?: string | undefined,
  ): RecaptchaVerdict => {
    console.error(
      `reCAPTCHA reprovou ${expectedAction}: ${reason}` +
        (score !== undefined ? ` (score ${score})` : "") +
        (hostname ? ` [hostname ${hostname}]` : ""),
    );
    registrar({
      em: new Date().toISOString(),
      action: expectedAction,
      resultado: "reprovado",
      motivo: reason,
      score: score ?? null,
      hostname: hostname ?? null,
    });
    return { kind: "checked", success: false, score, reason };
  };

  const indisponivel = (motivo: string): RecaptchaVerdict => {
    registrar({
      em: new Date().toISOString(),
      action: expectedAction,
      resultado: "indisponivel",
      motivo,
      score: null,
      hostname: null,
    });
    return { kind: "unavailable", motivo };
  };

  // Chave configurada e nenhum token: é o bypass que precisamos fechar.
  if (!token) return reprovar("missing_token", undefined);

  let data: SiteVerifyResponse;
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        ...(remoteIp && remoteIp !== "unknown" ? { remoteip: remoteIp } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(`reCAPTCHA siteverify respondeu ${res.status}`);
      return indisponivel(`http_${res.status}`);
    }
    data = (await res.json()) as SiteVerifyResponse;
  } catch (err) {
    console.error("reCAPTCHA verification failed", err);
    return indisponivel("google_inacessivel");
  }

  if (data.success !== true) {
    const erros = data["error-codes"] ?? [];
    const configurado = erros.filter((e) => ERROS_DE_CONFIGURACAO.has(e));
    if (configurado.length > 0) {
      // Erro NOSSO. Recusar todo mundo por causa dele fecharia a loja por tempo
      // indeterminado, e sem que ninguém soubesse o motivo — o log e a
      // /diagnostico existem justamente para que este caso seja visto.
      console.error(
        `RECAPTCHA_SECRET_KEY inválida ou ausente (${configurado.join(",")}). ` +
          `A verificação está DESLIGADA na prática até isso ser corrigido: confira a chave SECRETA ` +
          `no painel do reCAPTCHA e lembre que ela precisa ser do MESMO registro da VITE_RECAPTCHA_SITE_KEY.`,
      );
      return indisponivel(configurado.join(","));
    }
    return reprovar(erros.join(",") || "rejected", data.score, data.hostname);
  }

  // Um token válido de outra action (ou de outro site com a mesma chave) não
  // vale para este envio.
  if (data.action !== undefined && data.action !== expectedAction) {
    return reprovar("action_mismatch", data.score, data.hostname);
  }

  const host = expectedHostname();
  if (host && data.hostname !== undefined && !mesmoSite(data.hostname, host)) {
    return reprovar("hostname_mismatch", data.score, data.hostname);
  }

  const corte = minScore(seguranca.minScore);
  if ((data.score ?? 1) < corte) {
    return reprovar(`score_baixo(<${corte})`, data.score, data.hostname);
  }

  return { kind: "checked", success: true, score: data.score };
}

/**
 * `true` quando a verificação rodou e reprovou.
 *
 * O corte por score já foi aplicado dentro de `verifyRecaptcha` — é lá que ele
 * pode ser registrado com o motivo junto. Aqui sobra só a leitura do veredito.
 */
export function isLikelyBot(verdict: RecaptchaVerdict): boolean {
  return verdict.kind === "checked" && !verdict.success;
}

/**
 * O que dizer a quem foi barrado.
 *
 * Cada motivo tem uma saída diferente, e mandar "você não é um robô?" para quem
 * teve o token vencido é pedir que a pessoa desista. A mensagem só existe para
 * dizer o que fazer agora.
 */
export function mensagemRecaptcha(verdict: RecaptchaVerdict): string {
  const motivo = verdict.kind === "checked" ? (verdict.reason ?? "") : "";

  if (motivo === "missing_token") {
    return (
      "Seu navegador não conseguiu carregar a verificação de segurança. " +
      "Desative o bloqueador de anúncios nesta página (ou tente outro navegador) e envie de novo."
    );
  }
  if (motivo.includes("timeout-or-duplicate")) {
    return "A verificação de segurança expirou. Toque em enviar mais uma vez, por favor.";
  }
  if (motivo.startsWith("score_baixo")) {
    return (
      "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo — " +
      "se continuar, chame a gente no WhatsApp que resolvemos por lá."
    );
  }
  return "Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.";
}

/** Score para registrar no webhook, quando houver. */
export function recaptchaScore(verdict: RecaptchaVerdict): number | null {
  return verdict.kind === "checked" ? (verdict.score ?? null) : null;
}
