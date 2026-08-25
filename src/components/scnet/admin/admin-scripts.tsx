/**
 * As tags do site — Google Tag Manager, pixels, chat — coladas sem deploy.
 *
 * **O que esta tela faz de verdade.** O que for colado aqui vira HTML na página
 * de todo visitante, exatamente como foi colado. Não há filtro nem correção: é
 * essa fidelidade que faz um Tag Manager funcionar, e é ela também que torna
 * esta a tela mais poderosa do /admin. Daí o aviso em cima da lista, que não é
 * decoração.
 *
 * **Três posições, e a escolha importa.** A ferramenta que gera o código sempre
 * diz onde ele vai; o texto de ajuda de cada posição repete isso, porque
 * "colei no lugar errado" é o motivo mais comum de uma tag não medir nada.
 *
 * **Ligado/desligado em vez de apagar.** Desligar tira da página e mantém o
 * código guardado. Um GTM configurado que se apaga para "testar sem ele" é um
 * GTM que se reconfigura depois.
 */

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  POSICOES_SCRIPT,
  SCRIPT_VAZIO,
  type PosicaoScript,
  type ScriptAdmin,
} from "@/lib/admin-tipos";
import {
  BotaoPerigo,
  BotaoSalvar,
  LinhaExpansivel,
  MarcaAdmin,
  SelecaoAdmin,
  SeloAdmin,
  TextoAdmin,
  TextoLongoAdmin,
  TituloBloco,
  Vazio,
} from "./admin-ui";

const OPCOES_POSICAO = (Object.keys(POSICOES_SCRIPT) as PosicaoScript[]).map(
  (p) => [p, POSICOES_SCRIPT[p].rotulo] as const,
);

/** A ordem em que as posições aparecem agrupadas na lista. */
const ORDEM: PosicaoScript[] = ["head", "body_inicio", "body_fim"];

export function SecaoScripts({
  scripts,
  salvando,
  aoSalvar,
  aoExcluir,
}: {
  scripts: ScriptAdmin[];
  salvando: boolean;
  aoSalvar: (script: ScriptAdmin) => void;
  aoExcluir: (id: string) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<ScriptAdmin>(SCRIPT_VAZIO);

  const abrir = (script: ScriptAdmin) => {
    setAberto(script.id);
    setRascunho(script);
  };

  const novo = () => {
    setAberto("novo");
    // id vazio: o servidor gera um ao gravar
    setRascunho(SCRIPT_VAZIO);
  };

  const campo = <K extends keyof ScriptAdmin>(chave: K, valor: ScriptAdmin[K]) =>
    setRascunho({ ...rascunho, [chave]: valor });

  function submeter(e: FormEvent) {
    e.preventDefault();
    aoSalvar(rascunho);
    setAberto(null);
  }

  const ativos = scripts.filter((s) => s.ativo).length;

  return (
    <div className="space-y-3">
      <TituloBloco
        acao={
          <Button type="button" size="sm" variant="brand" onClick={novo}>
            <Plus className="size-4" />
            Novo script
          </Button>
        }
      >
        Scripts e tags
      </TituloBloco>

      <p className="font-body text-xs text-muted-foreground">
        Cole aqui o código do Google Tag Manager, Google Analytics, pixels ou chat. Vale para o site
        inteiro e para a área do cliente, e passa a valer na próxima página carregada — sem novo
        deploy. {ativos > 0 && `${ativos} ativo${ativos > 1 ? "s" : ""} agora.`}
      </p>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
        <p className="font-body text-xs text-amber-900">
          <strong>O código roda no navegador de todos os visitantes</strong>, exatamente como for
          colado. Cole só o que veio da ferramenta oficial. Se um script quebrar a página, volte
          aqui e desligue — o /admin nunca recebe estas tags, então esta tela continua funcionando
          mesmo que o site pare.
        </p>
      </div>

      {aberto === "novo" && (
        <form
          onSubmit={submeter}
          className="space-y-3 rounded-xl border border-brand/50 p-3 sm:p-4"
        >
          <Formulario rascunho={rascunho} campo={campo} />
          <div className="flex flex-wrap gap-2">
            <BotaoSalvar salvando={salvando} rotulo="Incluir script" />
            <Button type="button" size="sm" variant="outline" onClick={() => setAberto(null)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {scripts.length === 0 && aberto !== "novo" && (
        <Vazio texto="Nenhum script cadastrado. O site vai ao ar sem nenhuma tag." />
      )}

      {ORDEM.filter((p) => scripts.some((s) => s.posicao === p)).map((p) => (
        <div key={p} className="space-y-2">
          <p className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {POSICOES_SCRIPT[p].rotulo}
          </p>
          {scripts
            .filter((s) => s.posicao === p)
            .map((script) => (
              <LinhaExpansivel
                key={script.id}
                aberto={aberto === script.id}
                aoAlternar={() => (aberto === script.id ? setAberto(null) : abrir(script))}
                resumo={
                  <>
                    <span className="min-w-0">
                      <span className="block truncate font-ui text-sm font-bold text-foreground">
                        {script.nome || "(sem nome)"}
                      </span>
                      <span className="block truncate font-body text-xs text-muted-foreground">
                        {primeiraLinha(script.codigo)}
                      </span>
                    </span>
                    <SeloAdmin
                      texto={script.ativo ? "ativo" : "desligado"}
                      tom={script.ativo ? "ok" : "off"}
                    />
                  </>
                }
              >
                <form onSubmit={submeter} className="space-y-3">
                  <Formulario rascunho={rascunho} campo={campo} />
                  <div className="flex flex-wrap gap-2">
                    <BotaoSalvar salvando={salvando} />
                    <BotaoPerigo
                      rotulo="Excluir"
                      confirmacao="Excluir mesmo?"
                      desabilitado={salvando}
                      aoConfirmar={() => {
                        aoExcluir(script.id);
                        setAberto(null);
                      }}
                    />
                    {script.atualizadoEm && (
                      <span className="self-center font-body text-xs text-muted-foreground">
                        alterado em {new Date(script.atualizadoEm).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>
                </form>
              </LinhaExpansivel>
            ))}
        </div>
      ))}
    </div>
  );
}

function Formulario({
  rascunho,
  campo,
}: {
  rascunho: ScriptAdmin;
  campo: <K extends keyof ScriptAdmin>(chave: K, valor: ScriptAdmin[K]) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextoAdmin
          rotulo="Nome"
          valor={rascunho.nome}
          aoMudar={(v) => campo("nome", v)}
          placeholder="Google Tag Manager"
          dica="Só para você reconhecer na lista."
        />
        <SelecaoAdmin
          rotulo="Onde inserir"
          valor={rascunho.posicao}
          opcoes={OPCOES_POSICAO}
          aoMudar={(v) => campo("posicao", v)}
          dica={POSICOES_SCRIPT[rascunho.posicao].ajuda}
        />
      </div>

      <TextoLongoAdmin
        rotulo="Código"
        valor={rascunho.codigo}
        aoMudar={(v) => campo("codigo", v)}
        rows={10}
        dica="Cole o trecho inteiro que a ferramenta forneceu, com as tags <script> ou <noscript>. Não inclua <html>, <head> ou <body>."
      />

      <MarcaAdmin
        rotulo="Ativo"
        marcado={rascunho.ativo}
        aoMudar={(v) => campo("ativo", v)}
        dica="Desligado, o código fica guardado aqui mas não vai para a página."
      />
    </>
  );
}

/** Um pedaço do código para identificar a linha sem abrir. */
function primeiraLinha(codigo: string): string {
  const linha = codigo
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "" && !l.startsWith("<!--"));
  return (linha ?? codigo.trim()).slice(0, 90);
}
