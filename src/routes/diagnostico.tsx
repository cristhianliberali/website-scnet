/**
 * `/diagnostico?token=...` — o que o servidor enxerga.
 *
 * Responde, sem precisar de terminal nem de log: **qual banco** este processo
 * abriu, **quais tabelas** ele acha, **quais planos** ele leria agora — e **por
 * que o reCAPTCHA está recusando os formulários**, que é a outra pergunta que
 * só o servidor sabe responder. Foi a falta dessas respostas que fez um erro de
 * configuração parecer um bug de código.
 *
 * **Fechada por padrão.** Sem `DIAGNOSTICO_TOKEN` no ambiente, a rota responde
 * 404 — não existe. Com a variável, só abre com o token certo, comparado em
 * tempo constante. Token errado também dá 404, e não 401: um 401 confirmaria a
 * quem está tentando que a página existe.
 */

import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { coletarDiagnostico, type Diagnostico } from "@/lib/diagnostico.server";

const buscaSchema = z.object({ token: z.string().optional() });

const carregar = createServerFn({ method: "GET" })
  .validator(z.object({ token: z.string() }))
  .handler(async ({ data }): Promise<Diagnostico | null> => {
    const { timingSafeEqual } = await import("node:crypto");
    const esperado = process.env["DIAGNOSTICO_TOKEN"]?.trim();
    if (!esperado) return null;

    const a = Buffer.from(data.token);
    const b = Buffer.from(esperado);
    // `timingSafeEqual` exige o mesmo tamanho; tamanho diferente já é recusa
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    return coletarDiagnostico();
  });

export const Route = createFileRoute("/diagnostico")({
  validateSearch: buscaSchema,
  loaderDeps: ({ search }) => ({ token: search.token ?? "" }),
  loader: async ({ deps }) => {
    const dados = await carregar({ data: { token: deps.token } });
    if (!dados) throw notFound();
    return { dados };
  },
  head: () => ({ meta: [{ title: "Diagnóstico" }, { name: "robots", content: "noindex" }] }),
  component: Pagina,
});

function Pagina() {
  const { dados } = Route.useLoaderData();
  const problemas = listarProblemas(dados);

  return (
    <div className="min-h-screen bg-slate-950 p-6 font-mono text-sm text-slate-200">
      <h1 className="mb-4 text-lg font-bold text-white">Diagnóstico do servidor</h1>

      {problemas.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="mb-2 font-bold text-amber-300">O que está errado agora</p>
          <ul className="list-inside list-disc space-y-1 text-amber-100">
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-4">
        {JSON.stringify(dados, null, 2)}
      </pre>
    </div>
  );
}

/** Lê o relatório e diz, em português, o que impede o site de funcionar. */
function listarProblemas(d: Diagnostico): string[] {
  const problemas: string[] = [...problemasDoRecaptcha(d)];

  if (!d.conexao.ok) {
    problemas.push(`Sem conexão com o Postgres: ${d.conexao.erro ?? "motivo desconhecido"}`);
    return problemas;
  }

  problemas.push(
    `O site está lendo o banco "${d.conexao.banco}" em ${d.conexao.servidor}:${d.conexao.porta}` +
      " — confira se é o mesmo banco em que você rodou o SQL e editou os planos.",
  );

  return [...problemas, ...problemasDoBanco(d)];
}

/**
 * Por que o formulário não deixa enviar.
 *
 * A ordem aqui é a das causas: primeiro as de configuração, que barram 100% dos
 * clientes e são invisíveis, depois o que o Google vem respondendo de fato.
 */
function problemasDoRecaptcha(d: Diagnostico): string[] {
  const r = d.recaptcha;
  const problemas: string[] = [];

  if (!r.verificacao_ligada) {
    // Sem secret nada é bloqueado por reCAPTCHA — dizer isso evita procurar
    // o problema no lugar errado.
    if (r.site_key_no_bundle) {
      problemas.push(
        "reCAPTCHA: a chave secreta (RECAPTCHA_SECRET_KEY) NÃO está no servidor, então a " +
          "verificação está desligada e nenhum envio é recusado por ela. Se um formulário não " +
          "está enviando, o motivo é outro.",
      );
    }
    return problemas;
  }

  if (!r.site_key_no_bundle) {
    problemas.push(
      "reCAPTCHA BLOQUEANDO TUDO: a chave secreta está no servidor, mas a chave pública " +
        "(VITE_RECAPTCHA_SITE_KEY) não entrou no build — o navegador não tem como gerar o token, " +
        "e o servidor recusa todo envio sem token. No EasyPanel, variável VITE_* precisa estar " +
        'também em "Build Args" e o serviço precisa ser reconstruído (só Environment Variable não ' +
        "basta). Solução imediata: apague a RECAPTCHA_SECRET_KEY para destravar os formulários.",
    );
  }

  const bloqueios = r.ultimos_bloqueios;
  if (bloqueios.length > 0) {
    const contagem = new Map<string, number>();
    for (const b of bloqueios) contagem.set(b.motivo, (contagem.get(b.motivo) ?? 0) + 1);
    const resumo = [...contagem.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([motivo, n]) => `${motivo} (${n}x)`)
      .join(", ");
    problemas.push(`reCAPTCHA — últimas recusas: ${resumo}. Detalhe completo no JSON abaixo.`);

    const explica: Record<string, string> = {
      missing_token:
        "o navegador não gerou token. Ou a chave pública não está no build, ou o domínio do site " +
        "não está na lista de domínios da chave no painel do reCAPTCHA, ou um bloqueador de " +
        "anúncios impediu o script do Google de carregar.",
      "invalid-input-response":
        "o Google não reconheceu o token. A causa quase sempre é chave pública e chave secreta " +
        "de REGISTROS DIFERENTES, ou uma chave v2 usada com o código v3. As duas precisam sair " +
        "do mesmo registro reCAPTCHA v3.",
      "timeout-or-duplicate":
        "o token venceu (vale 2 minutos) ou foi reenviado. Acontece na última etapa da " +
        "contratação quando o upload dos documentos demora — enviar de novo resolve.",
      hostname_mismatch:
        `o token foi emitido em outro domínio, e o site espera "${r.hostname_esperado ?? "?"}" ` +
        "(vem de VITE_SITE_URL). Ajuste a VITE_SITE_URL para o domínio pelo qual as pessoas " +
        "realmente acessam o site.",
      action_mismatch: "o token foi gerado para outra ação — normalmente cache de página antiga.",
    };
    for (const [motivo, texto] of Object.entries(explica)) {
      if ([...contagem.keys()].some((m) => m.includes(motivo))) {
        problemas.push(`reCAPTCHA "${motivo}": ${texto}`);
      }
    }
    if ([...contagem.keys()].some((m) => m.startsWith("score_baixo"))) {
      problemas.push(
        `reCAPTCHA: gente real está sendo reprovada por score abaixo de ${r.min_score}. ` +
          "Site novo ou de pouco tráfego recebe score baixo do Google por meses. Baixe o corte " +
          "com RECAPTCHA_MIN_SCORE (ex.: 0.1) ou use 0 para não bloquear por score — não precisa " +
          "de novo build, é variável de runtime.",
      );
    }
  }

  return problemas;
}

/** A parte do relatório que depende do banco. */
function problemasDoBanco(d: Diagnostico): string[] {
  const problemas: string[] = [];

  for (const t of d.tabelas) {
    if (!t.existe) problemas.push(`A tabela ${d.schema}.${t.nome} NÃO existe neste banco.`);
    else if (t.erro) problemas.push(`${d.schema}.${t.nome}: ${t.erro}`);
  }

  if (d.colunas_faltando_em_clientes_web.length > 0) {
    problemas.push(
      `Faltam colunas em clientes_web: ${d.colunas_faltando_em_clientes_web.join(", ")}. ` +
        "Sem elas a consulta do painel falha inteira e a tela cai no webhook.",
    );
  }

  if (d.planos.erro) {
    problemas.push(`Planos: ${d.planos.erro}`);
  } else if (d.planos.total === 0) {
    problemas.push(
      `${d.planos.tabela} está VAZIA — nenhuma linha. A home não tem o que mostrar. ` +
        "Se você editou planos e eles não aparecem aqui, foi em outro banco.",
    );
  } else if (d.planos.ativos.length === 0) {
    problemas.push(
      `${d.planos.tabela} tem ${d.planos.total} linha(s), mas nenhuma com ativo = true.`,
    );
  } else if (d.planos.aparecem_na_home === 0) {
    problemas.push(
      `Os ${d.planos.ativos.length} planos ativos têm "codigo_oferta" preenchido, ou seja, são ` +
        "de campanha: a home só os mostra com ?codigo_oferta=<código> na URL. Para um plano " +
        "aparecer sempre, deixe codigo_oferta nulo.",
    );
  }

  return problemas;
}
