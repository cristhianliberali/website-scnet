/**
 * `/diagnostico?token=...` — o que o servidor enxerga do Postgres.
 *
 * Responde, sem precisar de terminal nem de log: **qual banco** este processo
 * abriu, **quais tabelas** ele acha, e **quais planos** ele leria agora. Foi a
 * falta dessas três respostas que fez um erro de configuração parecer um bug de
 * código.
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
      <h1 className="mb-4 text-lg font-bold text-white">Diagnóstico do Postgres</h1>

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
  const problemas: string[] = [];

  if (!d.conexao.ok) {
    problemas.push(`Sem conexão com o Postgres: ${d.conexao.erro ?? "motivo desconhecido"}`);
    return problemas;
  }

  problemas.push(
    `O site está lendo o banco "${d.conexao.banco}" em ${d.conexao.servidor}:${d.conexao.porta}` +
      " — confira se é o mesmo banco em que você rodou o SQL e editou os planos.",
  );

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
