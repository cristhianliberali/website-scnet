/**
 * A Conversions API do Meta (Facebook/Instagram Ads), do lado do servidor.
 *
 * ## Por que existe, além do Pixel
 *
 * O Pixel roda no navegador e é a primeira coisa que um bloqueador de anúncios
 * ou o iOS derruba. A Conversions API manda o MESMO evento do servidor, com os
 * dados da pessoa em hash — e é isso que faz o Meta reconhecer quem converteu e
 * otimizar a campanha para gente parecida. Quanto mais campos de `user_data`
 * chegam, maior a "qualidade de correspondência" no Gerenciador de Eventos, e
 * menor o custo por lead.
 *
 * ## Deduplicação
 *
 * O navegador e o servidor mandam o mesmo evento com o mesmo `event_id`. O Meta
 * fica com um só — sem isso cada lead contaria duas vezes, e o relatório da
 * campanha mentiria para cima. O id nasce no navegador (`gerarEventId` em
 * `facebook-pixel.ts`) e viaja no envio do formulário até aqui.
 *
 * ## O que sai daqui
 *
 * - `Lead` — o formulário "Contrate agora" da home e da /leads, para quem
 *   marcou "Quero contratar".
 * - `Contact` — o mesmo formulário, para quem marcou "Já sou cliente". Não é
 *   lead de venda, e mandá-lo como `Lead` ensinaria o Meta a procurar quem já é
 *   cliente.
 * - `InitiateCheckout` — a etapa 1 da /contratacao (plano escolhido) aceita.
 * - `Purchase` — a última etapa da /contratacao aceita, com o valor do plano.
 *
 * Nada aqui lança: falha de medição não pode derrubar um envio. Sem
 * `VITE_FACEBOOK_PIXEL_ID` ou `FACEBOOK_CAPI_ACCESS_TOKEN` a função é um no-op.
 *
 * Referência de normalização: https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters
 */

import { createHash } from "node:crypto";
import { SITE_URL } from "./links";

export type MetaEventName = "Lead" | "Contact" | "InitiateCheckout" | "Purchase";

/** Os dados da pessoa, como o formulário os tem — a normalização e o hash são daqui. */
export type MetaUsuario = {
  /** Qualquer formato: "(49) 99999-9999", "+5549999999999". Sem DDI assume o Brasil. */
  telefone?: string | null | undefined;
  email?: string | null | undefined;
  /** Nome completo — vira `fn` (primeiro nome) e `ln` (último sobrenome). */
  nome?: string | null | undefined;
  /** "AAAA-MM-DD" (o `<input type="date">`). */
  nascimento?: string | null | undefined;
  cidade?: string | null | undefined;
  uf?: string | null | undefined;
  cep?: string | null | undefined;
  /** Identificador estável da pessoa (o CPF, em dígitos). Vai em hash. */
  externalId?: string | null | undefined;
  /** Cookies que o próprio Pixel grava; o navegador os manda no envio. */
  fbc?: string | null | undefined;
  fbp?: string | null | undefined;
  /** O `fbclid` da URL do anúncio, guardado na atribuição: reconstrói o `fbc` quando o cookie não existe. */
  fbclid?: string | null | undefined;
  /** Quando o `fbclid` foi visto (ISO) — entra no `fbc` reconstruído. */
  fbclidEm?: string | null | undefined;
  ip?: string | null | undefined;
  userAgent?: string | null | undefined;
};

export type MetaEvento = {
  nome: MetaEventName;
  /** O mesmo id que o Pixel usou no navegador. Sem ele não há deduplicação. */
  eventId?: string | null | undefined;
  /** Caminho + query da página (o `page` dos formulários) ou uma URL absoluta. */
  pagina: string;
  /** Endereço por onde a requisição chegou — completa `pagina` quando VITE_SITE_URL está vazia. */
  origem?: string | undefined;
  usuario: MetaUsuario;
  /** `custom_data`: valor, plano, UTMs... */
  dados?: Record<string, unknown> | undefined;
  /** Segundos desde a época. Padrão: agora. */
  tempo?: number | undefined;
};

/* ---------------- normalização ---------------- */

const semAcento = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function hashMeta(valor: string): string {
  return createHash("sha256").update(valor).digest("hex");
}

/** Só dígitos, com DDI: "(49) 99999-9999" → "5549999999999". */
export function normalizarTelefone(valor: string | null | undefined): string | undefined {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (!digitos) return undefined;
  // DDD + 8 ou 9 dígitos, sem país: é o formato nacional dos nossos formulários.
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if (digitos.length < 8 || digitos.length > 15) return undefined;
  return digitos;
}

export function normalizarEmail(valor: string | null | undefined): string | undefined {
  const email = (valor ?? "").trim().toLowerCase();
  return email.includes("@") ? email : undefined;
}

/** Minúsculo, sem acento, sem pontuação — é assim que o Meta compara nomes. */
function normalizarPalavra(valor: string): string {
  return semAcento(valor)
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Primeiro nome e último sobrenome de um nome completo. */
export function normalizarNome(valor: string | null | undefined): {
  fn: string | undefined;
  ln: string | undefined;
} {
  const partes = (valor ?? "").trim().split(/\s+/).map(normalizarPalavra).filter(Boolean);
  const fn = partes[0];
  const ln = partes.length > 1 ? partes[partes.length - 1] : undefined;
  return { fn, ln };
}

/** "1990-05-20" → "19900520". */
export function normalizarNascimento(valor: string | null | undefined): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((valor ?? "").trim());
  return m ? `${m[1]}${m[2]}${m[3]}` : undefined;
}

/** "São Miguel do Oeste" → "saomigueldooeste". */
export function normalizarCidade(valor: string | null | undefined): string | undefined {
  const cidade = semAcento(valor ?? "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return cidade || undefined;
}

export function normalizarUf(valor: string | null | undefined): string | undefined {
  const uf = (valor ?? "").trim().toLowerCase();
  return /^[a-z]{2}$/.test(uf) ? uf : undefined;
}

/** CEP só em dígitos: "89800-000" → "89800000". */
export function normalizarCep(valor: string | null | undefined): string | undefined {
  const cep = (valor ?? "").replace(/\D/g, "");
  return cep.length === 8 ? cep : undefined;
}

/**
 * O `fbc` que o Pixel gravaria, montado a partir do `fbclid` da URL do anúncio.
 *
 * O cookie `_fbc` só existe quando o Pixel carregou no clique — bloqueador de
 * anúncios e navegador com rastreamento restrito o deixam vazio. O `fbclid`,
 * porém, está na URL e a atribuição do site o guarda; o Meta documenta o formato
 * `fb.1.<timestamp_ms>.<fbclid>` justamente para este caso.
 */
export function fbcDoFbclid(
  fbclid: string | null | undefined,
  quando?: string | null | undefined,
): string | undefined {
  const id = (fbclid ?? "").trim();
  if (!id) return undefined;
  const ms = quando ? Date.parse(quando) : NaN;
  const timestamp = Number.isFinite(ms) ? ms : Date.now();
  return `fb.1.${timestamp}.${id}`;
}

/**
 * A URL absoluta da página do evento. O formulário manda só o caminho com a
 * query (`/leads?utm_source=...`); o Meta pede o endereço inteiro.
 */
export function urlDoEvento(pagina: string, origem?: string | undefined): string {
  if (/^https?:\/\//i.test(pagina)) return pagina;
  const base = (SITE_URL || origem || "").replace(/\/$/, "");
  const caminho = pagina.startsWith("/") ? pagina : `/${pagina}`;
  return `${base}${caminho}`;
}

/* ---------------- montagem ---------------- */

type UserData = Record<string, string | string[] | undefined>;

const hashLista = (valor: string | undefined) => (valor ? [hashMeta(valor)] : undefined);

/** `user_data` do evento, cada campo normalizado e em hash como o Meta exige. */
export function montarUserData(usuario: MetaUsuario): UserData {
  const { fn, ln } = normalizarNome(usuario.nome);
  const fbc = usuario.fbc?.trim() || fbcDoFbclid(usuario.fbclid, usuario.fbclidEm);
  const cidade = normalizarCidade(usuario.cidade);
  const uf = normalizarUf(usuario.uf);
  const externalId = (usuario.externalId ?? "").replace(/\D/g, "");

  const dados: UserData = {
    em: hashLista(normalizarEmail(usuario.email)),
    ph: hashLista(normalizarTelefone(usuario.telefone)),
    fn: hashLista(fn),
    ln: hashLista(ln),
    db: hashLista(normalizarNascimento(usuario.nascimento)),
    ct: hashLista(cidade),
    st: hashLista(uf),
    zp: hashLista(normalizarCep(usuario.cep)),
    // Todo formulário do site é de endereço brasileiro; o país melhora a
    // correspondência sem custar um campo a mais para a pessoa.
    country: cidade || uf || normalizarCep(usuario.cep) ? [hashMeta("br")] : undefined,
    external_id: externalId ? [hashMeta(externalId)] : undefined,
    fbc,
    fbp: usuario.fbp?.trim() || undefined,
    client_ip_address: usuario.ip && usuario.ip !== "unknown" ? usuario.ip : undefined,
    client_user_agent: usuario.userAgent?.trim() || undefined,
  };

  for (const chave of Object.keys(dados)) if (dados[chave] === undefined) delete dados[chave];
  return dados;
}

/** Tira os `undefined`/`null` do `custom_data` — o Meta recusa `null` em campos numéricos. */
function limparDados(dados: Record<string, unknown> | undefined): Record<string, unknown> {
  const limpo: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(dados ?? {})) {
    if (valor === undefined || valor === null || valor === "") continue;
    limpo[chave] = valor;
  }
  return limpo;
}

/** O item de `data[]` do POST, pronto. Puro, para o teste conferir o formato. */
export function montarEvento(evento: MetaEvento): Record<string, unknown> {
  const dados = limparDados(evento.dados);
  return {
    event_name: evento.nome,
    event_time: evento.tempo ?? Math.floor(Date.now() / 1000),
    action_source: "website",
    event_source_url: urlDoEvento(evento.pagina, evento.origem),
    ...(evento.eventId ? { event_id: evento.eventId } : {}),
    user_data: montarUserData(evento.usuario),
    ...(Object.keys(dados).length ? { custom_data: dados } : {}),
  };
}

/* ---------------- envio ---------------- */

const GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 8_000;

/** A CAPI está configurada? (o que a /diagnostico mostra) */
export function capiConfigurada(): boolean {
  return Boolean(
    (import.meta.env["VITE_FACEBOOK_PIXEL_ID"] as string | undefined)?.trim() &&
    process.env["FACEBOOK_CAPI_ACCESS_TOKEN"]?.trim(),
  );
}

/**
 * Envia um evento. Nunca lança e nunca segura o envio do formulário por mais
 * do que o timeout — o webhook já respondeu quando chegamos aqui.
 */
export async function enviarEventoMeta(evento: MetaEvento): Promise<void> {
  const pixelId = (import.meta.env["VITE_FACEBOOK_PIXEL_ID"] as string | undefined)?.trim();
  const accessToken = process.env["FACEBOOK_CAPI_ACCESS_TOKEN"]?.trim();
  if (!pixelId || !accessToken) return;

  // O código da aba "Testar eventos" do Gerenciador de Eventos: com ele
  // definido, o evento aparece lá na hora, sem esperar o relatório.
  const testEventCode = process.env["FACEBOOK_CAPI_TEST_EVENT_CODE"]?.trim();

  const corpo = {
    data: [montarEvento(evento)],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const texto = await res.text().catch(() => "");
      console.error(`Meta CAPI (${evento.nome}) respondeu ${res.status}: ${texto.slice(0, 500)}`);
    }
  } catch (err) {
    console.error(`Meta CAPI (${evento.nome}): falha na requisição`, err);
  }
}
