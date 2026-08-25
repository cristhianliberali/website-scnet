/**
 * O anti-robô: o que está acontecendo com ele, e o interruptor.
 *
 * **Por que esta tela existe.** O reCAPTCHA passou a recusar clientes de
 * verdade, e nem o motivo nem o desligamento estavam ao alcance de quem atende:
 * o motivo só aparecia no log do servidor, e desligar exigia apagar uma variável
 * no painel do container e reiniciar. Enquanto isso, nenhum pedido entra.
 *
 * Então a tela faz duas coisas, nesta ordem de importância:
 *
 * 1. **Diz o que está errado**, em português, a partir do que só o servidor
 *    sabe: se a chave pública entrou no build, se a secreta existe, e o motivo
 *    das últimas recusas direto do Google.
 * 2. **Deixa desligar em dez segundos**, de qualquer lugar, sem deploy.
 *
 * Desligar não deixa o site sem defesa: o limite por IP (15 envios por minuto,
 * depois 5 minutos de bloqueio) continua valendo, e é ele que segura a enxurrada
 * — o reCAPTCHA cuida do visitante individual.
 */

import { useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck } from "lucide-react";

import type { ConfigSeguranca, DiagnosticoSeguranca } from "@/lib/admin-tipos";
import { BotaoSalvar, Cartao, MarcaAdmin, TextoAdmin, TituloBloco, Vazio } from "./admin-ui";

/** O que cada motivo do Google quer dizer, e o que fazer com ele. */
const EXPLICACAO: { chave: string; titulo: string; texto: string }[] = [
  {
    chave: "missing_token",
    titulo: "O navegador não gerou o código de verificação",
    texto:
      "É o caso mais comum. Ou a chave pública não entrou no build (veja o quadro acima), ou o " +
      "endereço do site não está na lista de domínios da chave, no painel do reCAPTCHA do Google.",
  },
  {
    chave: "invalid-input-response",
    titulo: "O Google não reconheceu o código",
    texto:
      "Quase sempre a chave pública e a secreta são de REGISTROS diferentes, ou uma delas é do " +
      'reCAPTCHA v2. As duas precisam sair do mesmo registro, do tipo v3 ("pontuação").',
  },
  {
    chave: "timeout-or-duplicate",
    titulo: "O código expirou",
    texto:
      "Ele vale 2 minutos. Acontece na última etapa da contratação, quando o envio dos documentos " +
      "demora. Enviar de novo resolve, e o cliente já recebe essa instrução.",
  },
  {
    chave: "hostname_mismatch",
    titulo: "O endereço do site não bate",
    texto:
      "O código foi gerado em outro domínio. Ajuste VITE_SITE_URL para o endereço pelo qual as " +
      "pessoas realmente acessam o site.",
  },
  {
    chave: "score_baixo",
    titulo: "Gente real está sendo reprovada pela pontuação",
    texto:
      "O Google calibra a pontuação por volume de acesso: site novo ou de pouco movimento recebe " +
      "nota baixa de pessoas reais por semanas. Baixe o corte aqui embaixo para 0.1 — ou 0, que " +
      "para de bloquear por pontuação sem desligar o resto.",
  },
];

export function SecaoSeguranca({
  seguranca,
  diagnostico,
  salvando,
  aoSalvar,
}: {
  seguranca: ConfigSeguranca;
  diagnostico: DiagnosticoSeguranca;
  salvando: boolean;
  aoSalvar: (config: ConfigSeguranca) => void;
}) {
  const [rascunho, setRascunho] = useState<ConfigSeguranca>(seguranca);

  function submeter(e: FormEvent) {
    e.preventDefault();
    aoSalvar(rascunho);
  }

  const { siteKeyNoBundle, secretNoServidor, ultimosBloqueios } = diagnostico;
  const verificando = secretNoServidor && seguranca.recaptchaAtivo;
  const bloqueandoTudo = verificando && !siteKeyNoBundle;

  const motivos = new Set(ultimosBloqueios.map((b) => b.motivo));
  const relevantes = EXPLICACAO.filter((e) => [...motivos].some((m) => m.includes(e.chave)));

  return (
    <div className="space-y-4">
      <TituloBloco>Anti-robô (reCAPTCHA)</TituloBloco>

      <Estado
        verificando={verificando}
        bloqueandoTudo={bloqueandoTudo}
        secretNoServidor={secretNoServidor}
        ativo={seguranca.recaptchaAtivo}
      />

      <Cartao>
        <p className="mb-3 font-ui text-sm font-bold text-foreground">O que o servidor enxerga</p>
        <dl className="space-y-2">
          <Linha
            rotulo="Chave pública no site (VITE_RECAPTCHA_SITE_KEY)"
            ok={siteKeyNoBundle}
            simNao={siteKeyNoBundle ? "presente" : "AUSENTE"}
          />
          <Linha
            rotulo="Chave secreta no servidor (RECAPTCHA_SECRET_KEY)"
            ok={secretNoServidor}
            simNao={secretNoServidor ? "presente" : "ausente — nada é verificado"}
          />
          <Linha
            rotulo="Corte de pontuação em vigor"
            ok
            simNao={String(diagnostico.minScoreEmVigor)}
          />
          <Linha
            rotulo="Endereço esperado do site"
            ok={diagnostico.hostnameEsperado !== ""}
            simNao={diagnostico.hostnameEsperado || "(VITE_SITE_URL não definida)"}
          />
        </dl>
      </Cartao>

      <Cartao>
        <p className="mb-1 font-ui text-sm font-bold text-foreground">Últimas recusas</p>
        <p className="mb-3 font-body text-xs text-muted-foreground">
          Guardadas na memória do servidor desde o último reinício. Lista vazia com o anti-robô
          ligado quer dizer que ninguém foi barrado — se mesmo assim um formulário não envia, o
          motivo é outro.
        </p>

        {ultimosBloqueios.length === 0 ? (
          <Vazio texto="Nenhuma recusa registrada." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse font-body text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 pr-3 font-ui font-bold">Quando</th>
                  <th className="py-1 pr-3 font-ui font-bold">Formulário</th>
                  <th className="py-1 pr-3 font-ui font-bold">Motivo</th>
                  <th className="py-1 font-ui font-bold">Nota</th>
                </tr>
              </thead>
              <tbody>
                {ultimosBloqueios.map((b, i) => (
                  <tr key={`${b.em}-${i}`} className="border-t border-border/60">
                    <td className="whitespace-nowrap py-1.5 pr-3">
                      {new Date(b.em).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-1.5 pr-3">{b.formulario}</td>
                    <td className="py-1.5 pr-3 font-mono">{b.motivo}</td>
                    <td className="py-1.5">{b.score ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {relevantes.map((e) => (
          <div key={e.chave} className="mt-3 rounded-lg border border-border bg-secondary/40 p-3">
            <p className="font-ui text-xs font-bold text-foreground">{e.titulo}</p>
            <p className="mt-1 font-body text-xs text-muted-foreground">{e.texto}</p>
          </div>
        ))}
      </Cartao>

      <Cartao>
        <form onSubmit={submeter} className="space-y-3">
          <p className="font-ui text-sm font-bold text-foreground">Ajustes</p>

          <MarcaAdmin
            rotulo="Anti-robô ligado"
            marcado={rascunho.recaptchaAtivo}
            aoMudar={(v) => setRascunho({ ...rascunho, recaptchaAtivo: v })}
            dica={
              "Desmarque para destravar os formulários AGORA, sem deploy. O limite por IP continua " +
              "valendo. Use enquanto conserta a configuração das chaves."
            }
          />

          <TextoAdmin
            rotulo="Corte de pontuação"
            valor={rascunho.minScore}
            aoMudar={(v) => setRascunho({ ...rascunho, minScore: v })}
            placeholder="0.3"
            inputMode="decimal"
            dica={
              "De 0 a 1. Abaixo disso o envio é recusado. 0 não bloqueia por pontuação (o resto da " +
              "verificação continua). Vazio usa o valor da variável de ambiente."
            }
          />

          <BotaoSalvar salvando={salvando} rotulo="Salvar segurança" />
        </form>
      </Cartao>
    </div>
  );
}

/** O veredito em uma frase, no topo — é a primeira coisa que se lê numa urgência. */
function Estado({
  verificando,
  bloqueandoTudo,
  secretNoServidor,
  ativo,
}: {
  verificando: boolean;
  bloqueandoTudo: boolean;
  secretNoServidor: boolean;
  ativo: boolean;
}) {
  if (bloqueandoTudo) {
    return (
      <Aviso
        tom="ruim"
        icone={ShieldAlert}
        titulo="O anti-robô está recusando TODOS os envios"
        texto={
          "A chave secreta está no servidor, mas a chave pública não entrou no site: o navegador " +
          "não tem como gerar o código, e sem código o envio é recusado. No EasyPanel, a " +
          "VITE_RECAPTCHA_SITE_KEY precisa estar também em Build Args e o serviço precisa ser " +
          "reconstruído — só Environment Variable não basta. Enquanto isso, desmarque o " +
          '"Anti-robô ligado" aqui embaixo para os formulários voltarem imediatamente.'
        }
      />
    );
  }

  if (!secretNoServidor) {
    return (
      <Aviso
        tom="neutro"
        icone={AlertTriangle}
        titulo="O anti-robô está desligado (sem chave secreta)"
        texto={
          "Nenhum envio é recusado por reCAPTCHA. Se um formulário não está enviando, o motivo é " +
          "outro — veja os Atendimentos ou o log do webhook."
        }
      />
    );
  }

  if (!ativo) {
    return (
      <Aviso
        tom="neutro"
        icone={AlertTriangle}
        titulo="Anti-robô desligado por aqui"
        texto={
          "Os formulários estão aceitando envios sem verificação. O limite por IP continua " +
          "valendo. Lembre de religar quando a configuração das chaves estiver correta."
        }
      />
    );
  }

  return (
    <Aviso
      tom="bom"
      icone={verificando ? ShieldCheck : CheckCircle2}
      titulo="Anti-robô ligado e configurado"
      texto="As duas chaves estão no lugar. Se ainda assim alguém não consegue enviar, veja as últimas recusas abaixo."
    />
  );
}

function Aviso({
  tom,
  icone: Icone,
  titulo,
  texto,
}: {
  tom: "bom" | "ruim" | "neutro";
  icone: typeof ShieldCheck;
  titulo: string;
  texto: string;
}) {
  const cor =
    tom === "ruim"
      ? "border-red-300 bg-red-50 text-red-900"
      : tom === "neutro"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <div className={`flex gap-3 rounded-xl border p-4 ${cor}`}>
      <Icone className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0">
        <p className="font-ui text-sm font-bold">{titulo}</p>
        <p className="mt-1 font-body text-xs">{texto}</p>
      </div>
    </div>
  );
}

function Linha({ rotulo, ok, simNao }: { rotulo: string; ok: boolean; simNao: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2 last:border-0">
      <dt className="font-body text-xs text-muted-foreground">{rotulo}</dt>
      <dd className={`font-ui text-xs font-bold ${ok ? "text-emerald-700" : "text-red-700"}`}>
        {simNao}
      </dd>
    </div>
  );
}
