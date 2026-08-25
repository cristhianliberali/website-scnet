/**
 * Os dois catálogos de plano, editados na mesma tela.
 *
 * `planos_web` é a vitrine (home e /contratacao) e `planos_upgrade` é a troca
 * de plano do painel. Um componente só, porque as colunas são as mesmas menos
 * uma: `codigo_oferta`, que restringe o plano a uma campanha e não existe no
 * upgrade — lá ninguém chega por URL com `?codigo_oferta=`.
 *
 * **Sem upload de imagem.** As logos dos agregados entram como URL, do mesmo
 * jeito que já entravam pelo Postgres. Guardar arquivo pede storage, limite de
 * tamanho e limpeza do que ficou órfão; colar um endereço não pede nada disso.
 */

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { moeda } from "@/lib/painel-formato";
import { PLANO_VAZIO, type CatalogoPlanos, type PlanoAdmin } from "@/lib/admin-tipos";
import {
  BotaoPerigo,
  BotaoSalvar,
  LinhaExpansivel,
  MarcaAdmin,
  SeloAdmin,
  TextoAdmin,
  TextoLongoAdmin,
  TituloBloco,
  Vazio,
} from "./admin-ui";

const DICA_LISTA = 'Itens separados por ";" — "Wi-Fi 6 incluso;Skeelo;Suporte 24h".';

export function SecaoPlanos({
  catalogo,
  planos,
  salvando,
  aoSalvar,
  aoExcluir,
}: {
  catalogo: CatalogoPlanos;
  planos: PlanoAdmin[];
  salvando: boolean;
  aoSalvar: (plano: PlanoAdmin) => void;
  aoExcluir: (idPlano: string) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<PlanoAdmin>(PLANO_VAZIO);

  const abrir = (plano: PlanoAdmin) => {
    setAberto(plano.idPlano);
    setRascunho(plano);
  };

  const novo = () => {
    setAberto("novo");
    // id vazio: o servidor calcula o próximo livre na hora de gravar
    setRascunho({ ...PLANO_VAZIO, ...(catalogo === "site" ? {} : { codigoOferta: undefined }) });
  };

  return (
    <div className="space-y-3">
      <TituloBloco
        acao={
          <Button type="button" size="sm" variant="brand" onClick={novo}>
            <Plus className="size-4" />
            Novo plano
          </Button>
        }
      >
        {catalogo === "site" ? "Planos do site" : "Planos da troca de plano"}
      </TituloBloco>

      <p className="font-body text-xs text-muted-foreground">
        {catalogo === "site"
          ? "Alimentam a home e o formulário de contratação. Um plano com código de oferta só aparece para quem chega com ?codigo_oferta= na URL."
          : "Alimentam a troca de plano do painel. O cliente só vê os de valor igual ou maior que o do contrato dele — quem quer descer fala com o comercial."}
      </p>

      {aberto === "novo" && (
        <Formulario
          catalogo={catalogo}
          plano={rascunho}
          aoMudar={setRascunho}
          salvando={salvando}
          aoSalvar={aoSalvar}
          aoCancelar={() => setAberto(null)}
        />
      )}

      {planos.length === 0 ? (
        <Vazio texto="Nenhum plano cadastrado neste catálogo." />
      ) : (
        <div className="space-y-2">
          {planos.map((plano) => (
            <LinhaExpansivel
              key={plano.idPlano}
              aberto={aberto === plano.idPlano}
              aoAlternar={() => (aberto === plano.idPlano ? setAberto(null) : abrir(plano))}
              resumo={
                <>
                  <span className="min-w-0">
                    <span className="block font-ui text-sm font-bold text-foreground">
                      {plano.nome || "(sem nome)"}
                    </span>
                    <span className="block font-body text-xs text-muted-foreground">
                      #{plano.idPlano} · {moeda(Number(plano.valor) || 0)} · ordem{" "}
                      {plano.ordemGrade}
                      {plano.codigoOferta ? ` · oferta ${plano.codigoOferta}` : ""}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {plano.destaque && <SeloAdmin texto="Destaque" tom="aberto" />}
                    <SeloAdmin
                      texto={plano.ativo ? "Ativo" : "Inativo"}
                      tom={plano.ativo ? "ok" : "off"}
                    />
                  </span>
                </>
              }
            >
              <Formulario
                catalogo={catalogo}
                plano={rascunho}
                aoMudar={setRascunho}
                salvando={salvando}
                aoSalvar={aoSalvar}
                aoCancelar={() => setAberto(null)}
                aoExcluir={() => aoExcluir(plano.idPlano)}
              />
            </LinhaExpansivel>
          ))}
        </div>
      )}
    </div>
  );
}

function Formulario({
  catalogo,
  plano,
  aoMudar,
  salvando,
  aoSalvar,
  aoCancelar,
  aoExcluir,
}: {
  catalogo: CatalogoPlanos;
  plano: PlanoAdmin;
  aoMudar: (plano: PlanoAdmin) => void;
  salvando: boolean;
  aoSalvar: (plano: PlanoAdmin) => void;
  aoCancelar: () => void;
  aoExcluir?: () => void;
}) {
  const campo = <K extends keyof PlanoAdmin>(chave: K, valor: PlanoAdmin[K]) =>
    aoMudar({ ...plano, [chave]: valor });

  function submeter(e: FormEvent) {
    e.preventDefault();
    aoSalvar(plano);
  }

  return (
    <form
      onSubmit={submeter}
      className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextoAdmin
          rotulo="ID do plano"
          valor={plano.idPlano}
          aoMudar={(v) => campo("idPlano", v.replace(/\D/g, ""))}
          dica="Em branco = próximo livre."
          inputMode="numeric"
        />
        <TextoAdmin
          rotulo="Ordem na grade"
          valor={plano.ordemGrade}
          aoMudar={(v) => campo("ordemGrade", v)}
          inputMode="numeric"
        />
        <TextoAdmin
          rotulo="Valor mensal"
          valor={plano.valor}
          aoMudar={(v) => campo("valor", v)}
          dica="Só o número: 129,90"
        />
        <TextoAdmin
          rotulo="Nome do selo"
          valor={plano.nomeDestaque}
          aoMudar={(v) => campo("nomeDestaque", v)}
          dica='Ex: "Mais escolhido"'
        />
      </div>

      <TextoAdmin rotulo="Nome" valor={plano.nome} aoMudar={(v) => campo("nome", v)} />

      <TextoLongoAdmin
        rotulo="Descrição"
        valor={plano.descricao}
        aoMudar={(v) => campo("descricao", v)}
        rows={2}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <TextoLongoAdmin
          rotulo="Composição"
          valor={plano.composicao}
          aoMudar={(v) => campo("composicao", v)}
          dica={DICA_LISTA}
        />
        <TextoLongoAdmin
          rotulo="URLs das logos"
          valor={plano.urlLogoAgregados}
          aoMudar={(v) => campo("urlLogoAgregados", v)}
          dica='Endereços de imagem separados por ";" — https://…/paramount.webp'
        />
      </div>

      <TextoAdmin
        rotulo="Resumo da composição"
        valor={plano.composicaoResumo}
        aoMudar={(v) => campo("composicaoResumo", v)}
        dica="A linha curta que aparece embaixo do preço."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextoAdmin
          rotulo="Valor das primeiras faturas"
          valor={plano.valorPrimeirasFaturas}
          aoMudar={(v) => campo("valorPrimeirasFaturas", v)}
          dica="Deixe vazio se não houver promoção."
        />
        <TextoAdmin
          rotulo="Meses com desconto"
          valor={plano.quantMesesDesconto}
          aoMudar={(v) => campo("quantMesesDesconto", v.replace(/\D/g, ""))}
          inputMode="numeric"
        />
        <TextoAdmin
          rotulo="Código MK"
          valor={plano.codigoMk}
          aoMudar={(v) => campo("codigoMk", v.replace(/\D/g, ""))}
          inputMode="numeric"
        />
        <TextoAdmin
          rotulo="Código da oferta MK"
          valor={plano.codigoOfertaMk}
          aoMudar={(v) => campo("codigoOfertaMk", v.replace(/\D/g, ""))}
          dica="Vai junto no pedido de troca."
          inputMode="numeric"
        />
      </div>

      {catalogo === "site" && (
        <TextoAdmin
          rotulo="Código de oferta (campanha)"
          valor={plano.codigoOferta ?? ""}
          aoMudar={(v) => campo("codigoOferta", v)}
          dica="Preenchido, o plano só aparece para quem chega com ?codigo_oferta= igual a este valor."
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <MarcaAdmin
          rotulo="Ativo"
          marcado={plano.ativo}
          aoMudar={(v) => campo("ativo", v)}
          dica="Desativado, some da tela sem perder o histórico."
        />
        <MarcaAdmin
          rotulo="Destaque"
          marcado={plano.destaque}
          aoMudar={(v) => campo("destaque", v)}
          dica="Vem escolhido por padrão na troca de plano."
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
        {aoExcluir && (
          <BotaoPerigo
            rotulo="Excluir"
            confirmacao="Excluir mesmo?"
            aoConfirmar={aoExcluir}
            desabilitado={salvando}
          />
        )}
        <Button type="button" size="sm" variant="outline" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <BotaoSalvar salvando={salvando} rotulo="Salvar plano" />
      </div>
    </form>
  );
}
