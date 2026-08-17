/**
 * Supabase como provedor de identidade da área do cliente (só servidor).
 *
 * Aqui mora o acesso por **e-mail ou telefone + senha**. O outro caminho de
 * login — documento do cadastro e código por SMS/WhatsApp/e-mail — continua no
 * n8n (`cliente-auth.server.ts`), porque quem conhece o cadastro é o provedor,
 * não o Supabase.
 *
 * Três decisões que valem ser lidas antes de mexer:
 *
 * 1. **O navegador nunca fala com o Supabase.** Tudo passa por server functions,
 *    como já acontece com o webhook. Isso não é só simetria: no EasyPanel o
 *    Supabase fica na rede interna (`http://supabase-kong:8000`), sem porta
 *    publicada, então um cliente Supabase montado no navegador simplesmente não
 *    teria como alcançá-lo. Por isso as variáveis são `SUPABASE_*` e não
 *    `VITE_SUPABASE_*`: nada disso entra no bundle.
 * 2. **Só a `anon key`.** É a chave que os endpoints de autenticação pedem, e é
 *    a menor que resolve. A `service_role` ignora RLS e vale como senha mestra
 *    do banco inteiro — não é necessária para login, então não é configurada.
 * 3. **A sessão continua sendo deste servidor.** O token do Supabase é usado
 *    para conferir a senha e é descartado; quem entra recebe o mesmo cookie
 *    selado do acesso por documento. Um só dono de sessão, uma só forma de sair.
 */

import {
  createClient,
  isAuthRetryableFetchError,
  type SupabaseClient,
} from "@supabase/supabase-js";

/** Uma instância do Supabase parada não pode segurar a requisição do cliente. */
const SUPABASE_TIMEOUT_MS = 10_000;

/** DDI usado ao normalizar telefones — o site atende só o Brasil. */
const DDI_BRASIL = "55";

const ERRO_INDISPONIVEL =
  "A área do cliente está indisponível no momento. Fale com nosso atendimento pelo WhatsApp.";

/* ---------------- configuração ---------------- */

type Config = { url: string; anonKey: string };

function lerConfig(): Config | null {
  const url = process.env["SUPABASE_URL"]?.trim();
  const anonKey = process.env["SUPABASE_ANON_KEY"]?.trim();

  if (!url || !anonKey) {
    console.error(
      `Supabase não configurado — falta ${!url ? "SUPABASE_URL" : "SUPABASE_ANON_KEY"}. ` +
        "O acesso por e-mail/telefone e senha fica recusado.",
    );
    return null;
  }
  return { url, anonKey };
}

/**
 * `fetch` com prazo, para que um Supabase parado não segure a requisição do
 * cliente até o timeout do proxy. O sinal do chamador, quando existe, é somado
 * ao nosso em vez de substituído. O `as typeof fetch` é só por causa do
 * `preconnect` que o tipo do Bun exige e que o supabase-js nunca chama.
 */
const fetchComTimeout = ((input: RequestInfo | URL, init?: RequestInit) => {
  const prazo = AbortSignal.timeout(SUPABASE_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, prazo]) : prazo;
  return fetch(input, { ...init, signal });
}) as typeof fetch;

let cliente: SupabaseClient | null = null;

/**
 * Cliente compartilhado pelo processo. Sem sessão persistida nem refresh
 * automático: aqui ele serve a uma requisição HTTP por vez e não guarda nada
 * entre elas — persistir a sessão num servidor misturaria clientes diferentes.
 */
function supabase(config: Config): SupabaseClient {
  cliente ??= createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchComTimeout },
  });
  return cliente;
}

/* ---------------- identificador ---------------- */

export type Identificador =
  { tipo: "email"; email: string } | { tipo: "telefone"; telefone: string };

/** Suficiente para separar e-mail de telefone; quem valida de verdade é o Supabase. */
const PARECE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Decide se o que foi digitado é e-mail ou telefone e normaliza o telefone para
 * E.164 (`+5549999991234`), que é o formato em que o Supabase guarda o número.
 *
 * O desempate dos 12 dígitos é o mesmo de `nationalPhoneDigits`: um fixo com DDI
 * ("55 49 3664-5652") tem o mesmo tamanho de um celular sem DDI, e é o prefixo
 * 55 que resolve.
 */
export function classificarIdentificador(valor: string): Identificador | null {
  const texto = valor.trim();
  if (!texto) return null;

  if (texto.includes("@")) {
    return PARECE_EMAIL.test(texto) ? { tipo: "email", email: texto.toLowerCase() } : null;
  }

  const digitos = texto.replace(/\D/g, "");
  if (digitos.startsWith(DDI_BRASIL) && (digitos.length === 12 || digitos.length === 13)) {
    return { tipo: "telefone", telefone: `+${digitos}` };
  }
  if (digitos.length === 10 || digitos.length === 11) {
    return { tipo: "telefone", telefone: `+${DDI_BRASIL}${digitos}` };
  }
  return null;
}

/** Chave de contagem de tentativas — o identificador já normalizado. */
export const chaveDoIdentificador = (id: Identificador) =>
  id.tipo === "email" ? id.email : id.telefone;

/* ---------------- leitura do usuário ---------------- */

export type UsuarioSupabase = {
  /** `id` do usuário no Supabase. */
  id: string;
  /** Identificador do cliente no sistema do provedor, quando o cadastro o traz. */
  idCliente: string;
  nome: string;
  /** Documento em dígitos, quando o cadastro o traz. */
  documento: string | undefined;
};

const asString = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/**
 * Lê um campo do usuário preferindo `app_metadata`.
 *
 * A diferença importa: `user_metadata` é gravável pelo próprio usuário (um
 * `updateUser` basta), então nada que venha de lá pode ser tratado como fato —
 * `id_cliente` e `documento` amarram a sessão a um cliente do provedor. Já
 * `app_metadata` só muda pela chave de serviço, ou seja, pelo n8n. A leitura de
 * `user_metadata` fica como último recurso, para não quebrar cadastros feitos à
 * mão no painel do Supabase.
 */
function campo(usuario: { app_metadata?: unknown; user_metadata?: unknown }, ...chaves: string[]) {
  const registro = (v: unknown): Record<string, unknown> =>
    v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

  const app = registro(usuario.app_metadata);
  const user = registro(usuario.user_metadata);
  for (const fonte of [app, user]) {
    for (const chave of chaves) {
      const valor = fonte[chave];
      if (typeof valor === "number") return String(valor);
      const texto = asString(valor);
      if (texto) return texto;
    }
  }
  return undefined;
}

/* ---------------- login ---------------- */

export type LoginSupabase =
  | { ok: true; usuario: UsuarioSupabase }
  | {
      ok: false;
      mensagem: string;
      /** Falha de configuração ou de rede não conta como senha errada. */
      credencial: boolean;
    };

const falha = (mensagem: string, credencial: boolean): LoginSupabase => ({
  ok: false,
  mensagem,
  credencial,
});

/**
 * Mensagens do Supabase traduzidas — o texto original é em inglês e às vezes diz
 * mais do que o cliente precisa saber. `invalid_credentials` responde igual para
 * usuário inexistente e senha errada, e é assim que deve continuar: distinguir
 * os dois casos entrega quem é cliente a quem só sabe testar e-mails.
 */
function mensagemDoErro(code: string | undefined, status: number | undefined): string {
  switch (code) {
    case "email_not_confirmed":
      return "Confirme seu e-mail antes de entrar. Reenviamos a confirmação para a caixa cadastrada.";
    case "phone_not_confirmed":
      return "Confirme seu telefone antes de entrar. Use o acesso por documento para receber um código.";
    case "user_banned":
      return "Este acesso está suspenso. Fale com nosso atendimento pelo WhatsApp.";
    case "over_request_rate_limit":
      return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
    default:
      return status === 429
        ? "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo."
        : "E-mail, telefone ou senha incorretos.";
  }
}

/**
 * Confere a senha no Supabase. O token devolvido não é guardado nem repassado ao
 * navegador: serve só como prova de que a senha confere, e a sessão que vale é a
 * do cookie selado deste servidor.
 */
export async function loginComSenha(
  identificador: Identificador,
  senha: string,
): Promise<LoginSupabase> {
  const config = lerConfig();
  if (!config) return falha(ERRO_INDISPONIVEL, false);

  const credenciais =
    identificador.tipo === "email"
      ? { email: identificador.email, password: senha }
      : { phone: identificador.telefone, password: senha };

  let resposta;
  try {
    resposta = await supabase(config).auth.signInWithPassword(credenciais);
  } catch (err) {
    // rede interna fora do ar, DNS do serviço ou timeout
    console.error("Supabase inacessível na autenticação por senha", err);
    return falha(ERRO_INDISPONIVEL, false);
  }

  const { data, error } = resposta;
  if (error) {
    /*
     * O supabase-js não lança quando não alcança o servidor: devolve um
     * `AuthRetryableFetchError` com `status: 0` no mesmo lugar de uma senha
     * errada. Tratar os dois igual seria errado duas vezes — diria "senha
     * incorreta" a quem digitou a senha certa e ainda gastaria uma das três
     * tentativas de quem não errou nada. Por isso rede e 5xx saem por aqui,
     * com `credencial: false`.
     */
    const indisponivel = isAuthRetryableFetchError(error) || (error.status ?? 0) >= 500;
    console.error(
      `Supabase ${indisponivel ? "indisponível" : "recusou o login"} ` +
        `(${error.code ?? error.status ?? "sem código"})`,
    );
    if (indisponivel) return falha(ERRO_INDISPONIVEL, false);
    return falha(mensagemDoErro(error.code, error.status), true);
  }

  const usuario = data.user;
  if (!usuario) {
    console.error("Supabase aceitou o login sem devolver o usuário");
    return falha(ERRO_INDISPONIVEL, false);
  }

  return {
    ok: true,
    usuario: {
      id: usuario.id,
      // sem `id_cliente` no cadastro, o próprio id do Supabase identifica a sessão
      idCliente: campo(usuario, "id_cliente", "idCliente", "codigo_cliente") ?? usuario.id,
      nome: campo(usuario, "nome", "name", "full_name") ?? "cliente",
      documento: campo(usuario, "documento", "cpf", "cnpj", "cpf_cnpj")?.replace(/\D/g, ""),
    },
  };
}
