/**
 * Os ajustes da seção de indicação — o que o cliente vê e o que ele ganha.
 *
 * Três blocos, e cada um muda uma coisa diferente:
 *
 * 1. **Interruptor.** Desligado, a indicação some da área do cliente inteira:
 *    banner da visão geral, item da grade, item da navegação e a própria URL do
 *    serviço. Não é "esconder o botão" — um serviço que ainda responde por link
 *    direto continua ligado.
 * 2. **Texto.** Título e descrição da seção, sem deploy.
 * 3. **Campanha vigente.** O carimbo que as **próximas** indicações vão
 *    receber. As que já existem ficam com o que receberam no dia — é por isso
 *    que o cliente consegue ver, no extrato, campanhas diferentes lado a lado.
 */

import { useState, type FormEvent } from "react";

import { TAMANHO_BANNER, type ConfigIndicacao, type TipoBonus } from "@/lib/admin-tipos";
import { LIMITE_ADMIN } from "@/lib/form-limits";
import { OPCOES_BONUS } from "./admin-indicacoes";
import {
  BotaoSalvar,
  Cartao,
  MarcaAdmin,
  SelecaoAdmin,
  TextoAdmin,
  TextoLongoAdmin,
  TituloBloco,
} from "./admin-ui";

const medida = (lado: "desktop" | "mobile") => {
  const { largura, altura, proporcao } = TAMANHO_BANNER[lado];
  return `${largura} × ${altura} px (${proporcao})`;
};

export function SecaoConfig({
  config,
  salvando,
  aoSalvar,
}: {
  config: ConfigIndicacao;
  salvando: boolean;
  aoSalvar: (config: ConfigIndicacao) => void;
}) {
  const [rascunho, setRascunho] = useState<ConfigIndicacao>(config);

  const campo = <K extends keyof ConfigIndicacao>(chave: K, valor: ConfigIndicacao[K]) =>
    setRascunho({ ...rascunho, [chave]: valor });

  function submeter(e: FormEvent) {
    e.preventDefault();
    aoSalvar(rascunho);
  }

  const emDinheiro =
    rascunho.campanhaTipoBonus === "pix" || rascunho.campanhaTipoBonus === "desconto_fatura";

  return (
    <form onSubmit={submeter} className="space-y-4">
      <TituloBloco>Seção de indicação</TituloBloco>

      <Cartao>
        <MarcaAdmin
          rotulo="Indicação ativa na área do cliente"
          marcado={rascunho.ativo}
          aoMudar={(v) => campo("ativo", v)}
          dica="Desligada, some o banner, o item da grade, o item da navegação e o próprio endereço do serviço."
        />
      </Cartao>

      <Cartao className="space-y-3">
        <p className="font-ui text-sm font-bold text-foreground">Texto da seção</p>
        <TextoAdmin
          rotulo="Título"
          valor={rascunho.titulo}
          aoMudar={(v) => campo("titulo", v)}
          maxLength={LIMITE_ADMIN.config.titulo}
          dica="Aparece no banner da visão geral e no topo da tela de indicações."
        />
        <TextoLongoAdmin
          rotulo="Descrição"
          valor={rascunho.descricao}
          aoMudar={(v) => campo("descricao", v)}
          rows={2}
          maxLength={LIMITE_ADMIN.config.descricao}
        />
      </Cartao>

      <Cartao className="space-y-3">
        <p className="font-ui text-sm font-bold text-foreground">Banner do formulário</p>
        <p className="font-body text-xs text-muted-foreground">
          Aparece no topo do formulário de indicação. São duas artes, e não a mesma redimensionada:
          um banner desenhado em {TAMANHO_BANNER.desktop.proporcao} vira uma tira ilegível no
          celular. Sem URL, nenhum espaço é reservado — a tela começa direto no formulário.
        </p>

        <div className="grid gap-3 lg:grid-cols-2">
          <TextoAdmin
            rotulo="Banner desktop (URL)"
            valor={rascunho.bannerDesktopUrl}
            aoMudar={(v) => campo("bannerDesktopUrl", v)}
            maxLength={LIMITE_ADMIN.config.bannerUrl}
            placeholder="https://…/banner-indique.webp"
            dica={`${medida("desktop")} · JPG, PNG ou WebP · até ~300 KB`}
          />
          <TextoAdmin
            rotulo="Banner celular (URL)"
            valor={rascunho.bannerMobileUrl}
            aoMudar={(v) => campo("bannerMobileUrl", v)}
            maxLength={LIMITE_ADMIN.config.bannerUrl}
            placeholder="https://…/banner-indique-mobile.webp"
            dica={`${medida("mobile")} · JPG, PNG ou WebP · até ~200 KB`}
          />
          <TextoAdmin
            rotulo="Texto alternativo"
            valor={rascunho.bannerAlt}
            aoMudar={(v) => campo("bannerAlt", v)}
            maxLength={LIMITE_ADMIN.config.bannerAlt}
            dica="Descreve a imagem para quem usa leitor de tela. Vazio = decoração, e o leitor pula."
          />
          <TextoAdmin
            rotulo="Link do banner (opcional)"
            valor={rascunho.bannerLink}
            aoMudar={(v) => campo("bannerLink", v)}
            maxLength={LIMITE_ADMIN.config.bannerLink}
            placeholder="https://…/regulamento"
            dica="Para onde o banner leva. Vazio, ele é só imagem."
          />
        </div>

        <Previa config={rascunho} />
      </Cartao>

      <Cartao className="space-y-3">
        <p className="font-ui text-sm font-bold text-foreground">Campanha vigente</p>
        <p className="font-body text-xs text-muted-foreground">
          É o que as <strong>próximas</strong> indicações vão valer. As que já existem ficam com o
          bônus do dia em que foram enviadas — para corrigir uma delas, use a aba Indicações.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          <TextoAdmin
            rotulo="Nome da campanha"
            valor={rascunho.campanhaNome}
            aoMudar={(v) => campo("campanhaNome", v)}
            maxLength={LIMITE_ADMIN.config.campanhaNome}
            placeholder="Ex: Indique e Ganhe 2026"
          />
          <SelecaoAdmin
            rotulo="Tipo de pagamento do bônus"
            valor={rascunho.campanhaTipoBonus}
            opcoes={OPCOES_BONUS}
            aoMudar={(v: TipoBonus) => campo("campanhaTipoBonus", v)}
          />
          <TextoAdmin
            rotulo="Valor por indicação"
            valor={rascunho.campanhaValor}
            aoMudar={(v) => campo("campanhaValor", v)}
            maxLength={LIMITE_ADMIN.config.campanhaValor}
            placeholder="50,00"
            disabled={!emDinheiro}
            dica={emDinheiro ? "Em reais." : "Só para PIX e desconto em fatura."}
          />
        </div>

        <TextoLongoAdmin
          rotulo="Condição do bônus"
          valor={rascunho.campanhaDescricaoBonus}
          aoMudar={(v) => campo("campanhaDescricaoBonus", v)}
          rows={2}
          maxLength={LIMITE_ADMIN.config.campanhaDescricaoBonus}
          dica="O texto que o cliente lê no extrato, ao lado de cada indicação desta campanha."
        />
      </Cartao>

      <div className="flex justify-end">
        <BotaoSalvar salvando={salvando} rotulo="Salvar configuração" />
      </div>
    </form>
  );
}

/**
 * A prévia do banner.
 *
 * Vale o espaço que ocupa: a diferença entre a arte certa e a esticada só
 * aparece quando ela está na largura de verdade, e descobrir isso depois de
 * publicar custa uma volta inteira.
 */
function Previa({ config }: { config: ConfigIndicacao }) {
  if (!config.bannerDesktopUrl && !config.bannerMobileUrl) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-secondary/40 p-3">
      <p className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Prévia
      </p>
      <div className="grid gap-3 lg:grid-cols-[3fr_1fr]">
        {config.bannerDesktopUrl && (
          <img
            src={config.bannerDesktopUrl}
            alt=""
            className="w-full rounded-lg border border-border object-cover"
          />
        )}
        {config.bannerMobileUrl && (
          <img
            src={config.bannerMobileUrl}
            alt=""
            className="w-full max-w-[240px] rounded-lg border border-border object-cover"
          />
        )}
      </div>
    </div>
  );
}
