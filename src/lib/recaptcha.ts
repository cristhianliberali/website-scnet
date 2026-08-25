/**
 * O reCAPTCHA v3 do lado do navegador: carrega o script do Google e pede um
 * token antes de cada envio.
 *
 * **Sem token o envio é RECUSADO pelo servidor** (quando RECAPTCHA_SECRET_KEY
 * está configurada). Isto aqui já foi descrito como "o envio nunca trava por
 * causa disto", e não é mais verdade desde que a verificação passou a ser
 * obrigatória: o que acontece de fato é que o navegador que não consegue gerar
 * um token faz o cliente ser barrado do outro lado. Por isso as três correções
 * abaixo — todas sobre não deixar uma falha passageira virar uma porta fechada.
 */

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      execute: (siteKey: string, opts: { action: string }) => Promise<string>;
    };
  }
}

/** Teto para carregar o script e para gerar o token. */
const LIMITE_MS = 10_000;

let scriptPromise: Promise<void> | null = null;

/**
 * Uma promessa que desiste no tempo combinado.
 *
 * Sem isto, um `grecaptcha.execute` que nunca resolve — acontece em rede
 * instável e atrás de proxy corporativo — deixava o botão girando para sempre,
 * sem erro e sem envio. Desistir e seguir com o veredito do servidor é pior do
 * que funcionar, mas é muito melhor do que travar.
 */
function comLimite<T>(p: Promise<T>, ms: number, oQue: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`${oQue}: tempo esgotado`)), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function loadScript(siteKey: string): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = comLimite(
    new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load reCAPTCHA"));
      document.head.appendChild(script);
    }),
    LIMITE_MS,
    "reCAPTCHA (carregamento)",
  );

  /*
   * Uma promessa recusada ficava guardada aqui para sempre: bastava a primeira
   * tentativa falhar — um piscar de rede, o bloqueador de anúncios acordando —
   * para TODAS as tentativas seguintes da mesma aba falharem na hora, sem nem
   * tentar de novo. A única saída era recarregar a página, e ninguém adivinha
   * isso. Esquecendo a falha, o "tente de novo" volta a significar alguma coisa.
   */
  scriptPromise.catch(() => {
    scriptPromise = null;
  });
  return scriptPromise;
}

/**
 * Roda o reCAPTCHA v3 invisível e devolve o token, ou `undefined` quando não há
 * chave configurada (VITE_RECAPTCHA_SITE_KEY) ou o Google não pôde ser
 * alcançado.
 *
 * Atenção ao ler o `undefined`: ele NÃO quer dizer "siga em frente". Se o
 * servidor tiver a chave secreta configurada, o envio sem token é recusado lá —
 * e é justamente esse o caminho que o cliente enxerga como "não deixa enviar".
 * O console diz qual dos dois casos foi.
 */
export async function getRecaptchaToken(action: string): Promise<string | undefined> {
  const siteKey = import.meta.env["VITE_RECAPTCHA_SITE_KEY"] as string | undefined;
  if (!siteKey || typeof window === "undefined") return undefined;
  try {
    await loadScript(siteKey);
    return await comLimite(
      new Promise<string>((resolve, reject) => {
        window.grecaptcha!.ready(() => {
          window.grecaptcha!.execute(siteKey, { action }).then(resolve).catch(reject);
        });
      }),
      LIMITE_MS,
      "reCAPTCHA (token)",
    );
  } catch (err) {
    console.error(
      `reCAPTCHA não gerou token para "${action}". O envio será recusado pelo servidor se a ` +
        `verificação estiver ligada. Causas comuns: bloqueador de anúncios, extensão de ` +
        `privacidade, rede que bloqueia google.com, ou VITE_RECAPTCHA_SITE_KEY sem este domínio ` +
        `na lista do reCAPTCHA.`,
      err,
    );
    return undefined;
  }
}
