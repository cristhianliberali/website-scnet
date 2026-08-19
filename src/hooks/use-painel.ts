/**
 * O painel do lado do navegador: uma consulta de abertura, um cache e um
 * envio de formulário.
 *
 * **Como o carregamento funciona.** Logo depois do login sai *uma* chamada,
 * `secao: "bootstrap"`, que traz o painel inteiro — cliente, contratos,
 * faturas, notas, indicações, chamados e planos. Uma ida ao n8n em vez de sete
 * é a diferença entre a tela aparecer pronta e a tela aparecer aos pedaços.
 *
 * **Onde o resultado fica.** Em dois lugares, de propósito:
 *
 * 1. No TanStack Query, aqui no navegador, por 5 minutos. É o que faz abrir e
 *    fechar modais, navegar entre abas e voltar de outra página não custarem
 *    nada.
 * 2. Na memória do servidor (`painel-cache.server.ts`), por 60 segundos. É o
 *    que faz um F5 — que joga fora o cache do navegador inteiro — não virar
 *    outra ida ao n8n.
 *
 * **Como sai de moda.** Todo formulário que muda alguma coisa derruba no
 * servidor as seções que ele afeta e atualiza o retrato daqui. Se a resposta
 * do formulário já vier com as listas novas, elas entram direto no cache e
 * nem chega a haver uma segunda chamada; se não vier, a próxima leitura
 * recarrega. O botão "Atualizar" da tela passa por cima dos dois caches.
 */

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { consultarPainel, enviarFormularioPainel } from "@/lib/cliente-auth";
import { mesclarPainel, normalizarPainel, respostaTrazPainel } from "@/lib/painel-normalizar";
import { getRecaptchaToken } from "@/lib/recaptcha";
import type { DadosPainel } from "@/lib/cliente-tipos";
import { SECOES_AFETADAS, type FormularioPainel, type PainelSnapshot } from "@/lib/painel-tipos";

export const CHAVE_PAINEL = ["cliente", "painel"] as const;

const CINCO_MINUTOS = 5 * 60 * 1000;
const MEIA_HORA = 30 * 60 * 1000;

/**
 * A sessão morreu no meio do caminho.
 *
 * Precisa ser um erro distinto porque a reação é outra: erro de rede pede
 * "tente de novo", sessão expirada pede login. A tela olha o `expirado` para
 * decidir.
 */
export class SessaoExpiradaError extends Error {
  readonly expirado = true;
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "SessaoExpiradaError";
  }
}

async function carregarBootstrap(forcar: boolean): Promise<PainelSnapshot> {
  const recaptchaToken = await getRecaptchaToken("cliente_consulta");
  const resposta = await consultarPainel({
    data: {
      secao: "bootstrap",
      ...(forcar ? { forcar: true } : {}),
      ...(recaptchaToken ? { recaptchaToken } : {}),
    },
  });

  if (!resposta.ok) {
    throw resposta.expirado
      ? new SessaoExpiradaError(resposta.mensagem)
      : new Error(resposta.mensagem);
  }

  return normalizarPainel(resposta.dados);
}

export const painelQueryOptions = () =>
  queryOptions({
    queryKey: CHAVE_PAINEL,
    queryFn: () => carregarBootstrap(false),
    staleTime: CINCO_MINUTOS,
    gcTime: MEIA_HORA,
    /*
     * Sem repetição automática: quando o n8n recusa, ele recusa por um motivo
     * (token vencido, cadastro fora do ar), e insistir três vezes só atrasa a
     * mensagem que o cliente precisa ler.
     */
    retry: false,
    refetchOnWindowFocus: false,
  });

export function usePainel() {
  return useQuery(painelQueryOptions());
}

/** O botão "Atualizar": passa por cima do cache do navegador e do servidor. */
export function useAtualizarPainel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => carregarBootstrap(true),
    onSuccess: (retrato) => queryClient.setQueryData(CHAVE_PAINEL, retrato),
  });
}

export type EnvioFormulario = {
  formulario: FormularioPainel;
  dados: DadosPainel;
};

export type RespostaFormulario = {
  mensagem: string | undefined;
  dados: DadosPainel;
};

/**
 * Envia um formulário do painel ao webhook e traz a resposta de volta.
 *
 * Cada formulário viaja no seu próprio evento (veja `FORMULARIOS_PAINEL`), e é
 * a resposta do n8n que a tela mostra — protocolo de atendimento, PIX copia e
 * cola, data de agendamento. Nada aqui inventa um resultado: o que a tela
 * exibe depois do envio é o que voltou.
 */
export function useFormularioPainel() {
  const queryClient = useQueryClient();

  return useMutation<RespostaFormulario, Error, EnvioFormulario>({
    mutationFn: async ({ formulario, dados }) => {
      const recaptchaToken = await getRecaptchaToken("cliente_formulario");
      const resposta = await enviarFormularioPainel({
        data: { formulario, dados, ...(recaptchaToken ? { recaptchaToken } : {}) },
      });

      if (!resposta.ok) {
        throw resposta.expirado
          ? new SessaoExpiradaError(resposta.mensagem)
          : new Error(resposta.mensagem);
      }

      return { mensagem: resposta.mensagem, dados: resposta.dados };
    },

    onSuccess: (resposta, { formulario }) => {
      const atual = queryClient.getQueryData<PainelSnapshot>(CHAVE_PAINEL);

      // resposta que já traz as listas novas poupa a volta seguinte
      if (atual && respostaTrazPainel(resposta.dados)) {
        queryClient.setQueryData(CHAVE_PAINEL, mesclarPainel(atual, resposta.dados));
        return;
      }

      /*
       * Formulário que não muda nada — diagnóstico, viabilidade, medição de
       * velocidade — não desatualiza o painel. Recarregar depois dele seria
       * uma ida ao n8n para receber de volta exatamente o que já está na tela.
       */
      if (SECOES_AFETADAS[formulario].length === 0) return;

      /*
       * Mudou algo e a resposta não trouxe as listas novas: o retrato daqui
       * está velho. O servidor já derrubou o dele quando o formulário deu
       * certo, então a recarga vai ao n8n de verdade, e não ao cache.
       */
      void queryClient.invalidateQueries({ queryKey: CHAVE_PAINEL });
    },
  });
}

/**
 * O que fazer quando uma chamada do painel falha.
 *
 * Erro comum vira um aviso e a tela continua onde estava. Sessão expirada é
 * outra coisa: não adianta oferecer "tente de novo" a quem já não tem token —
 * o caminho é voltar ao login.
 */
export function useErroPainel() {
  const navigate = useNavigate();

  return (erro: unknown, padrao = "Não foi possível concluir agora. Tente de novo.") => {
    const mensagem = erro instanceof Error && erro.message ? erro.message : padrao;
    toast.error(mensagem);
    if (erro instanceof SessaoExpiradaError) void navigate({ to: "/cliente" });
  };
}
